# Context For Agent

## Monorepo Structure

```
vibe-habitat/
├── apps/                       # 应用程序
│   ├── web/                    # Web 应用
│   ├── desktop/                # Tauri 桌面应用
│   ├── cli/                    # CLI 工具 (vh)
│   ├── api/                    # 后端 API
│   ├── docs/                   # 文档站点
│   └── landing/                # 主页
├── packages/                   # 前端共享包
│   ├── ui/                     # 共享 UI 组件
│   ├── shared/                 # 共享逻辑/类型
│   └── config/                 # 共享配置
├── crates/                     # Rust 共享 crate
│   ├── common/                 # 共享业务逻辑
│   ├── db/                     # 数据库逻辑
│   └── models/                 # 共享数据模型
├── docs/                       # 项目文档
├── package.json                # Bun workspace
├── Cargo.toml                  # Rust workspace
└── justfile                    # 任务运行器
```

## 技术栈

| 类别 | 技术 |
|------|------|
| **前端** | Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui (zinc) |
| **桌面** | Tauri + 共享前端 |
| **后端** | Rust (Axum/Actix) |
| **CLI** | Rust (clap) |
| **国际化** | next-intl |
| **主题** | next-themes |
| **包管理** | Bun (前端) + Cargo (Rust) |

## 代码复用策略

- **前端**: `apps/web`, `apps/desktop/src`, `apps/landing`, `apps/docs` → 共享 `packages/*`
- **Rust**: `apps/api`, `apps/cli`, `apps/desktop/src-tauri` → 共享 `crates/*`

## Quick Start

```bash
# 安装依赖
bun install

# 查看所有可用命令
just

# 常用命令
just dev-web      # 启动 Web 开发服务器
just dev-api      # 启动 API 服务器
just dev-cli      # 运行 CLI
just build-all    # 构建所有项目
just lint         # 代码检查
just test         # 运行测试
```

## Justfile 命令概览

| 命令 | 说明 |
|------|------|
| `just dev-web` | 启动 Web 开发服务器 |
| `just dev-desktop` | 启动 Desktop (Tauri) 开发 |
| `just dev-api` | 启动 API 服务器 |
| `just dev-cli` | 运行 CLI |
| `just build-all` | 构建所有项目 |
| `just lint` | 代码检查 |
| `just fmt` | 格式化代码 |
| `just test` | 运行所有测试 |
| `just clean` | 清理构建产物 |
| `just ci` | 完整 CI 流程 |

## Shared Conventions

### Code Style

- **Error Handling**: 显式处理错误，避免空 catch
- **Type Safety**: 严格模式，TS 避免 `any`，Rust 使用 `Result<T, E>`
- **Naming**: PascalCase (组件), camelCase (函数/变量), kebab-case (文件)

### UI Component Conventions

- **统一存放**: 外部 UI 库（如 `shadcn-ui`、`animate-ui`、`coss-ui` 等）必须统一放置在 `packages/ui` 中。
- **禁止修改 (严格)**: `packages/ui/src/components/ui` 中的原子组件（Atomic UI）严禁直接修改。
- **自定义方式**: 如果应用层有特定需求，应通过引用原子组件进行包装（Wrapping）或在应用内部定义新的业务组件。
- **目录组织**:
  - `packages/ui/src/components/ui`: 存放基础原子组件（如 shadcn 基础组件）。
  - `packages/ui/src/components/animate`: 存放动画类 UI 组件。
  - `packages/ui/src/components/coss`: 存放 Coss UI 风格组件。
- **共享原则**: 严禁在 `apps/*` 中直接定义通用的基础 UI 组件。所有跨应用共享的 UI 组件必须下沉到 `packages/ui`。
- **引用方式**: 各应用通过 `@vibe-habitat/ui` 引用组件，保持界面风格的一致性。

### Dependency Management

```bash
# 前端
bun install                    # 安装所有依赖
bun --filter <app> dev         # 运行指定应用

# Rust
cargo build --workspace        # 构建所有 Rust 项目
cargo test --workspace         # 测试所有 Rust 项目
```

## Project-Specific Details

各项目的详细文档请查看对应的 `AGENTS.md`:

| 项目 | 文档 |
|------|------|
| Web 应用 | [`apps/web/AGENTS.md`](apps/web/AGENTS.md) |
| Desktop 应用 | [`apps/desktop/AGENTS.md`](apps/desktop/AGENTS.md) |
| CLI 工具 | [`apps/cli/AGENTS.md`](apps/cli/AGENTS.md) |
| API 服务 | [`apps/api/AGENTS.md`](apps/api/AGENTS.md) |
| 共享 UI | [`packages/ui/AGENTS.md`](packages/ui/AGENTS.md) |
| 共享逻辑 | [`packages/shared/AGENTS.md`](packages/shared/AGENTS.md) |
| 共享配置 | [`packages/config/AGENTS.md`](packages/config/AGENTS.md) |

## CLI 工具 (vh)

CLI 工具专为用户和 LLM/Agent 设计，支持多种输出格式：

```bash
vh --help                      # 查看帮助
vh --output json <command>     # JSON 格式 (推荐 LLM 使用)
vh --output table <command>    # 表格格式
```

详见 [`apps/cli/AGENTS.md`](apps/cli/AGENTS.md)
