import { For } from "solid-js"
import { DEFAULT_THEMES, useTheme } from "@tui/context/theme"

const themeCount = Object.keys(DEFAULT_THEMES).length
const themeTip = `使用 {highlight}/themes{/highlight} 或 {highlight}Ctrl+X T{/highlight} 切换 ${themeCount} 个内置主题`

type TipPart = { text: string; highlight: boolean }

function parse(tip: string): TipPart[] {
  const parts: TipPart[] = []
  const regex = /\{highlight\}(.*?)\{\/highlight\}/g
  const found = Array.from(tip.matchAll(regex))
  const state = found.reduce(
    (acc, match) => {
      const start = match.index ?? 0
      if (start > acc.index) {
        acc.parts.push({ text: tip.slice(acc.index, start), highlight: false })
      }
      acc.parts.push({ text: match[1], highlight: true })
      acc.index = start + match[0].length
      return acc
    },
    { parts, index: 0 },
  )

  if (state.index < tip.length) {
    parts.push({ text: tip.slice(state.index), highlight: false })
  }

  return parts
}

export function Tips() {
  const theme = useTheme().theme
  const parts = parse(TIPS[Math.floor(Math.random() * TIPS.length)])

  return (
    <box flexDirection="column" maxWidth="100%">
      <box flexDirection="row" maxWidth="100%">
        <text flexShrink={0} style={{ fg: theme.warning }}>
          ● 你知道吗？
        </text>
        <text flexShrink={1}>
          <For each={parts}>
            {(part) => <span style={{ fg: part.highlight ? theme.text : theme.textMuted }}>{part.text}</span>}
          </For>
        </text>
      </box>
    </box>
  )
}

const TIPS = [
  "输入 {highlight}@{highlight} 后跟文件名进行模糊搜索并附加文件",
  "消息以 {highlight}!{/highlight} 开头可直接运行 shell 命令（如 {highlight}!ls -la{/highlight}）",
  "按 {highlight}Tab{/highlight} 在 Build 和 Plan 智能体之间切换",
  "使用 {highlight}/undo{/highlight} 撤销上一条消息和文件更改",
  "使用 {highlight}/redo{/highlight} 恢复已撤销的消息和文件更改",
  "拖放图片或 PDF 到终端添加为上下文",
  "按 {highlight}Ctrl+V{/highlight} 将剪贴板中的图片粘贴到提示中",
  "按 {highlight}Ctrl+X E{/highlight} 或 {highlight}/editor{/highlight} 在外部编辑器中编写消息",
  "运行 {highlight}/init{/highlight} 根据代码库自动生成项目规则",
  "运行 {highlight}/models{/highlight} 或 {highlight}Ctrl+X M{/highlight} 查看和切换可用的 AI 模型",
  themeTip,
  "按 {highlight}Ctrl+X N{/highlight} 或 {highlight}/new{/highlight} 开始新的对话会话",
  "使用 {highlight}/sessions{/highlight} 或 {highlight}Ctrl+X L{/highlight} 列出并继续之前的对话",
  "运行 {highlight}/compact{/highlight} 总结接近上下文限制的长会话",
  "按 {highlight}Ctrl+X X{/highlight} 或 {highlight}/export{/highlight} 将对话保存为 Markdown",
  "按 {highlight}Ctrl+X Y{/highlight} 复制助手最后一条消息到剪贴板",
  "按 {highlight}Ctrl+P{/highlight} 查看所有可用的操作和命令",
  "运行 {highlight}/connect{/highlight} 添加 75+ 支持的 LLM 提供商 API 密钥",
  "主键是 {highlight}Ctrl+X{/highlight}；与其他键组合可快速执行操作",
  "按 {highlight}F2{/highlight} 快速切换最近使用的模型",
  "按 {highlight}Ctrl+X B{/highlight} 显示/隐藏侧边栏面板",
  "使用 {highlight}PageUp{/highlight}/{highlight}PageDown{/highlight} 浏览对话历史",
  "按 {highlight}Ctrl+G{/highlight} 或 {highlight}Home{/highlight} 跳转到对话开头",
  "按 {highlight}Ctrl+Alt+G{/highlight} 或 {highlight}End{/highlight} 跳转到最新消息",
  "按 {highlight}Shift+Enter{/highlight} 或 {highlight}Ctrl+J{/highlight} 在提示中添加换行",
  "打字时按 {highlight}Ctrl+C{/highlight} 清空输入框",
  "按 {highlight}Escape{/highlight} 停止 AI 响应",
  "切换到 {highlight}Plan{/highlight} 智能体获取建议但不实际更改",
  "在提示中使用 {highlight}@agent-name{/highlight} 调用专用子智能体",
  "按 {highlight}Ctrl+X Right/Left{/highlight} 在父会话和子会话之间切换",
  "创建 {highlight}lingcode.json{/highlight} 用于服务器设置，{highlight}tui.json{/highlight} 用于 TUI 设置",
  "将 TUI 设置放在 {highlight}~/.config/lingcode/tui.json{/highlight} 中作为全局配置",
  "在配置中添加 {highlight}$schema{/highlight} 以在编辑器中获得自动补全",
  "在配置中设置 {highlight}model{/highlight} 来指定默认模型",
  "通过 {highlight}keybinds{/highlight} 部分在 {highlight}tui.json{/highlight} 中覆盖快捷键",
  "将任何快捷键设置为 {highlight}none{/highlight} 即可完全禁用",
  "在 {highlight}mcp{/highlight} 配置部分配置本地或远程 MCP 服务器",
  "OpenCode 自动处理需要认证的远程 MCP 服务器的 OAuth",
  "在 {highlight}.lingcode/command/{/highlight} 中添加 {highlight}.md{/highlight} 文件定义可复用的自定义提示",
  "在自定义命令中使用 {highlight}$ARGUMENTS{/highlight}、{highlight}$1{/highlight}、{highlight}$2{/highlight} 获取动态输入",
  "在命令中使用反引号注入 shell 输出（如 {highlight}`git status`{/highlight}）",
  "在 {highlight}.lingcode/agent/{/highlight} 中添加 {highlight}.md{/highlight} 文件创建专用 AI 角色",
  "为 {highlight}edit{/highlight}、{highlight}bash{/highlight} 和 {highlight}webfetch{/highlight} 工具配置每个智能体的权限",
  "使用类似 {highlight}\"git *\": \"allow\"{/highlight} 的模式进行细粒度 bash 权限控制",
  "设置 {highlight}\"rm -rf *\": \"deny\"{/highlight} 阻止危险命令",
  "配置 {highlight}\"git push\": \"ask\"{/highlight} 要求推送前确认",
  "OpenCode 使用 prettier、gofmt、ruff 等自动格式化文件",
  "在配置中设置 {highlight}\"formatter\": false{/highlight} 禁用所有自动格式化",
  "在配置中定义带文件扩展名的自定义格式化命令",
  "OpenCode 使用 LSP 服务器进行智能代码分析",
  "在 {highlight}.lingcode/tools/{/highlight} 中创建 {highlight}.ts{/highlight} 文件定义新的 LLM 工具",
  "工具定义可以调用 Python、Go 等语言编写的脚本",
  "在 {highlight}.lingcode/plugin/{/highlight} 中添加 {highlight}.ts{/highlight} 文件用于事件钩子",
  "使用插件在会话完成时发送操作系统通知",
  "创建插件防止 OpenCode 读取敏感文件",
  "使用 {highlight}lingcode run{/highlight} 进行非交互式脚本操作",
  "使用 {highlight}lingcode --continue{/highlight} 恢复上一个会话",
  "使用 {highlight}lingcode run -f file.ts{/highlight} 通过 CLI 附加文件",
  "使用 {highlight}--format json{/highlight} 在脚本中获得机器可读的输出",
  "运行 {highlight}lingcode serve{/highlight} 以无头 API 访问 OpenCode",
  "使用 {highlight}lingcode run --attach{/highlight} 连接到运行中的服务器",
  "运行 {highlight}lingcode upgrade{/highlight} 更新到最新版本",
  "运行 {highlight}lingcode auth list{/highlight} 查看所有配置的提供商",
  "运行 {highlight}lingcode agent create{/highlight} 创建引导式智能体",
  "在 GitHub issues/PR 中使用 {highlight}/lingcode{/highlight} 触发 AI 操作",
  "运行 {highlight}lingcode github install{/highlight} 设置 GitHub 工作流",
  "在 issue 中评论 {highlight}/lingcode fix this{/highlight} 自动创建 PR",
  "在 PR 代码行评论 {highlight}/oc{/highlight} 进行针对性代码审查",
  "使用 {highlight}\"theme\": \"system\"{/highlight} 匹配终端颜色",
  "在 {highlight}.lingcode/themes/{/highlight} 目录中创建 JSON 主题文件",
  "主题支持明暗两种模式的变体",
  "在自定义主题中引用 ANSI 颜色 0-255",
  "使用 {highlight}{env:VAR_NAME}{/highlight} 语法在配置中引用环境变量",
  "使用 {highlight}{file:path}{/highlight} 在配置值中包含文件内容",
  "在配置中使用 {highlight}instructions{/highlight} 加载额外的规则文件",
  "将智能体 {highlight}temperature{/highlight} 从 0.0（专注）设置到 1.0（创意）",
  "配置 {highlight}steps{/highlight} 限制每次请求的智能体迭代次数",
  "设置 {highlight}\"tools\": {\"bash\": false}{/highlight} 禁用特定工具",
  "设置 {highlight}\"mcp_*\": false{/highlight} 禁用 MCP 服务器的所有工具",
  "在每个智能体配置中覆盖全局工具设置",
  "设置 {highlight}\"share\": \"auto\"{/highlight} 自动共享所有会话",
  "设置 {highlight}\"share\": \"disabled\"{/highlight} 禁止任何会话共享",
  "运行 {highlight}/unshare{/highlight} 取消会话的公开访问",
  "{highlight}doom_loop{/highlight} 权限防止无限工具调用循环",
  "{highlight}external_directory{/highlight} 权限保护项目外部的文件",
  "运行 {highlight}lingcode debug config{/highlight} 排查配置问题",
  "使用 {highlight}--print-logs{/highlight} 标志在 stderr 中查看详细日志",
  "按 {highlight}Ctrl+X G{/highlight} 或 {highlight}/timeline{/highlight} 跳转到特定消息",
  "按 {highlight}Ctrl+X H{/highlight} 切换消息中代码块的显示",
  "按 {highlight}Ctrl+X S{/highlight} 或 {highlight}/status{/highlight} 查看系统状态信息",
  "在 {highlight}tui.json{/highlight} 中启用 {highlight}scroll_acceleration{/highlight} 实现流畅的 macOS 风格滚动",
  "通过命令面板（{highlight}Ctrl+P{/highlight}）切换聊天中用户名的显示",
  "运行 {highlight}docker run -it --rm ghcr.io/anomalyco/lingcode{/highlight} 容器化使用",
  "使用 {highlight}/connect{/highlight} 配合 lingke coding plan 获取精选测试好的模型",
  "将项目的 {highlight}AGENTS.md{/highlight} 文件提交到 Git 以便团队共享",
  "使用 {highlight}/review{/highlight} 审查未提交的更改、分支或 PR",
  "运行 {highlight}/help{/highlight} 或 {highlight}Ctrl+X H{/highlight} 显示帮助对话框",
  "使用 {highlight}/rename{/highlight} 重命名当前会话",
  ...(process.platform === "win32"
    ? ["按 {highlight}Ctrl+Z{/highlight} 撤销提示中的更改"]
    : ["按 {highlight}Ctrl+Z{/highlight} 挂起终端并返回 shell"]),
]
