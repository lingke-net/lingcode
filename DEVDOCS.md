# OpenCode 项目开发文档

## 📚 文档目录

```
opencode/
├── 📄 README.md                    # 项目介绍与快速开始
├── 📄 CONTRIBUTING.md              # 贡献指南
├── 📄 AGENTS.md                    # AI 编码风格指南（开发规范）
├── 📄 DEVDOCS.md                  # 本文档 - 开发完整指南
├── 📄 package.json                 # 根包配置
├── 📄 turbo.json                   # Turborepo 构建配置
├── 📄 bunfig.toml                  # Bun 配置文件
│
├── 📁 packages/                    # 核心代码包
│   ├── 📁 opencode/               # 核心业务逻辑 & 服务器
│   │   ├── 📁 src/
│   │   │   ├── 📁 agent/          # AI Agent 核心逻辑
│   │   │   ├── 📁 cli/            # CLI 命令实现
│   │   │   ├── 📁 config/          # 配置管理模块
│   │   │   ├── 📁 provider/        # LLM Provider 适配
│   │   │   ├── 📁 server/          # API 服务器
│   │   │   ├── 📁 lsp/             # LSP 语言服务器协议
│   │   │   ├── 📁 mcp/             # MCP (Model Context Protocol)
│   │   │   ├── 📁 tool/            # Agent 工具集
│   │   │   └── 📁 storage/         # 数据存储
│   │   └── 📄 package.json
│   │
│   ├── 📁 app/                    # 共享 Web UI 组件库
│   ├── 📁 console/                # 后台管理平台
│   │   ├── 📁 app/                # 前端应用
│   │   └── 📁 core/               # 后端 & 数据库
│   ├── 📁 desktop/                # 桌面应用 (Tauri)
│   ├── 📁 desktop-electron/       # Electron 桌面应用
│   ├── 📁 sdk/                    # JavaScript SDK
│   ├── 📁 ui/                     # UI 组件库
│   ├── 📁 plugin/                  # 插件系统
│   ├── 📁 shared/                  # 共享工具函数
│   ├── 📁 web/                    # 官方网站文档
│   ├── 📁 docs/                   # 产品文档 (MDX)
│   └── 📁 extensions/             # 第三方扩展
│
├── 📁 .github/                    # GitHub 配置
│   ├── 📁 workflows/              # CI/CD 工作流
│   ├── 📁 ISSUE_TEMPLATE/        # Issue 模板
│   └── 📄 VOUCHED.td              # 信任贡献者列表
│
└── 📄 nix/                        # Nix 包定义
```

---

## 🏗️ 项目架构

### 技术栈

| 层级 | 技术 |
|------|------|
| **运行时** | Bun 1.3+ |
| **前端框架** | SolidJS |
| **后端框架** | Hono |
| **数据库** | SQLite (Drizzle ORM) |
| **桌面应用** | Tauri / Electron |
| **AI SDK** | Vercel AI SDK |
| **UI 组件** | OpentUI |
| **构建工具** | Turborepo |
| **类型检查** | TypeScript |

### 包结构说明

| 包名 | 说明 |
|------|------|
| `opencode` | 核心 CLI 和 TUI 界面 |
| `app` | 共享 Web UI 组件 |
| `console` | SaaS 后台管理 |
| `desktop` | Tauri 桌面应用 |
| `sdk` | JavaScript SDK |
| `ui` | OpentUI 组件库 |

---

## 🚀 快速开始

### 环境要求

- **Bun** 1.3+

### 安装与启动

```bash
# 克隆仓库
git clone https://github.com/anomalyco/opencode.git
cd opencode

# 安装依赖
bun install

# 启动开发服务器 (TUI 模式)
bun dev

# 启动 Web 界面
bun dev:web

# 启动桌面应用
bun dev:desktop
```

### 常用开发命令

| 命令 | 说明 |
|------|------|
| `bun dev` | 启动 TUI 开发模式 |
| `bun dev <dir>` | 在指定目录启动 TUI |
| `bun dev serve` | 启动 API 服务器 (端口 4096) |
| `bun dev:web` | 启动 Web 界面 |
| `bun lint` | 运行代码检查 |
| `bun typecheck` | 运行类型检查 |
| `bun test` | 运行测试 |

### 测试运行

```bash
# 从包目录运行（不要从根目录运行）
cd packages/opencode
bun test

# 或使用 CI 模式（生成 JUnit 报告）
cd packages/opencode
bun test:ci
```

---

## 📐 规范化代码开发文档

### 1. 代码风格规范

#### 1.1 通用原则

```ts
// ✅ 推荐：保持函数简洁，单一职责
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// ❌ 避免：过度声明中间变量
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

#### 1.2 解构规范

```ts
// ✅ 推荐：直接使用点号访问
obj.a
obj.b

// ❌ 避免：不必要的解构
const { a, b } = obj
```

#### 1.3 变量声明

```ts
// ✅ 推荐：使用 const，优先使用三元表达式
const foo = condition ? 1 : 2

// ❌ 避免：使用 let + if/else
let foo
if (condition) foo = 1
else foo = 2
```

#### 1.4 控制流

```ts
// ✅ 推荐：使用早期返回
function foo() {
  if (condition) return 1
  return 2
}

// ❌ 避免：else 分支
function foo() {
  if (condition) return 1
  else return 2
}
```

#### 1.5 类型规范

```ts
// ✅ 推荐：避免 any，使用精确类型
const data: Record<string, number> = {}

// ❌ 避免：使用 any
const data: any = {}
```

#### 1.6 错误处理

```ts
// ✅ 推荐：优先使用 .catch() 或 Result 类型
await fetchData().catch(err => console.error(err))

// ❌ 避免：过度使用 try/catch
try {
  await fetchData()
} catch (e) {
  console.error(e)
}
```

### 2. Schema 定义规范 (Drizzle)

```ts
// ✅ 推荐：使用 snake_case 字段名
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// ❌ 避免：驼峰命名 + 显式字符串
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

### 3. 配置模块规范

在 `src/config` 目录添加新配置模块时，使用自导出模式：

```ts
// packages/opencode/src/config/index.ts
export * as ConfigAgent from "./agent"
export * as ConfigCommand from "./command"
// 添加新模块...
export * as ConfigNew from "./new"
```

### 4. 数组方法规范

```ts
// ✅ 推荐：使用函数式方法 (flatMap, filter, map)
// 使用类型守卫维持类型推断
const items = array.filter((x): x is Type => x !== null).map(x => x.id)

// ❌ 避免：使用 for 循环
```

### 5. 提交规范

PR 标题遵循 Conventional Commits：

| 类型 | 说明 | 示例 |
|------|------|------|
| `feat:` | 新功能 | `feat: add dark mode support` |
| `fix:` | Bug 修复 | `fix: resolve crash on startup` |
| `docs:` | 文档更新 | `docs: update contributing guidelines` |
| `chore:` | 维护任务 | `chore: bump dependency versions` |
| `refactor:` | 重构 | `refactor: simplify auth logic` |
| `test:` | 测试相关 | `test: add integration tests` |

可使用范围指定包：
```
feat(app): add new component
fix(desktop): resolve crash issue
```

### 6. 提交前检查清单

- [ ] 运行 `bun typecheck` 类型检查
- [ ] 运行 `bun lint` 代码检查
- [ ] 新功能添加测试
- [ ] 遵循风格指南
- [ ] PR 标题符合规范
- [ ] 关联 Issue 编号

### 7. Issue 提交规范

使用官方 Issue 模板：
- **Bug report** — 报告 Bug
- **Feature request** — 功能请求
- **Question** — 提问

> 注意：不使用模板的 Issue 会被自动关闭

---

## 🔧 调试指南

### VSCode 调试配置

参考配置示例：
- `.vscode/settings.example.json`
- `.vscode/launch.example.json`

### 调试命令

```bash
# 调试服务器 + TUI
bun run --inspect=ws://localhost:6499/ dev spawn

# 独立调试服务器
bun run --inspect=ws://localhost:6499/ --cwd packages/opencode ./src/index.ts serve --port 4096

# 独立调试 TUI
bun run --inspect=ws://localhost:6499/ --cwd packages/opencode --conditions=browser ./src/index.ts
```

### 环境变量

```bash
# 持久化调试选项
export BUN_OPTIONS=--inspect=ws://localhost:6499/
```

---

## 📦 构建发布

### 构建本地版本

```bash
# 编译独立可执行文件
./packages/opencode/script/build.ts --single

# 运行
./packages/opencode/dist/opencode-<platform>/bin/opencode
```

> 替换 `<platform>` 为你的平台 (如 `darwin-arm64`, `linux-x64`)

### 重新生成 SDK

修改 API 或 SDK 后运行：
```bash
./script/generate.ts
```

---

## 🧩 核心模块说明

### Agent 模块 (`packages/opencode/src/agent/`)

AI Agent 的核心逻辑，处理用户请求、决策和工具调用。

### CLI 模块 (`packages/opencode/src/cli/`)

命令行接口实现，包含 TUI、Web、Serve 等命令。

### Provider 模块 (`packages/opencode/src/provider/`)

LLM Provider 适配层，支持多种 AI 服务商：
- Anthropic
- OpenAI
- Google AI
- Azure
- 以及其他兼容的 AI 服务

### Server 模块 (`packages/opencode/src/server/`)

API 服务器实现，提供 headless 运行能力。

### LSP 模块 (`packages/opencode/src/lsp/`)

Language Server Protocol 实现，提供代码补全和诊断。

### MCP 模块 (`packages/opencode/src/mcp/`)

Model Context Protocol 支持。

### Tool 模块 (`packages/opencode/src/tool/`)

Agent 可使用的工具集，如文件操作、Shell 执行等。

### Storage 模块 (`packages/opencode/src/storage/`)

数据持久化，使用 Drizzle ORM + SQLite。

---

## 🤝 贡献指南

### 可接受的贡献类型

- Bug 修复
- 新增 LSP/Formatter 支持
- LLM 性能优化
- 新 Provider 支持
- 环境兼容性问题修复
- 文档改进

### UI 或核心功能变更

UI 或核心产品功能必须经过设计审查后才能实现。

### Issue 优先标签

- `help wanted` - 需要帮助
- `good first issue` - 适合新手
- `bug` - Bug 修复
- `perf` - 性能优化

---

## 📖 相关资源

- [官方文档](https://opencode.ai/docs)
- [Discord 社区](https://opencode.ai/discord)
- [GitHub Issues](https://github.com/anomalyco/opencode/issues)
