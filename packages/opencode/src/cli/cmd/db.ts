import type { Argv } from "yargs"
import { spawn } from "child_process"
import { Database } from "../../storage"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { Database as BunDatabase } from "bun:sqlite"
import { UI } from "../ui"
import { cmd } from "./cmd"
import { JsonMigration } from "../../storage"
import { EOL } from "os"
import { errorMessage } from "../../util/error"

const QueryCommand = cmd({
  command: "$0 [query]",
  describe: "打开交互式 sqlite3 shell 或执行查询",
  builder: (yargs: Argv) => {
    return yargs
      .positional("query", {
        type: "string",
        describe: "要执行的 SQL 查询",
      })
      .option("format", {
        type: "string",
        choices: ["json", "tsv"],
        default: "tsv",
        describe: "输出格式",
      })
  },
  handler: async (args: { query?: string; format: string }) => {
    const query = args.query as string | undefined
    if (query) {
      const db = new BunDatabase(Database.Path, { readonly: true })
      try {
        const result = db.query(query).all() as Record<string, unknown>[]
        if (args.format === "json") {
          console.log(JSON.stringify(result, null, 2))
        } else if (result.length > 0) {
          const keys = Object.keys(result[0])
          console.log(keys.join("\t"))
          for (const row of result) {
            console.log(keys.map((k) => row[k]).join("\t"))
          }
        }
      } catch (err) {
        UI.error(errorMessage(err))
        process.exit(1)
      }
      db.close()
      return
    }
    const child = spawn("sqlite3", [Database.Path], {
      stdio: "inherit",
    })
    await new Promise((resolve) => child.on("close", resolve))
  },
})

const PathCommand = cmd({
  command: "path",
  describe: "打印数据库路径",
  handler: () => {
    console.log(Database.Path)
  },
})

const MigrateCommand = cmd({
  command: "migrate",
  describe: "将 JSON 数据迁移到 SQLite（与现有数据合并）",
  handler: async () => {
    const sqlite = new BunDatabase(Database.Path)
    const tty = process.stderr.isTTY
    const width = 36
    const orange = "\x1b[38;5;214m"
    const muted = "\x1b[0;2m"
    const reset = "\x1b[0m"
    let last = -1
    if (tty) process.stderr.write("\x1b[?25l")
    try {
      const stats = await JsonMigration.run(drizzle({ client: sqlite }), {
        progress: (event) => {
          const percent = Math.floor((event.current / event.total) * 100)
          if (percent === last) return
          last = percent
          if (tty) {
            const fill = Math.round((percent / 100) * width)
            const bar = `${"■".repeat(fill)}${"･".repeat(width - fill)}`
            process.stderr.write(
              `\r${orange}${bar} ${percent.toString().padStart(3)}%${reset} ${muted}${event.current}/${event.total}${reset} `,
            )
          } else {
            process.stderr.write(`sqlite-migration:${percent}${EOL}`)
          }
        },
      })
      if (tty) process.stderr.write("\n")
      if (tty) process.stderr.write("\x1b[?25h")
      else process.stderr.write(`sqlite-migration:done${EOL}`)
      UI.println(
        `迁移完成: ${stats.projects} 个项目, ${stats.sessions} 个会话, ${stats.messages} 条消息`,
      )
      if (stats.errors.length > 0) {
        UI.println(`迁移过程中发生 ${stats.errors.length} 个错误`)
      }
    } catch (err) {
      if (tty) process.stderr.write("\x1b[?25h")
      UI.error(`迁移失败: ${errorMessage(err)}`)
      process.exit(1)
    } finally {
      sqlite.close()
    }
  },
})

export const DbCommand = cmd({
  command: "db",
  describe: "数据库工具",
  builder: (yargs: Argv) => {
    return yargs.command(QueryCommand).command(PathCommand).command(MigrateCommand).demandCommand()
  },
  handler: () => {},
})
