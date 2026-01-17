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

## 🚀 创建新的前端 App

### 步骤 1: 创建 Next.js 项目

```bash
cd apps
npx -y create-next-app@latest my-app --typescript --tailwind --src-dir --app --turbopack
cd my-app
```

### 步骤 2: 更新 package.json

```json
{
  "name": "my-app",
  "dependencies": {
    "@workspace/ui": "workspace:*",
    "@vibe-habitat/i18n": "workspace:*",
    "@vibe-habitat/shared": "workspace:*"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "tailwindcss": "^4"
  }
}
```

### 步骤 3: 配置 TypeScript

在 `tsconfig.json` 中添加：

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@workspace/ui/*": ["../../packages/ui/src/*"]
    }
  }
}
```

### 步骤 4: 配置 shadcn

创建 `components.json`：

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "../../packages/ui/src/styles/globals.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "hooks": "@/hooks",
    "lib": "@/lib",
    "utils": "@workspace/ui/lib/utils",
    "ui": "@workspace/ui/components"
  },
  "iconLibrary": "lucide"
}
```

### 步骤 5: 配置全局样式

更新 `src/app/globals.css`：

```css
/* 导入 UI 包的全局样式 */
@import "@workspace/ui/globals.css";

/* 可选：导入额外的动画库 */
@import "tw-animate-css";

/* 应用自己的自定义样式 */
```

### 步骤 6: 配置 PostCSS

更新 `postcss.config.mjs`：

```js
import uiPostcssConfig from "@workspace/ui/postcss.config";
export default uiPostcssConfig;
```

### 步骤 7: 安装依赖并运行

```bash
cd ../..  # 回到根目录
bun install
bun --filter my-app dev
```

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

### 添加 shadcn 组件

```bash
# 在 packages/ui 中添加
cd packages/ui
bunx shadcn@latest add button dialog select

# 组件会自动添加到 src/components/ui/
```

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
