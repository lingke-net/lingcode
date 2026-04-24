import { intro, log, outro, spinner } from "@clack/prompts"
import type { Argv } from "yargs"

import { ConfigPaths } from "../../config"
import { Global } from "../../global"
import { installPlugin, patchPluginConfig, readPluginManifest } from "../../plugin/install"
import { resolvePluginTarget } from "../../plugin/shared"
import { Instance } from "../../project/instance"
import { errorMessage } from "../../util/error"
import { Filesystem } from "../../util"
import { Process } from "../../util"
import { UI } from "../ui"
import { cmd } from "./cmd"

type Spin = {
  start: (msg: string) => void
  stop: (msg: string, code?: number) => void
}

export type PlugDeps = {
  spinner: () => Spin
  log: {
    error: (msg: string) => void
    info: (msg: string) => void
    success: (msg: string) => void
  }
  resolve: (spec: string) => Promise<string>
  readText: (file: string) => Promise<string>
  write: (file: string, text: string) => Promise<void>
  exists: (file: string) => Promise<boolean>
  files: (dir: string, name: "opencode" | "tui") => string[]
  global: string
}

export type PlugInput = {
  mod: string
  global?: boolean
  force?: boolean
}

export type PlugCtx = {
  vcs?: string
  worktree: string
  directory: string
}

const defaultPlugDeps: PlugDeps = {
  spinner: () => spinner(),
  log: {
    error: (msg) => log.error(msg),
    info: (msg) => log.info(msg),
    success: (msg) => log.success(msg),
  },
  resolve: (spec) => resolvePluginTarget(spec),
  readText: (file) => Filesystem.readText(file),
  write: async (file, text) => {
    await Filesystem.write(file, text)
  },
  exists: (file) => Filesystem.exists(file),
  files: (dir, name) => ConfigPaths.fileInDirectory(dir, name),
  global: Global.Path.config,
}

function cause(err: unknown) {
  if (!err || typeof err !== "object") return
  if (!("cause" in err)) return
  return (err as { cause?: unknown }).cause
}

export function createPlugTask(input: PlugInput, dep: PlugDeps = defaultPlugDeps) {
  const mod = input.mod
  const force = Boolean(input.force)
  const global = Boolean(input.global)

  return async (ctx: PlugCtx) => {
    const install = dep.spinner()
    install.start("正在安装插件包...")
    const target = await installPlugin(mod, dep)
    if (!target.ok) {
      install.stop("安装失败", 1)
      dep.log.error(`无法安装 "${mod}"`)
      const hit = cause(target.error) ?? target.error
      if (hit instanceof Process.RunFailedError) {
        const lines = hit.stderr
          .toString()
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
        const errs = lines.filter((line) => line.startsWith("error:")).map((line) => line.replace(/^error:\s*/, ""))
        const detail = errs[0] ?? lines.at(-1)
        if (detail) dep.log.error(detail)
        if (lines.some((line) => line.includes("No version matching"))) {
          dep.log.info("此包依赖于您 npm 注册表中不可用的版本。")
          dep.log.info("请检查 npm 注册表/认证设置后重试。")
        }
      }
      if (!(hit instanceof Process.RunFailedError)) {
        dep.log.error(errorMessage(hit))
      }
      return false
    }
    install.stop("插件包已就绪")

    const inspect = dep.spinner()
    inspect.start("正在读取插件清单...")
    const manifest = await readPluginManifest(target.target)
    if (!manifest.ok) {
      if (manifest.code === "manifest_read_failed") {
        inspect.stop("清单读取失败", 1)
        dep.log.error(`已安装 "${mod}" 但无法读取 ${manifest.file}`)
        dep.log.error(errorMessage(cause(manifest.error) ?? manifest.error))
        return false
      }

      if (manifest.code === "manifest_no_targets") {
        inspect.stop("未找到插件目标", 1)
        dep.log.error(`"${mod}" 未在 package.json 中暴露插件入口点`)
        dep.log.info(
          "预期以下之一: exports[\"./tui\"]、exports[\"./server\"]、package.json main（服务端）或 package.json[\"oc-themes\"]（tui 主题）。",
        )
        return false
      }

      inspect.stop("清单读取失败", 1)
      return false
    }

    inspect.stop(
      `检测到 ${manifest.targets.map((item) => item.kind).join(" + ")} 目标${manifest.targets.length === 1 ? "" : "s"}`,
    )

    const patch = dep.spinner()
    patch.start("正在更新插件配置...")
    const out = await patchPluginConfig(
      {
        spec: mod,
        targets: manifest.targets,
        force,
        global,
        vcs: ctx.vcs,
        worktree: ctx.worktree,
        directory: ctx.directory,
        config: dep.global,
      },
      dep,
    )
    if (!out.ok) {
      if (out.code === "invalid_json") {
        patch.stop(`更新 ${out.kind} 配置失败`, 1)
        dep.log.error(`${out.file} 中的 JSON 无效（第 ${out.line} 行，第 ${out.col} 列）`)
        dep.log.info("请修复配置文件后重新运行命令。")
        return false
      }

      patch.stop("更新插件配置失败", 1)
      dep.log.error(errorMessage(out.error))
      return false
    }
    patch.stop("插件配置已更新")
    for (const item of out.items) {
      if (item.mode === "noop") {
        dep.log.info(`已在 ${item.file} 中配置`)
        continue
      }
      if (item.mode === "replace") {
        dep.log.info(`已在 ${item.file} 中替换`)
        continue
      }
      dep.log.info(`已添加到 ${item.file}`)
    }

    dep.log.success(`已安装 ${mod}`)
    dep.log.info(global ? `范围: 全局 (${out.dir})` : `范围: 本地 (${out.dir})`)
    return true
  }
}

export const PluginCommand = cmd({
  command: "plugin <module>",
  aliases: ["plug"],
  describe: "安装插件并更新配置",
  builder: (yargs: Argv) => {
    return yargs
      .positional("module", {
        type: "string",
        describe: "npm 模块名称",
      })
      .option("global", {
        alias: ["g"],
        type: "boolean",
        default: false,
        describe: "安装到全局配置",
      })
      .option("force", {
        alias: ["f"],
        type: "boolean",
        default: false,
        describe: "替换现有插件版本",
      })
  },
  handler: async (args) => {
    const mod = String(args.module ?? "").trim()
    if (!mod) {
      UI.error("必须指定模块")
      process.exitCode = 1
      return
    }

    UI.empty()
    intro(`安装插件 ${mod}`)

    const run = createPlugTask({
      mod,
      global: Boolean(args.global),
      force: Boolean(args.force),
    })
    let ok = true

    await Instance.provide({
      directory: process.cwd(),
      fn: async () => {
        ok = await run({
          vcs: Instance.project.vcs,
          worktree: Instance.worktree,
          directory: Instance.directory,
        })
      },
    })

    outro("完成")
    if (!ok) process.exitCode = 1
  },
})
