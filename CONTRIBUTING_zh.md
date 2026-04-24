# 为 OpenCode 贡献代码

我们希望让你能轻松地为 OpenCode 贡献代码。以下是最常见的会被合并的变更类型：

- Bug 修复
- 新增 LSP / Formatters 支持
- LLM 性能优化
- 新 Provider 支持
- 修复特定环境的兼容性问题
- 补全缺失的标准行为
- 文档改进

但是，任何 UI 或核心产品功能都必须经过核心团队的设计审查后才能实施。

如果你不确定 PR 是否会被接受，可以随时询问维护者，或查找带有以下标签的 Issue：

- [`help wanted`](https://github.com/anomalyco/opencode/issues?q=is%3Aissue%20state%3Aopen%20label%3Ahelp-wanted)
- [`good first issue`](https://github.com/anomalyco/opencode/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22good%20first%20issue%22)
- [`bug`](https://github.com/anomalyco/opencode/issues?q=is%3Aissue%20state%3Aopen%20label%3Abug)
- [`perf`](https://github.com/anomalyco/opencode/issues?q=is%3Aopen%20is%3Aissue%20label%3A%22perf%22)

> [!NOTE]
> 忽略这些规范的 PR 可能会被关闭。

想认领一个 Issue？留言评论，维护者可能会将其分配给你（除非这是我们已经在处理的工作）。

## 添加新的 Provider

新的 Provider 应该不需要（或只需要很少的）代码修改，但如果你想添加新 Provider 的支持，请先向以下仓库提交 PR：
https://github.com/anomalyco/models.dev

## 开发 OpenCode

- 环境要求：Bun 1.3+
- 从仓库根目录安装依赖并启动开发服务器：

```bash
bun install
bun dev
```

### 在不同目录运行

默认情况下，`bun dev` 在 `packages/opencode` 目录运行 OpenCode。如果你想在不同的目录或仓库运行：

```bash
bun dev <目录>
```

在 opencode 仓库根目录运行 OpenCode：

```bash
bun dev .
```

### 构建本地版本 "localcode"

编译独立的可执行文件：

```bash
./packages/opencode/script/build.ts --single
```

然后运行：

```bash
./packages/opencode/dist/opencode-<平台>/bin/opencode
```

将 `<平台>` 替换为你的平台（例如 `darwin-arm64`、`linux-x64`）。

核心模块说明：
- `packages/opencode`：OpenCode 核心业务逻辑和服务器
- `packages/opencode/src/cli/cmd/tui/`：TUI 代码，使用 SolidJS 和 [opentui](https://github.com/sst/opentui) 编写
- `packages/app`：共享的 Web UI 组件，使用 SolidJS 编写
- `packages/desktop`：原生桌面应用，使用 Tauri 构建（封装 `packages/app`）
- `packages/plugin`：`@opencode-ai/plugin` 的源码

### 理解 bun dev 与 opencode 的区别

在开发过程中，`bun dev` 是构建后的 `opencode` 命令的本地等价物。两者运行相同的 CLI 接口：

```bash
# 开发环境（从项目根目录）
bun dev --help           # 显示所有可用命令
bun dev serve            # 启动无头 API 服务器
bun dev web              # 启动服务器并打开 Web 界面
bun dev <目录>           # 在指定目录启动 TUI

# 生产环境
opencode --help          # 显示所有可用命令
opencode serve           # 启动无头 API 服务器
opencode web             # 启动服务器并打开 Web 界面
opencode <目录>          # 在指定目录启动 TUI
```

### 运行 API 服务器

启动 OpenCode 无头 API 服务器：

```bash
bun dev serve
```

默认在端口 4096 启动无头服务器。你可以指定不同的端口：

```bash
bun dev serve --port 8080
```

### 运行 Web 应用

在开发过程中测试 UI 变更：

1. **首先，启动 OpenCode 服务器**（参见上文的 [运行 API 服务器](#运行-api-服务器)）
2. **然后运行 Web 应用：**

```bash
bun run --cwd packages/app dev
```

这会在 http://localhost:5173 启动本地开发服务器（或输出中显示的类似端口）。大多数 UI 变更可以在这里测试，但服务器必须运行才能获得完整功能。

### 运行桌面应用

桌面应用是一个封装 Web UI 的原生 Tauri 应用。

运行原生桌面应用：

```bash
bun run --cwd packages/desktop tauri dev
```

这会在 http://localhost:1420 启动 Web 开发服务器并打开原生窗口。

如果只需要 Web 开发服务器（不带原生外壳）：

```bash
bun run --cwd packages/desktop dev
```

创建生产 `dist/` 并构建原生应用包：

```bash
bun run --cwd packages/desktop tauri build
```

这会通过 Tauri 的 `beforeBuildCommand` 自动运行 `bun run --cwd packages/desktop build`。

> [!NOTE]
> 运行桌面应用需要额外的 Tauri 依赖（Rust 工具链、特定平台的库）。请参阅 [Tauri 前提条件](https://v2.tauri.app/start/prerequisites/) 了解设置说明。

> [!NOTE]
> 如果你对 API 或 SDK 进行了修改（例如 `packages/opencode/src/server/server.ts`），请运行 `./script/generate.ts` 重新生成 SDK 和相关文件。

请尽量遵循 [代码风格指南](./AGENTS.md)。

### 配置调试器

Bun 的调试功能目前还不够完善。我们希望这份指南能帮助你完成配置并避免一些痛点。

调试 OpenCode 最可靠的方法是通过 `bun run --inspect=<url> dev ...` 在终端手动运行，然后通过该 URL 附加调试器。其他方法可能导致断点映射不正确，至少在 VSCode 中是这样（YMMV）。

注意事项：

- 如果你想运行 OpenCode TUI 并在服务器代码中触发断点，可能需要使用 `bun dev spawn` 而不是常规的 `bun dev`。这是因为 `bun dev` 在工作线程中运行服务器，断点可能无法工作。
- 如果 `spawn` 不适合你，可以分别调试服务器：
  - 调试服务器：`bun run --inspect=ws://localhost:6499/ --cwd packages/opencode ./src/index.ts serve --port 4096`，然后用 `opencode attach http://localhost:4096` 附加 TUI
  - 调试 TUI：`bun run --inspect=ws://localhost:6499/ --cwd packages/opencode --conditions=browser ./src/index.ts`

其他技巧：

- 你可能想根据工作流程使用 `--inspect-wait` 或 `--inspect-brk` 而不是 `--inspect`
- 在每次调用时指定 `--inspect=ws://localhost:6499/` 可能很繁琐，你可以改为 `export BUN_OPTIONS=--inspect=ws://localhost:6499/`

#### VSCode 配置

如果你使用 VSCode，可以使用我们的示例配置 [.vscode/settings.example.json](.vscode/settings.example.json) 和 [.vscode/launch.example.json](.vscode/launch.example.json)。

一些可能有问题的调试方法：

- 使用 `"request": "launch"` 的调试配置可能导致断点映射不正确，从而无法使用
- 在 VSCode 的 `JavaScript Debug Terminal` 中运行 OpenCode 也会出现同样的问题

尽管如此，你也可以尝试这些方法，因为它们可能对你有效。

## Pull Request 期望

### Issue 优先政策

**所有 PR 必须关联一个已存在的 Issue。** 在提交 PR 之前，请先创建一个描述 Bug 或功能的 Issue。这有助于维护者分类并防止重复工作。没有关联 Issue 的 PR 可能会在不审查的情况下被关闭。

- 在 PR 描述中使用 `Fixes #123` 或 `Closes #123` 来关联 Issue
- 对于小型修复，简短的 Issue 即可 — 只需提供足够的上下文让维护者理解问题

### 一般要求

- 保持 Pull Request 小而专注
- 解释 Issue 是什么以及你的修改如何解决它
- 在添加新功能之前，确保代码库中不存在类似功能

### UI 变更

如果你的 PR 包含 UI 变更，请附上变更前后的截图或视频。这有助于维护者更快地审查，也能让你更快得到反馈。

### 逻辑变更

对于非 UI 变更（Bug 修复、新功能、重构），请解释**你如何验证它是否工作**：

- 你测试了什么？
- 审查者如何复现/确认修复？

### 避免 AI 生成的长篇文本

冗长的 AI 生成 PR 描述和 Issue 是不可接受的，可能会被忽略。请尊重维护者的时间：

- 写简短、专注的描述
- 用你自己的话解释发生了什么变化以及为什么
- 如果你无法简短地解释，你的 PR 可能太大了

### PR 标题

PR 标题应遵循 conventional commit 标准：

- `feat:` 新功能或功能
- `fix:` Bug 修复
- `docs:` 文档或 README 变更
- `chore:` 维护任务、依赖更新等
- `refactor:` 不改变行为的代码重构
- `test:` 添加或更新测试

你可以选择性地包含范围来指示受影响的包：

- `feat(app):` app 包中的功能
- `fix(desktop):` desktop 包中的 Bug 修复
- `chore(opencode):` opencode 包中的维护工作

示例：

- `docs: update contributing guidelines`
- `fix: resolve crash on startup`
- `feat: add dark mode support`
- `feat(app): add dark mode support`
- `fix(desktop): resolve crash on startup`
- `chore: bump dependency versions`

### 代码风格偏好

这些不是严格强制执行的，只是一般性指导原则：

- **函数：** 除非拆分成独立函数能带来明显的复用或组合好处，否则保持逻辑在单个函数中
- **解构：** 不要对变量进行不必要的解构
- **控制流：** 避免 `else` 语句
- **错误处理：** 尽可能使用 `.catch(...)` 而不是 `try`/`catch`
- **类型：** 使用精确的类型，避免 `any`
- **变量：** 坚持不可变模式，避免 `let`
- **命名：** 在保持描述性的前提下，选择简洁的单词标识符
- **运行时 API：** 在适用时使用 Bun 辅助函数，如 `Bun.file()`

## 功能请求

对于全新的功能，请先进行设计讨论。创建一个 Issue，描述问题、你提出的方法（可选），以及为什么它属于 OpenCode。核心团队会帮助决定是否应该继续；请等待该批准，而不是直接提交功能 PR。

## 信任与担保系统

本项目使用 [vouch](https://github.com/mitchellh/vouch) 来管理贡献者信任。担保列表保存在 [`.github/VOUCHED.td`](.github/VOUCHED.td) 中。

### 工作原理

- **担保用户** 是被明确信任的贡献者
- **被谴责用户** 是被明确屏蔽的。被谴责用户的 Issue 和 Pull Request 会自动关闭。如果你被谴责了，可以通过 [Discord](https://opencode.ai/discord) 联系维护者请求取消担保
- **其他所有人** 可以正常参与 — 你不需要被担保就可以提交 Issue 或 PR

### 维护者操作

具有写权限的协作者可以通过在任何 Issue 上评论来管理担保列表：

- `vouch` — 为 Issue 作者担保
- `vouch @用户名` — 为特定用户担保
- `denounce` — 谴责 Issue 作者
- `denounce @用户名` — 谴责特定用户
- `denounce @用户名 <原因>` — 带原因谴责
- `unvouch` / `unvouch @用户名` — 从列表中移除

变更会自动提交到 `.github/VOUCHED.td`。

### 谴责政策

谴责仅适用于反复提交低质量 AI 生成内容、垃圾信息或以其他恶意方式行为的用户。不用于意见分歧或无心之失。

## Issue 要求

所有 Issue **必须** 使用我们的 Issue 模板之一：

- **Bug report** — 报告 Bug（需要描述）
- **Feature request** — 建议增强功能（需要验证复选框和描述）
- **Question** — 提问（需要问题）

不允许空白 Issue。当新 Issue 打开时，自动检查会验证它是否符合模板并满足我们的贡献指南。如果 Issue 不符合要求，你会收到一条评论解释需要修复什么，你有 **2 小时** 的时间编辑 Issue。之后它会自动关闭。

Issue 可能被标记为：

- 未使用模板
- 必填字段留空或填写占位文本
- AI 生成的长篇文本
- 缺少有意义的内容

如果你认为你的 Issue 被错误标记，请告知维护者。
