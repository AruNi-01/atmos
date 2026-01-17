# Config Package - AGENTS.md

共享配置文件，目前只包含 TypeScript 配置。

## 包信息

- **包名**: `@vibe-habitat/config`
- **路径**: `packages/config`

## 目录结构

```
packages/config/
├── typescript/
│   └── nextjs.json      # Next.js 项目 TS 配置
└── package.json
```

## 注意事项

### 样式配置已迁移

以下配置已移至 `@workspace/ui` 包：
- ❌ ~~`postcss/`~~ → 使用 `@workspace/ui/postcss.config`
- ❌ ~~`styles/`~~ → 使用 `@workspace/ui/globals.css`
- ❌ ~~`tailwind/`~~ → Tailwind v4 不需要配置文件

### ESLint 配置

ESLint 配置由各 App 自行管理，通常使用 `eslint-config-next`。

## 使用方式

### TypeScript 配置

在应用的 `tsconfig.json` 中：

```json
{
  "extends": "@vibe-habitat/config/typescript/nextjs",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@workspace/ui/*": ["../../packages/ui/src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

## 配置关系图

```
packages/
├── config/                  # TypeScript/ESLint 配置
│   └── typescript/
│       └── nextjs.json
│
└── ui/                      # UI + 样式配置 (独立管理)
    ├── postcss.config.mjs
    └── src/styles/globals.css
```

## 相关文档

- `packages/ui/AGENTS.md` - UI 包和样式配置
- `docs/official-example-comparison.md` - 配置对比
