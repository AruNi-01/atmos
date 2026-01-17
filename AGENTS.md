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
│   ├── ui/                     # 共享 UI 组件 (@workspace/ui)
│   ├── shared/                 # 共享逻辑/类型
│   ├── config/                 # 共享配置
│   └── i18n/                   # 国际化配置
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

## UI 包命名规范

**重要**: UI 包使用 `@workspace/ui` 作为包名，遵循 shadcn 官方 monorepo 规范。

| 包名 | 用途 |
|------|------|
| `@workspace/ui` | UI 组件和样式（shadcn 官方规范） |
| `@vibe-habitat/config` | TypeScript/ESLint 配置 |
| `@vibe-habitat/shared` | 共享逻辑和类型 |
| `@vibe-habitat/i18n` | 国际化配置 |

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

## 🚀 开发指南

### 创建新的前端 App
为了保持架构一致性，创建新 App 必须遵循标准化步骤（包括配置 Tailwind v4 扫描路径、shadcn 别名映射等）。

详见：[**`apps/AGENTS.md` - 快速开始指南**](apps/AGENTS.md)

---

## UI Component Conventions

### 组件管理

- **统一存放**: 外部 UI 库（如 `shadcn-ui`、`animate-ui`、`coss-ui` 等）必须统一放置在 `packages/ui` 中。
- **禁止修改 (严格)**: `packages/ui/src/components/ui` 中的原子组件（Atomic UI）严禁直接修改。
- **自定义方式**: 如果应用层有特定需求，应通过引用原子组件进行包装（Wrapping）或在应用内部定义新的业务组件。
- **目录组织**:
  - `packages/ui/src/components/ui`: 存放基础原子组件（如 shadcn 基础组件）。
  - `packages/ui/src/components/animate`: 存放动画类 UI 组件。
  - `packages/ui/src/components/coss`: 存放 Coss UI 风格组件。
- **共享原则**: 严禁在 `apps/*` 中直接定义通用的基础 UI 组件。所有跨应用共享的 UI 组件必须下沉到 `packages/ui`。

### 引用方式

```tsx
// ✅ 正确：使用完整路径导入 (shadcn 组件在 ui/ 目录)
import { Button } from "@workspace/ui/components/ui/button";
import { Card } from "@workspace/ui/components/ui/card";

// ✅ 正确：自定义组件直接在 components/ 目录
import { ThemeToggle } from "@workspace/ui/components/theme-toggle";
import { LanguageSelector } from "@workspace/ui/components/language-selector";

// ✅ 正确：工具函数
import { cn } from "@workspace/ui/lib/utils";

// ❌ 错误：不要使用旧的包名
// import { Button } from "@vibe-habitat/ui";
```

### 样式和配置管理

```
packages/ui/                     # UI 包（@workspace/ui）
├── src/styles/globals.css ──────→ Tailwind v4 + 主题 tokens
├── postcss.config.mjs ──────────→ PostCSS 配置
└── components.json ─────────────→ shadcn 配置

apps/my-app/                     # 应用
├── src/app/globals.css ─────────→ @import "@workspace/ui/globals.css"
├── postcss.config.mjs ──────────→ import from "@workspace/ui/postcss.config"
├── components.json ─────────────→ aliases 指向 @workspace/ui
└── tsconfig.json ───────────────→ paths 映射 @workspace/ui/*
```

### 组件安装规范

在 Monorepo 中，组件的安装遵循 **“原子级共享，业务级隔离”** 的原则。

#### 1. 基础 UI 组件 (原子级)
所有通用的基础 UI 组件、第三方 UI 扩展库（如 Coss UI, Animate UI）必须统一安装在 `packages/ui` 中。

**安装命令 (在 `packages/ui` 目录下运行):**

```bash
# 安装标准 Shadcn 组件 -> 自动存入 src/components/ui/
bun ui:add <component-name>

# 安装 Coss UI 组件 -> 自动存入 src/components/coss/
bun ui:add:coss <component-name>

# 安装 Animate UI 组件 -> 自动存入 src/components/animate/
bun ui:add:animate <component-name>
```

#### 2. 业务组件 / 区块 (业务级)
特定于某个 App 的业务逻辑组件（如特定的登录表单、仪表盘模块）应安装在各 App 自己的目录中。

**安装方式 (在 `apps/my-app` 目录下运行):**

```bash
bunx shadcn@latest add <block-name>
```

**魔法效果:**
- CLI 会识别到该区块。
- 该区块所依赖的**原子 UI 组件**（如 Button, Input）会自动安装/下沉到 `packages/ui/src/components/ui`。
- 该**业务区块代码**会生成在 `apps/my-app/src/components/` 下。

---

## Code Style

- **Error Handling**: 显式处理错误，避免空 catch
- **Type Safety**: 严格模式，TS 避免 `any`，Rust 使用 `Result<T, E>`
- **Naming**: PascalCase (组件), camelCase (函数/变量), kebab-case (文件)

## Dependency Management

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
