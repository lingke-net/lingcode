import type { Argv } from "yargs"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"
import { AppRuntime } from "@/effect/app-runtime"
import { Installation } from "../../installation"
import { InstallationVersion } from "../../installation/version"

export const UpgradeCommand = {
  command: "upgrade [target]",
  describe: "升级 opencode 到最新版本或指定版本",
  builder: (yargs: Argv) => {
    return yargs
      .positional("target", {
        describe: "要升级到的版本，例如 '0.1.48' 或 'v0.1.48'",
        type: "string",
      })
      .option("method", {
        alias: "m",
        describe: "使用的安装方式",
        type: "string",
        choices: ["curl", "npm", "pnpm", "bun", "brew", "choco", "scoop"],
      })
  },
  handler: async (args: { target?: string; method?: string }) => {
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()
    prompts.intro("升级")
    const detectedMethod = await AppRuntime.runPromise(Installation.Service.use((svc) => svc.method()))
    const method = (args.method as Installation.Method) ?? detectedMethod
    if (method === "unknown") {
      prompts.log.error(`opencode 已安装到 ${process.execPath}，可能由包管理器管理`)
      const install = await prompts.select({
        message: "仍然安装？",
        options: [
          { label: "是", value: true },
          { label: "否", value: false },
        ],
        initialValue: false,
      })
      if (!install) {
        prompts.outro("完成")
        return
      }
    }
    prompts.log.info("使用方式: " + method)
    const target = args.target
      ? args.target.replace(/^v/, "")
      : await AppRuntime.runPromise(Installation.Service.use((svc) => svc.latest()))

    if (InstallationVersion === target) {
      prompts.log.warn(`跳过 opencode 升级: ${target} 已安装`)
      prompts.outro("完成")
      return
    }

    prompts.log.info(`从 ${InstallationVersion} → ${target}`)
    const spinner = prompts.spinner()
    spinner.start("正在升级...")
    const err = await AppRuntime.runPromise(Installation.Service.use((svc) => svc.upgrade(method, target))).catch(
      (err) => err,
    )
    if (err) {
      spinner.stop("升级失败", 1)
      if (err instanceof Installation.UpgradeFailedError) {
        // necessary because choco only allows install/upgrade in elevated terminals
        if (method === "choco" && err.stderr.includes("not running from an elevated command shell")) {
          prompts.log.error("请以管理员身份运行终端后重试")
        } else {
          prompts.log.error(err.stderr)
        }
      } else if (err instanceof Error) prompts.log.error(err.message)
      prompts.outro("完成")
      return
    }
    spinner.stop("升级完成")
    prompts.outro("完成")
  },
}
