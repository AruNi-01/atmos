# UI Package - AGENTS.md

统一的 UI 组件库，包含 shadcn/ui 组件、样式配置和主题系统。

**包名**: `@workspace/ui` (遵循 shadcn 官方 monorepo 规范)

## 包信息

- **包名**: `@workspace/ui`
- **路径**: `packages/ui`
- **版本**: `0.0.1`

## 目录结构

```
packages/ui/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn 组件
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── select.tsx
│   │   │   └── dropdown-menu.tsx
│   │   ├── theme-toggle.tsx
│   │   └── language-selector.tsx
│   ├── lib/
│   │   └── utils.ts         # cn() 等工具函数
│   ├── hooks/               # 共享 hooks
│   └── styles/
│       └── globals.css      # 全局样式 + Tailwind v4 + 主题 tokens
├── components.json          # shadcn 配置
├── postcss.config.mjs       # PostCSS 配置
├── tsconfig.json
└── package.json
```

## 核心功能

### 1. shadcn/ui 组件

所有 shadcn 组件统一放在 `packages/ui` 中，通过 `@workspace/ui` 导出。

**添加新组件**：
```bash
cd packages/ui
bunx shadcn@latest add <component-name>

# 组件会被添加到 src/components/ui/<component-name>.tsx
```

**在代码中使用**：
```tsx
import { Button } from "@workspace/ui/components/ui/button";
import { Card } from "@workspace/ui/components/ui/card";
import { ThemeToggle } from "@workspace/ui/components/theme-toggle";
import { cn } from "@workspace/ui/lib/utils";

export default function Page() {
  return (
    <Card>
      <Button>Click me</Button>
      <ThemeToggle />
    </Card>
  );
}
```

### 2. 全局样式和主题

`src/styles/globals.css` 包含：
- Tailwind CSS v4 配置（通过 `@import "tailwindcss"`）
- 主题 tokens（通过 `@theme` 指令）
- CSS 变量定义（light/dark 模式）
- 颜色系统（background, foreground, primary, secondary 等）
- 边框圆角系统（radius）

**特点**：
- ✅ 使用 Tailwind CSS v4（无需 `tailwind.config.ts`）
- ✅ 所有配置通过 CSS 完成
- ✅ 支持深色模式
- ✅ 使用 oklch 颜色空间

### 3. Package Exports

```json
{
  "exports": {
    "./globals.css": "./src/styles/globals.css",
    "./postcss.config": "./postcss.config.mjs",
    "./lib/*": "./src/lib/*.ts",
    "./components/*": "./src/components/*.tsx",
    "./hooks/*": "./src/hooks/*.ts"
  }
}
```

## 在 Apps 中使用

### 1. 安装依赖

在 `apps/*/package.json` 中添加：

```json
{
  "dependencies": {
    "@workspace/ui": "workspace:*"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "tailwindcss": "^4"
  }
}
```

### 2. 配置 TypeScript

在 `apps/*/tsconfig.json` 中：

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

### 3. 配置 shadcn

在 `apps/*/components.json` 中：

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

### 4. 导入全局样式

在 `apps/*/src/app/globals.css` 中：

```css
/* 导入 UI 包的全局样式 */
@import "@workspace/ui/globals.css";

/* 可选：导入额外的动画库 */
@import "tw-animate-css";

/* 应用自己的自定义样式 */
```

### 5. 配置 PostCSS

在 `apps/*/postcss.config.mjs` 中：

```js
// 直接使用 UI 包的 PostCSS 配置
import uiPostcssConfig from "@workspace/ui/postcss.config";

export default uiPostcssConfig;
```

### 6. 使用组件

```tsx
import { Button, Card } from "@workspace/ui/components/button";
import { ThemeToggle } from "@workspace/ui/components/theme-toggle";
import { cn } from "@workspace/ui/lib/utils";

export default function Page() {
  return (
    <div className="container mx-auto p-4">
      <Card>
        <Button>Submit</Button>
        <ThemeToggle />
      </Card>
    </div>
  );
}
```

## 配置关系图

```
packages/ui/
├── src/styles/globals.css ──────┐
├── postcss.config.mjs ──────────┤
└── components.json              │
                                 │
                                 ↓
apps/web/
├── src/app/globals.css ─────→ @import "@workspace/ui/globals.css"
├── postcss.config.mjs ──────→ import from "@workspace/ui/postcss.config"
├── components.json ─────────→ aliases 指向 @workspace/ui
└── tsconfig.json ───────────→ paths 映射 @workspace/ui/*
```

## 添加新的 shadcn 组件

### 步骤 1: 在 packages/ui 中添加

```bash
cd packages/ui
bunx shadcn@latest add <component-name>
```

shadcn CLI 会自动：
- 安装必要的依赖
- 创建组件文件到 `src/components/ui/<component-name>.tsx`
- 更新 `src/styles/globals.css`（如果需要）

### 步骤 2: 在 Apps 中使用

```tsx
import { ComponentName } from "@workspace/ui/components/<component-name>";
```

**注意**：不需要手动导出，直接通过路径导入即可。

## 自定义主题

修改 `src/styles/globals.css` 中的 CSS 变量：

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  --primary: oklch(0.21 0.006 285.885);
  /* ... */
}

.dark {
  --background: oklch(0.141 0.005 285.823);
  --foreground: oklch(0.985 0 0);
  --primary: oklch(0.92 0.004 286.32);
  /* ... */
}
```

## 设计原则

### ✅ DRY (Don't Repeat Yourself)
- 所有 shadcn 组件集中在 `packages/ui`
- Apps 通过 `@workspace/ui` 导入，避免重复

### ✅ 单一职责
- UI 包只负责组件和样式
- 配置包（`@vibe-habitat/config`）只负责 TypeScript/ESLint 配置

### ✅ 符合官方规范
- 包名使用 `@workspace/ui`（shadcn 官方推荐）
- 配置格式与官方示例一致
- Tailwind CSS v4 无需配置文件

### ✅ 灵活性
- Apps 可以导入 UI 包的全局样式
- Apps 也可以添加自己的自定义样式
- 支持主题定制

## 常见问题

### Q: 为什么使用 `@workspace/ui` 而不是 `@vibe-habitat/ui`？

A: 这是 shadcn 官方 monorepo 的推荐做法：
- 通用性：不绑定具体项目名
- 可移植性：换项目不需要修改配置
- 标准化：符合 workspace 协议规范

### Q: 为什么不需要 `tailwind.config.ts`？

A: Tailwind CSS v4 的新特性：
- 所有配置通过 CSS 的 `@theme` 指令完成
- 更简洁，更直观
- 在 `components.json` 中 `tailwind.config` 设为空字符串

### Q: 如何在 App 中添加自定义样式？

A: 在 `apps/*/src/app/globals.css` 中：
```css
@import "@workspace/ui/globals.css";

/* 你的自定义样式 */
.custom-class {
  /* ... */
}
```

### Q: shadcn CLI 在 Apps 中运行会怎样？

A: CLI 会根据 `components.json` 的配置：
- 基础 UI 组件添加到 `packages/ui`
- 业务组件（如 login-form）添加到 `apps/*/src/components`

## 版本管理

根目录 `package.json` 的 `catalog` 字段统一管理版本：

| 依赖 | 版本 | 用途 |
|------|------|------|
| `tailwindcss` | ^4 | CSS 框架 |
| `@tailwindcss/postcss` | ^4 | PostCSS 插件 |
| `next-themes` | ^0.4.6 | 主题切换 |
| `lucide-react` | ^0.562.0 | 图标库 |

## 相关文档

- [shadcn/ui 官方文档](https://ui.shadcn.com)
- [shadcn/ui Monorepo 指南](https://ui.shadcn.com/docs/monorepo)
- [Tailwind CSS v4 文档](https://tailwindcss.com)
- `docs/official-example-comparison.md` - 与官方示例的对比
- `docs/ui-usage-guide.md` - 详细使用指南
