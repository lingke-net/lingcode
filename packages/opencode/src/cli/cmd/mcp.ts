import { cmd } from "./cmd"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { MCP } from "../../mcp"
import { McpAuth } from "../../mcp/auth"
import { McpOAuthProvider } from "../../mcp/oauth-provider"
import { Config } from "../../config"
import { ConfigMCP } from "../../config/mcp"
import { Instance } from "../../project/instance"
import { Installation } from "../../installation"
import { InstallationVersion } from "../../installation/version"
import path from "path"
import { Global } from "../../global"
import { modify, applyEdits } from "jsonc-parser"
import { Filesystem } from "../../util"
import { Bus } from "../../bus"
import { AppRuntime } from "../../effect/app-runtime"
import { Effect } from "effect"

function getAuthStatusIcon(status: MCP.AuthStatus): string {
  switch (status) {
    case "authenticated":
      return "✓"
    case "expired":
      return "⚠"
    case "not_authenticated":
      return "✗"
  }
}

function getAuthStatusText(status: MCP.AuthStatus): string {
  switch (status) {
    case "authenticated":
      return "已认证"
    case "expired":
      return "已过期"
    case "not_authenticated":
      return "未认证"
  }
}

type McpEntry = NonNullable<Config.Info["mcp"]>[string]

type McpConfigured = ConfigMCP.Info
function isMcpConfigured(config: McpEntry): config is McpConfigured {
  return typeof config === "object" && config !== null && "type" in config
}

type McpRemote = Extract<McpConfigured, { type: "remote" }>
function isMcpRemote(config: McpEntry): config is McpRemote {
  return isMcpConfigured(config) && config.type === "remote"
}

function configuredServers(config: Config.Info) {
  return Object.entries(config.mcp ?? {}).filter((entry): entry is [string, McpConfigured] => isMcpConfigured(entry[1]))
}

function oauthServers(config: Config.Info) {
  return configuredServers(config).filter(
    (entry): entry is [string, McpRemote] => isMcpRemote(entry[1]) && entry[1].oauth !== false,
  )
}

async function listState() {
  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const cfg = yield* Config.Service
      const mcp = yield* MCP.Service
      const config = yield* cfg.get()
      const statuses = yield* mcp.status()
      const stored = yield* Effect.all(
        Object.fromEntries(configuredServers(config).map(([name]) => [name, mcp.hasStoredTokens(name)])),
        { concurrency: "unbounded" },
      )
      return { config, statuses, stored }
    }),
  )
}

async function authState() {
  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const cfg = yield* Config.Service
      const mcp = yield* MCP.Service
      const config = yield* cfg.get()
      const auth = yield* Effect.all(
        Object.fromEntries(oauthServers(config).map(([name]) => [name, mcp.getAuthStatus(name)])),
        { concurrency: "unbounded" },
      )
      return { config, auth }
    }),
  )
}

export const McpCommand = cmd({
  command: "mcp",
  describe: "管理 MCP (Model Context Protocol) 服务器",
  builder: (yargs) =>
    yargs
      .command(McpAddCommand)
      .command(McpListCommand)
      .command(McpAuthCommand)
      .command(McpLogoutCommand)
      .command(McpDebugCommand)
      .demandCommand(),
  async handler() {},
})

export const McpListCommand = cmd({
  command: "list",
  aliases: ["ls"],
  describe: "列出 MCP 服务器及其状态",
  async handler() {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        UI.empty()
        prompts.intro("MCP 服务器")

        const { config, statuses, stored } = await listState()
        const servers = configuredServers(config)

        if (servers.length === 0) {
          prompts.log.warn("未配置 MCP 服务器")
          prompts.outro("使用以下命令添加服务器: opencode mcp add")
          return
        }

        for (const [name, serverConfig] of servers) {
          const status = statuses[name]
          const hasOAuth = isMcpRemote(serverConfig) && !!serverConfig.oauth
          const hasStoredTokens = stored[name]

          let statusIcon: string
          let statusText: string
          let hint = ""

          if (!status) {
            statusIcon = "○"
            statusText = "未初始化"
          } else if (status.status === "connected") {
            statusIcon = "✓"
            statusText = "已连接"
            if (hasOAuth && hasStoredTokens) {
              hint = " (OAuth)"
            }
          } else if (status.status === "disabled") {
            statusIcon = "○"
            statusText = "已禁用"
          } else if (status.status === "needs_auth") {
            statusIcon = "⚠"
            statusText = "需要认证"
          } else if (status.status === "needs_client_registration") {
            statusIcon = "✗"
            statusText = "需要客户端注册"
            hint = "\n    " + status.error
          } else {
            statusIcon = "✗"
            statusText = "失败"
            hint = "\n    " + status.error
          }

          const typeHint = serverConfig.type === "remote" ? serverConfig.url : serverConfig.command.join(" ")
          prompts.log.info(
            `${statusIcon} ${name} ${UI.Style.TEXT_DIM}${statusText}${hint}\n    ${UI.Style.TEXT_DIM}${typeHint}`,
          )
        }

        prompts.outro(`${servers.length} 个服务器`)
      },
    })
  },
})

export const McpAuthCommand = cmd({
  command: "auth [name]",
  describe: "对启用 OAuth 的 MCP 服务器进行认证",
  builder: (yargs) =>
    yargs
      .positional("name", {
        describe: "MCP 服务器名称",
        type: "string",
      })
      .command(McpAuthListCommand),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        UI.empty()
        prompts.intro("MCP OAuth 认证")

        const { config, auth } = await authState()
        const mcpServers = config.mcp ?? {}
        const servers = oauthServers(config)

        if (servers.length === 0) {
          prompts.log.warn("未配置支持 OAuth 的 MCP 服务器")
          prompts.log.info("远程 MCP 服务器默认支持 OAuth。在 opencode.json 中添加远程服务器:")
          prompts.log.info(`
  "mcp": {
    "my-server": {
      "type": "remote",
      "url": "https://example.com/mcp"
    }
  }`)
          prompts.outro("完成")
          return
        }

        let serverName = args.name
        if (!serverName) {
          // Build options with auth status
          const options = servers.map(([name, cfg]) => {
            const authStatus = auth[name]
            const icon = getAuthStatusIcon(authStatus)
            const statusText = getAuthStatusText(authStatus)
            const url = cfg.url
            return {
              label: `${icon} ${name} (${statusText})`,
              value: name,
              hint: url,
            }
          })

          const selected = await prompts.select({
            message: "选择要认证的 MCP 服务器",
            options,
          })
          if (prompts.isCancel(selected)) throw new UI.CancelledError()
          serverName = selected
        }

        const serverConfig = mcpServers[serverName]
        if (!serverConfig) {
          prompts.log.error(`未找到 MCP 服务器: ${serverName}`)
          prompts.outro("完成")
          return
        }

        if (!isMcpRemote(serverConfig) || serverConfig.oauth === false) {
          prompts.log.error(`MCP 服务器 ${serverName} 不是支持 OAuth 的远程服务器`)
          prompts.outro("完成")
          return
        }

        // Check if already authenticated
        const authStatus =
          auth[serverName] ?? (await AppRuntime.runPromise(MCP.Service.use((mcp) => mcp.getAuthStatus(serverName))))
        if (authStatus === "authenticated") {
          const confirm = await prompts.confirm({
            message: `${serverName} 已有有效凭据。是否重新认证？`,
          })
          if (prompts.isCancel(confirm) || !confirm) {
            prompts.outro("已取消")
            return
          }
        } else if (authStatus === "expired") {
          prompts.log.warn(`${serverName} 的凭据已过期。正在重新认证...`)
        }

        const spinner = prompts.spinner()
        spinner.start("正在启动 OAuth 流程...")

        // Subscribe to browser open failure events to show URL for manual opening
        const unsubscribe = Bus.subscribe(MCP.BrowserOpenFailed, (evt) => {
          if (evt.properties.mcpName === serverName) {
            spinner.stop("无法自动打开浏览器")
            prompts.log.warn("请在浏览器中打开此 URL 进行认证:")
            prompts.log.info(evt.properties.url)
            spinner.start("等待授权中...")
          }
        })

        try {
          const status = await AppRuntime.runPromise(MCP.Service.use((mcp) => mcp.authenticate(serverName)))

          if (status.status === "connected") {
            spinner.stop("认证成功!")
          } else if (status.status === "needs_client_registration") {
            spinner.stop("认证失败", 1)
            prompts.log.error(status.error)
            prompts.log.info("请在 MCP 服务器配置中添加 clientId:")
            prompts.log.info(`
  "mcp": {
    "${serverName}": {
      "type": "remote",
      "url": "${serverConfig.url}",
      "oauth": {
        "clientId": "your-client-id",
        "clientSecret": "your-client-secret"
      }
    }
  }`)
          } else if (status.status === "failed") {
            spinner.stop("认证失败", 1)
            prompts.log.error(status.error)
          } else {
            spinner.stop("意外状态: " + status.status, 1)
          }
        } catch (error) {
          spinner.stop("认证失败", 1)
          prompts.log.error(error instanceof Error ? error.message : String(error))
        } finally {
          unsubscribe()
        }

        prompts.outro("完成")
      },
    })
  },
})

export const McpAuthListCommand = cmd({
  command: "list",
  aliases: ["ls"],
  describe: "列出支持 OAuth 的 MCP 服务器及其认证状态",
  async handler() {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        UI.empty()
        prompts.intro("MCP OAuth 状态")

        const { config, auth } = await authState()
        const servers = oauthServers(config)

        if (servers.length === 0) {
          prompts.log.warn("未配置支持 OAuth 的 MCP 服务器")
          prompts.outro("完成")
          return
        }

        for (const [name, serverConfig] of servers) {
          const authStatus = auth[name]
          const icon = getAuthStatusIcon(authStatus)
          const statusText = getAuthStatusText(authStatus)
          const url = serverConfig.url

          prompts.log.info(`${icon} ${name} ${UI.Style.TEXT_DIM}${statusText}\n    ${UI.Style.TEXT_DIM}${url}`)
        }

        prompts.outro(`${servers.length} 个支持 OAuth 的服务器`)
      },
    })
  },
})

export const McpLogoutCommand = cmd({
  command: "logout [name]",
  describe: "删除 MCP 服务器的 OAuth 凭据",
  builder: (yargs) =>
    yargs.positional("name", {
      describe: "MCP 服务器名称",
      type: "string",
    }),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        UI.empty()
        prompts.intro("MCP OAuth 退出")

        const credentials = await AppRuntime.runPromise(McpAuth.Service.use((auth) => auth.all()))
        const serverNames = Object.keys(credentials)

        if (serverNames.length === 0) {
          prompts.log.warn("未存储 MCP OAuth 凭据")
          prompts.outro("完成")
          return
        }

        let serverName = args.name
        if (!serverName) {
          const selected = await prompts.select({
            message: "选择要退出的 MCP 服务器",
            options: serverNames.map((name) => {
              const entry = credentials[name]
              const hasTokens = !!entry.tokens
              const hasClient = !!entry.clientInfo
              let hint = ""
              if (hasTokens && hasClient) hint = "令牌 + 客户端"
              else if (hasTokens) hint = "令牌"
              else if (hasClient) hint = "客户端注册"
              return {
                label: name,
                value: name,
                hint,
              }
            }),
          })
          if (prompts.isCancel(selected)) throw new UI.CancelledError()
          serverName = selected
        }

        if (!credentials[serverName]) {
          prompts.log.error(`未找到 ${serverName} 的凭据`)
          prompts.outro("完成")
          return
        }

        await AppRuntime.runPromise(MCP.Service.use((mcp) => mcp.removeAuth(serverName)))
        prompts.log.success(`已删除 ${serverName} 的 OAuth 凭据`)
        prompts.outro("完成")
      },
    })
  },
})

async function resolveConfigPath(baseDir: string, global = false) {
  // Check for existing config files (prefer .jsonc over .json, check .opencode/ subdirectory too)
  const candidates = [path.join(baseDir, "opencode.json"), path.join(baseDir, "opencode.jsonc")]

  if (!global) {
    candidates.push(path.join(baseDir, ".opencode", "opencode.json"), path.join(baseDir, ".opencode", "opencode.jsonc"))
  }

  for (const candidate of candidates) {
    if (await Filesystem.exists(candidate)) {
      return candidate
    }
  }

  // Default to opencode.json if none exist
  return candidates[0]
}

async function addMcpToConfig(name: string, mcpConfig: ConfigMCP.Info, configPath: string) {
  let text = "{}"
  if (await Filesystem.exists(configPath)) {
    text = await Filesystem.readText(configPath)
  }

  // Use jsonc-parser to modify while preserving comments
  const edits = modify(text, ["mcp", name], mcpConfig, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  })
  const result = applyEdits(text, edits)

  await Filesystem.write(configPath, result)

  return configPath
}

export const McpAddCommand = cmd({
  command: "add",
  describe: "添加 MCP 服务器",
  async handler() {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        UI.empty()
        prompts.intro("添加 MCP 服务器")

        const project = Instance.project

        // Resolve config paths eagerly for hints
        const [projectConfigPath, globalConfigPath] = await Promise.all([
          resolveConfigPath(Instance.worktree),
          resolveConfigPath(Global.Path.config, true),
        ])

        // Determine scope
        let configPath = globalConfigPath
        if (project.vcs === "git") {
          const scopeResult = await prompts.select({
            message: "位置",
            options: [
              {
                label: "当前项目",
                value: projectConfigPath,
                hint: projectConfigPath,
              },
              {
                label: "全局",
                value: globalConfigPath,
                hint: globalConfigPath,
              },
            ],
          })
          if (prompts.isCancel(scopeResult)) throw new UI.CancelledError()
          configPath = scopeResult
        }

        const name = await prompts.text({
          message: "输入 MCP 服务器名称",
          validate: (x) => (x && x.length > 0 ? undefined : "必填"),
        })
        if (prompts.isCancel(name)) throw new UI.CancelledError()

        const type = await prompts.select({
          message: "选择 MCP 服务器类型",
          options: [
            {
              label: "本地",
              value: "local",
              hint: "运行本地命令",
            },
            {
              label: "远程",
              value: "remote",
              hint: "连接到远程 URL",
            },
          ],
        })
        if (prompts.isCancel(type)) throw new UI.CancelledError()

        if (type === "local") {
          const command = await prompts.text({
            message: "输入要运行的命令",
            placeholder: "例如, opencode x @modelcontextprotocol/server-filesystem",
            validate: (x) => (x && x.length > 0 ? undefined : "必填"),
          })
          if (prompts.isCancel(command)) throw new UI.CancelledError()

          const mcpConfig: ConfigMCP.Info = {
            type: "local",
            command: command.split(" "),
          }

          await addMcpToConfig(name, mcpConfig, configPath)
          prompts.log.success(`MCP 服务器 "${name}" 已添加到 ${configPath}`)
          prompts.outro("MCP 服务器添加成功")
          return
        }

        if (type === "remote") {
          const url = await prompts.text({
            message: "输入 MCP 服务器 URL",
            placeholder: "例如, https://example.com/mcp",
            validate: (x) => {
              if (!x) return "必填"
              if (x.length === 0) return "必填"
              const isValid = URL.canParse(x)
              return isValid ? undefined : "无效的 URL"
            },
          })
          if (prompts.isCancel(url)) throw new UI.CancelledError()

          const useOAuth = await prompts.confirm({
            message: "此服务器是否需要 OAuth 认证？",
            initialValue: false,
          })
          if (prompts.isCancel(useOAuth)) throw new UI.CancelledError()

          let mcpConfig: ConfigMCP.Info

          if (useOAuth) {
            const hasClientId = await prompts.confirm({
              message: "您是否有预注册的客户端 ID？",
              initialValue: false,
            })
            if (prompts.isCancel(hasClientId)) throw new UI.CancelledError()

            if (hasClientId) {
              const clientId = await prompts.text({
                message: "输入客户端 ID",
                validate: (x) => (x && x.length > 0 ? undefined : "必填"),
              })
              if (prompts.isCancel(clientId)) throw new UI.CancelledError()

              const hasSecret = await prompts.confirm({
                message: "您是否有客户端密钥？",
                initialValue: false,
              })
              if (prompts.isCancel(hasSecret)) throw new UI.CancelledError()

              let clientSecret: string | undefined
              if (hasSecret) {
                const secret = await prompts.password({
                  message: "输入客户端密钥",
                })
                if (prompts.isCancel(secret)) throw new UI.CancelledError()
                clientSecret = secret
              }

              mcpConfig = {
                type: "remote",
                url,
                oauth: {
                  clientId,
                  ...(clientSecret && { clientSecret }),
                },
              }
            } else {
              mcpConfig = {
                type: "remote",
                url,
                oauth: {},
              }
            }
          } else {
            mcpConfig = {
              type: "remote",
              url,
            }
          }

          await addMcpToConfig(name, mcpConfig, configPath)
          prompts.log.success(`MCP 服务器 "${name}" 已添加到 ${configPath}`)
        }

        prompts.outro("MCP 服务器添加成功")
      },
    })
  },
})

export const McpDebugCommand = cmd({
  command: "debug <name>",
  describe: "调试 MCP 服务器的 OAuth 连接",
  builder: (yargs) =>
    yargs.positional("name", {
      describe: "MCP 服务器名称",
      type: "string",
      demandOption: true,
    }),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        UI.empty()
        prompts.intro("MCP OAuth 调试")

        const config = await AppRuntime.runPromise(Config.Service.use((cfg) => cfg.get()))
        const mcpServers = config.mcp ?? {}
        const serverName = args.name

        const serverConfig = mcpServers[serverName]
        if (!serverConfig) {
          prompts.log.error(`未找到 MCP 服务器: ${serverName}`)
          prompts.outro("完成")
          return
        }

        if (!isMcpRemote(serverConfig)) {
          prompts.log.error(`MCP 服务器 ${serverName} 不是远程服务器`)
          prompts.outro("完成")
          return
        }

        if (serverConfig.oauth === false) {
          prompts.log.warn(`MCP 服务器 ${serverName} 已明确禁用 OAuth`)
          prompts.outro("完成")
          return
        }

        prompts.log.info(`服务器: ${serverName}`)
        prompts.log.info(`URL: ${serverConfig.url}`)

        // Check stored auth status
        const { authStatus, entry } = await AppRuntime.runPromise(
          Effect.gen(function* () {
            const mcp = yield* MCP.Service
            const auth = yield* McpAuth.Service
            return {
              authStatus: yield* mcp.getAuthStatus(serverName),
              entry: yield* auth.get(serverName),
            }
          }),
        )
        prompts.log.info(`认证状态: ${getAuthStatusIcon(authStatus)} ${getAuthStatusText(authStatus)}`)

        if (entry?.tokens) {
          prompts.log.info(`  访问令牌: ${entry.tokens.accessToken.substring(0, 20)}...`)
          if (entry.tokens.expiresAt) {
            const expiresDate = new Date(entry.tokens.expiresAt * 1000)
            const isExpired = entry.tokens.expiresAt < Date.now() / 1000
            prompts.log.info(`  过期时间: ${expiresDate.toISOString()} ${isExpired ? "(已过期)" : ""}`)
          }
          if (entry.tokens.refreshToken) {
            prompts.log.info(`  刷新令牌: 存在`)
          }
        }
        if (entry?.clientInfo) {
          prompts.log.info(`  客户端 ID: ${entry.clientInfo.clientId}`)
          if (entry.clientInfo.clientSecretExpiresAt) {
            const expiresDate = new Date(entry.clientInfo.clientSecretExpiresAt * 1000)
            prompts.log.info(`  客户端密钥过期: ${expiresDate.toISOString()}`)
          }
        }

        const spinner = prompts.spinner()
        spinner.start("正在测试连接...")

        // Test basic HTTP connectivity first
        try {
          const response = await fetch(serverConfig.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json, text/event-stream",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "initialize",
              params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "opencode-debug", version: InstallationVersion },
              },
              id: 1,
            }),
          })

          spinner.stop(`HTTP 响应: ${response.status} ${response.statusText}`)

          // Check for WWW-Authenticate header
          const wwwAuth = response.headers.get("www-authenticate")
          if (wwwAuth) {
            prompts.log.info(`WWW-Authenticate: ${wwwAuth}`)
          }

          if (response.status === 401) {
            prompts.log.warn("服务器返回 401 未授权")

            // Try to discover OAuth metadata
            const oauthConfig = typeof serverConfig.oauth === "object" ? serverConfig.oauth : undefined
            const auth = await AppRuntime.runPromise(
              Effect.gen(function* () {
                return yield* McpAuth.Service
              }),
            )
            const authProvider = new McpOAuthProvider(
              serverName,
              serverConfig.url,
              {
                clientId: oauthConfig?.clientId,
                clientSecret: oauthConfig?.clientSecret,
                scope: oauthConfig?.scope,
                redirectUri: oauthConfig?.redirectUri,
              },
              {
                onRedirect: async () => {},
              },
              auth,
            )

            prompts.log.info("正在测试 OAuth 流程（不完成授权）...")

            // Try creating transport with auth provider to trigger discovery
            const transport = new StreamableHTTPClientTransport(new URL(serverConfig.url), {
              authProvider,
            })

            try {
              const client = new Client({
                name: "opencode-debug",
                version: InstallationVersion,
              })
              await client.connect(transport)
              prompts.log.success("连接成功（已认证）")
              await client.close()
            } catch (error) {
              if (error instanceof UnauthorizedError) {
                prompts.log.info(`触发了 OAuth 流程: ${error.message}`)

                // Check if dynamic registration would be attempted
                const clientInfo = await authProvider.clientInformation()
                if (clientInfo) {
                  prompts.log.info(`客户端 ID 可用: ${clientInfo.client_id}`)
                } else {
                  prompts.log.info("没有客户端 ID - 将尝试动态注册")
                }
              } else {
                prompts.log.error(`连接错误: ${error instanceof Error ? error.message : String(error)}`)
              }
            }
          } else if (response.status >= 200 && response.status < 300) {
            prompts.log.success("服务器响应成功（无需认证或已认证）")
            const body = await response.text()
            try {
              const json = JSON.parse(body)
              if (json.result?.serverInfo) {
                prompts.log.info(`服务器信息: ${JSON.stringify(json.result.serverInfo)}`)
              }
            } catch {
              // Not JSON, ignore
            }
          } else {
            prompts.log.warn(`意外状态: ${response.status}`)
            const body = await response.text().catch(() => "")
            if (body) {
              prompts.log.info(`响应内容: ${body.substring(0, 500)}`)
            }
          }
        } catch (error) {
          spinner.stop("连接失败", 1)
          prompts.log.error(`错误: ${error instanceof Error ? error.message : String(error)}`)
        }

        prompts.outro("调试完成")
      },
    })
  },
})
