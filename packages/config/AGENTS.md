# Config Package - AGENTS.md

共享配置文件，包括 Tailwind CSS 4、TypeScript、ESLint、PostCSS 配置。

**所有前端项目统一使用**: Next.js 16 + Tailwind CSS 4 + shadcn/ui (zinc)

## 包信息

- **包名**: `@vibe-habitat/config`
- **路径**: `packages/config`

## 目录结构

```
packages/config/
├── styles/
│   └── base.css         # 共享基础样式 (Tailwind v4 + shadcn zinc)
├── tailwind/
│   └── index.ts         # 共享 Tailwind 配置
├── postcss/
│   └── index.js         # 共享 PostCSS 配置
├── typescript/
│   └── nextjs.json      # Next.js 项目 TS 配置
├── eslint/
│   └── next.js          # Next.js ESLint 配置 (待添加)
└── package.json
```

## 使用方式

### 1. 基础样式 (推荐)

在应用的 `globals.css` 中直接导入共享样式：

```css
/* 方式 1: 导入共享基础样式 (包含 Tailwind + shadcn 主题) */
@import "@vibe-habitat/config/styles/base.css";

/* 添加你的自定义样式 */
```

或者保留应用自己的 globals.css，只复用主题变量。

### 2. PostCSS 配置

在应用根目录创建 `postcss.config.js`：

```js
module.exports = require("@vibe-habitat/config/postcss");
```

### 3. TypeScript 配置

在应用的 `tsconfig.json` 中：

```json
{
  "extends": "@vibe-habitat/config/typescript/nextjs",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 4. Tailwind 配置

导入共享的主题 tokens：

```ts
import { colors, fontFamily, animation } from "@vibe-habitat/config/tailwind";
```

## 统一版本管理

根目录 `package.json` 的 `catalog` 字段记录了所有项目应使用的版本：

| 依赖 | 版本 | 用途 |
|------|------|------|
| `next` | 16.1.2 | 框架 |
| `react` | 19.2.3 | UI 库 |
| `tailwindcss` | ^4 | CSS 框架 |
| `@tailwindcss/postcss` | ^4 | PostCSS 插件 |
| `next-themes` | ^0.4.6 | 主题切换 |
| `next-intl` | ^4.7.0 | 国际化 |

## 创建新前端项目

1. 使用 `create-next-app` 创建项目
2. 添加共享包依赖:
   ```json
   {
     "dependencies": {
       "@vibe-habitat/ui": "workspace:*",
       "@vibe-habitat/shared": "workspace:*"
     }
   }
   ```
3. (可选) 使用共享的 postcss/tsconfig 配置
4. 运行 `bun install`
