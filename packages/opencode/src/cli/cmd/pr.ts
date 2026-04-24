import { UI } from "../ui"
import { cmd } from "./cmd"
import { AppRuntime } from "@/effect/app-runtime"
import { Git } from "@/git"
import { Instance } from "@/project/instance"
import { Process } from "@/util"

export const PrCommand = cmd({
  command: "pr <number>",
  describe: "获取并检出 GitHub PR 分支，然后运行 opencode",
  builder: (yargs) =>
    yargs.positional("number", {
      type: "number",
      describe: "要检出的 PR 编号",
      demandOption: true,
    }),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const project = Instance.project
        if (project.vcs !== "git") {
          UI.error("无法找到 git 仓库。请在 git 仓库中运行此命令。")
          process.exit(1)
        }

        const prNumber = args.number
        const localBranchName = `pr/${prNumber}`
        UI.println(`正在获取并检出 PR #${prNumber}...`)

        // Use gh pr checkout with custom branch name
        const result = await Process.run(
          ["gh", "pr", "checkout", `${prNumber}`, "--branch", localBranchName, "--force"],
          {
            nothrow: true,
          },
        )

        if (result.code !== 0) {
          UI.error(`检出 PR #${prNumber} 失败。请确保已安装 gh CLI 并已认证。`)
          process.exit(1)
        }

        // Fetch PR info for fork handling and session link detection
        const prInfoResult = await Process.text(
          [
            "gh",
            "pr",
            "view",
            `${prNumber}`,
            "--json",
            "headRepository,headRepositoryOwner,isCrossRepository,headRefName,body",
          ],
          { nothrow: true },
        )

        let sessionId: string | undefined

        if (prInfoResult.code === 0) {
          const prInfoText = prInfoResult.text
          if (prInfoText.trim()) {
            const prInfo = JSON.parse(prInfoText)

            // Handle fork PRs
            if (prInfo && prInfo.isCrossRepository && prInfo.headRepository && prInfo.headRepositoryOwner) {
              const forkOwner = prInfo.headRepositoryOwner.login
              const forkName = prInfo.headRepository.name
              const remoteName = forkOwner

              // Check if remote already exists
              const remotes = await AppRuntime.runPromise(
                Git.Service.use((git) => git.run(["remote"], { cwd: Instance.worktree })),
              ).then((x) => x.text().trim())
              if (!remotes.split("\n").includes(remoteName)) {
                await AppRuntime.runPromise(
                  Git.Service.use((git) =>
                    git.run(["remote", "add", remoteName, `https://github.com/${forkOwner}/${forkName}.git`], {
                      cwd: Instance.worktree,
                    }),
                  ),
                )
                UI.println(`已添加 fork 远程: ${remoteName}`)
              }

              // Set upstream to the fork so pushes go there
              const headRefName = prInfo.headRefName
              await AppRuntime.runPromise(
                Git.Service.use((git) =>
                  git.run(["branch", `--set-upstream-to=${remoteName}/${headRefName}`, localBranchName], {
                    cwd: Instance.worktree,
                  }),
                ),
              )
            }

            // Check for opencode session link in PR body
            if (prInfo && prInfo.body) {
              const sessionMatch = prInfo.body.match(/https:\/\/opncd\.ai\/s\/([a-zA-Z0-9_-]+)/)
              if (sessionMatch) {
                const sessionUrl = sessionMatch[0]
                UI.println(`找到 opencode 会话: ${sessionUrl}`)
                UI.println(`正在导入会话...`)

                const importResult = await Process.text(["opencode", "import", sessionUrl], {
                  nothrow: true,
                })
                if (importResult.code === 0) {
                  const importOutput = importResult.text.trim()
                  // Extract session ID from the output (format: "Imported session: <session-id>")
                  const sessionIdMatch = importOutput.match(/Imported session: ([a-zA-Z0-9_-]+)/)
                  if (sessionIdMatch) {
                    sessionId = sessionIdMatch[1]
                    UI.println(`会话已导入: ${sessionId}`)
                  }
                }
              }
            }
          }
        }

        UI.println(`成功检出 PR #${prNumber} 为分支 '${localBranchName}'`)
        UI.println()
        UI.println("正在启动 opencode...")
        UI.println()

        const opencodeArgs = sessionId ? ["-s", sessionId] : []
        const opencodeProcess = Process.spawn(["opencode", ...opencodeArgs], {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
          cwd: process.cwd(),
        })
        const code = await opencodeProcess.exited
        if (code !== 0) throw new Error(`opencode exited with code ${code}`)
      },
    })
  },
})
