# UI Package - AGENTS.md

共享 UI 组件库，供 `apps/web`、`apps/desktop`、`apps/landing`、`apps/docs` 等前端应用使用。

## 包信息

- **包名**: `@vibe-habitat/ui`
- **路径**: `packages/ui`

## 目录结构

```
packages/ui/
├── src/
│   ├── components/       # UI 组件
│   │   ├── ui/           # shadcn 原子组件 (如 button.tsx)
│   │   ├── animate/      # 动画组件 (animate-ui)
│   │   ├── coss/         # Coss UI 风格组件
│   │   └── ...           # 其他业务级共享组件
│   ├── lib/
│   │   └── utils.ts      # cn 函数等工具
│   └── index.ts          # 入口文件
├── package.json
└── tsconfig.json
```

## 使用方式

在其他应用中使用：

```tsx
// 导入组件
import { Button } from "@vibe-habitat/ui";

// 导入工具函数
import { cn } from "@vibe-habitat/ui";

// 或从特定路径导入
import { cn } from "@vibe-habitat/ui/lib/utils";
```

## 包含的依赖

| 依赖 | 用途 |
|------|------|
| `clsx` | 合并类名 |
| `tailwind-merge` | 智能合并 Tailwind 类名 |
| `class-variance-authority` | 组件变体管理 |
| `lucide-react` | 图标库 |
| `@radix-ui/react-slot` | asChild 功能支持 |

## 添加新组件

1. 在 `src/components/` 创建组件文件
2. 在 `src/index.ts` 中导出组件
3. 运行 `bun install` 确保类型更新

## UI 库规范 (shadcn-ui, animate-ui, coss-ui)

为了保持多端（Web, Desktop, Landing, Docs）UI 的统一性，所有三方库引入的组件必须统一收纳：

1. **shadcn-ui**: 基础原子组件存放在 `src/components/ui`。**严禁直接修改此类组件**。
2. **animate-ui**: 动画效果组件存放在 `src/components/animate` / `src/components/animate-ui`。
3. **coss-ui**: 特定风格组件存放在 `src/components/coss`。

### 操作流程：

- **引入**: 如果在应用层（如 `apps/web`）使用了 `shadcn add`，请在完成后将其迁移至 `packages/ui/src/components/ui` 并通过 `src/index.ts` 导出。
- **自定义**: 严禁修改 `src/components/ui` 下的源文件。如需扩展功能或样式，请在应用层通过 `displayName` 包装或使用 `Tailwind` 类名透传。
- **共享**: 严禁在应用层私自克隆或存放这些三方 UI 组件。
- **依赖**: 如果组件依赖新的第三方包（如 `framer-motion`），请在 `packages/ui` 的 `package.json` 中添加该依赖。
