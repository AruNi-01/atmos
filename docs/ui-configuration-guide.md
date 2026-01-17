# UI 包配置指南

本文档说明 `@workspace/ui` 包的配置和使用方式，完全遵循 shadcn 官方 monorepo 规范。

## 📌 核心概念

### 包名规范

| 包名 | 用途 |
|------|------|
| `@workspace/ui` | UI 组件和样式（shadcn 官方规范） |
| `@vibe-habitat/config` | TypeScript 配置 |
| `@vibe-habitat/shared` | 共享逻辑和类型 |
| `@vibe-habitat/i18n` | 国际化配置 |

**为什么使用 `@workspace/ui`？**
- 这是 shadcn 官方推荐的 monorepo 命名方式
- 通用性：不绑定具体项目名
- 可移植性：换项目不需要修改配置

## 📁 目录结构

```
packages/ui/
├── src/
│   ├── components/
│   │   ├── ui/                  # shadcn 组件
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   └── ...
│   │   ├── theme-toggle.tsx     # 自定义组件
│   │   └── language-selector.tsx
│   ├── lib/
│   │   └── utils.ts
│   ├── hooks/
│   └── styles/
│       └── globals.css          # Tailwind v4 配置
├── components.json              # shadcn 配置
├── postcss.config.mjs
└── package.json
```

## 🔧 配置关系

```
packages/ui/
├── src/styles/globals.css ──────────────→ Tailwind v4 + 主题 tokens
├── postcss.config.mjs ──────────────────→ PostCSS 配置
└── components.json ─────────────────────→ shadcn CLI 配置

                    ↓ 被 Apps 引用

apps/web/
├── src/app/globals.css ─────────────────→ @import "@workspace/ui/globals.css"
├── postcss.config.mjs ──────────────────→ import from "@workspace/ui/postcss.config"
├── components.json ─────────────────────→ aliases 指向 @workspace/ui
└── tsconfig.json ───────────────────────→ paths 映射 @workspace/ui/*
```

## 🚀 创建新 App 快速开始

### 步骤 1: 创建项目

```bash
cd apps
npx -y create-next-app@latest my-app --typescript --tailwind --src-dir --app --turbopack
```

### 步骤 2: 更新 package.json

```json
{
  "name": "my-app",
  "dependencies": {
    "@workspace/ui": "workspace:*"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "tailwindcss": "^4"
  }
}
```

### 步骤 3: 配置 tsconfig.json

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

### 步骤 4: 创建 components.json

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

### 步骤 5: 配置 globals.css

```css
/* 导入 UI 包的全局样式 */
@import "@workspace/ui/globals.css";

/* 可选：动画库 */
@import "tw-animate-css";

/* 应用自己的样式 */
```

### 步骤 6: 配置 postcss.config.mjs

```js
import uiPostcssConfig from "@workspace/ui/postcss.config";
export default uiPostcssConfig;
```

### 步骤 7: 安装并运行

```bash
cd ../..
bun install
bun --filter my-app dev
```

## 📦 使用组件

### 导入规则

```tsx
// ✅ shadcn 组件（在 ui/ 目录下）
import { Button } from "@workspace/ui/components/ui/button";
import { Card } from "@workspace/ui/components/ui/card";
import { Dialog } from "@workspace/ui/components/ui/dialog";

// ✅ 自定义组件（直接在 components/ 目录）
import { ThemeToggle } from "@workspace/ui/components/theme-toggle";
import { LanguageSelector } from "@workspace/ui/components/language-selector";

// ✅ 工具函数
import { cn } from "@workspace/ui/lib/utils";
```

### 完整示例

```tsx
import { Button } from "@workspace/ui/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@workspace/ui/components/ui/card";
import { ThemeToggle } from "@workspace/ui/components/theme-toggle";
import { cn } from "@workspace/ui/lib/utils";

export default function MyPage() {
  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent>
          <Button>Click me</Button>
          <ThemeToggle />
        </CardContent>
      </Card>
    </div>
  );
}
```

## ➕ 添加 shadcn 组件

### 在 packages/ui 中添加

```bash
cd packages/ui
bunx shadcn@latest add button dialog select table
```

组件会自动添加到 `src/components/ui/` 目录。

### 在 App 中添加业务组件

```bash
cd apps/web
bunx shadcn@latest add login-01
```

CLI 会自动：
- 基础组件添加到 `packages/ui`
- 业务组件添加到 `apps/web/src/components`

## 🎨 Tailwind CSS v4

本项目使用 Tailwind CSS v4，不需要 `tailwind.config.ts` 文件。

所有主题配置在 `packages/ui/src/styles/globals.css` 中：

```css
@import "tailwindcss";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* ... */
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  /* ... */
}

.dark {
  --background: oklch(0.141 0.005 285.823);
  /* ... */
}
```

## 📋 检查清单

新建 App 时确保：

- [ ] `package.json` 添加 `@workspace/ui: workspace:*`
- [ ] `tsconfig.json` 添加 `@workspace/ui/*` 路径映射
- [ ] `components.json` 配置正确的 aliases
- [ ] `globals.css` 导入 `@workspace/ui/globals.css`
- [ ] `postcss.config.mjs` 导入 UI 包配置
- [ ] 运行 `bun install`

## 📚 相关文档

- `packages/ui/AGENTS.md` - UI 包详细文档
- `AGENTS.md` - 项目整体文档
- [shadcn/ui Monorepo 指南](https://ui.shadcn.com/docs/monorepo)
