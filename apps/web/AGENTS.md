# Web Application - AGENTS.md

## 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| **框架** | Next.js | 16.x |
| **UI 库** | React | 19.x |
| **样式** | Tailwind CSS | 4.x |
| **组件库** | shadcn/ui | latest (zinc color) |
| **主题** | next-themes | 0.4.x |
| **国际化** | next-intl | 4.x |
| **包管理** | Bun | latest |
| **构建工具** | Turbopack | (内置于 Next.js) |

## 项目结构

```
apps/web/
├── messages/              # 国际化翻译文件
│   ├── en.json
│   └── zh.json
├── public/                # 静态资源
├── src/
│   ├── app/
│   │   ├── [locale]/      # 国际化路由
│   │   │   ├── layout.tsx # 带 Provider 的布局
│   │   │   └── page.tsx   # 首页
│   │   └── globals.css    # 全局样式 (shadcn CSS 变量)
│   ├── components/
│   │   ├── providers/     # Context Provider
│   │   │   └── theme-provider.tsx
│   │   └── ui/            # shadcn UI 组件
│   ├── i18n/              # 国际化配置
│   │   ├── config.ts      # 语言配置
│   │   ├── navigation.ts  # 国际化导航工具
│   │   ├── request.ts     # 服务端消息加载
│   │   └── routing.ts     # 路由配置
│   └── lib/
│       └── utils.ts       # 工具函数 (cn)
├── middleware.ts          # next-intl 中间件
├── next.config.ts         # Next.js 配置
├── package.json
├── components.json        # shadcn 配置
└── tsconfig.json
```

## 常用命令

```bash
# 开发
bun dev              # 启动开发服务器 (http://localhost:3000)

# 构建
bun build            # 生产构建
bun start            # 启动生产服务器

# 代码检查
bun lint             # ESLint 检查

# 添加 shadcn 组件
npx shadcn@latest add button  # 添加 Button 组件
npx shadcn@latest add card    # 添加 Card 组件
```

## 国际化使用

### 支持的语言

- `en` - English (默认)
- `zh` - 中文

### 添加翻译

1. 在 `messages/en.json` 和 `messages/zh.json` 中添加翻译键值对
2. 在组件中使用 `useTranslations` hook：

```tsx
import { useTranslations } from "next-intl";

function MyComponent() {
  const t = useTranslations("namespace");
  return <h1>{t("key")}</h1>;
}
```

### 国际化导航

```tsx
import { Link, useRouter, usePathname } from "@/i18n/navigation";

// 使用 Link 组件
<Link href="/about">About</Link>

// 使用 router
const router = useRouter();
router.push("/about");

// 获取当前路径
const pathname = usePathname();
```

## 主题切换

使用 `next-themes` 实现主题切换：

```tsx
"use client";
import { useTheme } from "next-themes";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  
  return (
    <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      Toggle Theme
    </button>
  );
}
```

## 代码规范

### 文件命名

- **组件**: `kebab-case.tsx` (例: `theme-provider.tsx`)
- **工具函数**: `kebab-case.ts`
- **类型定义**: 与相关文件放一起或 `types/` 目录

### 组件规范

- 客户端组件需添加 `"use client"` 指令
- 服务端组件默认，尽量使用服务端组件
- Props 使用 TypeScript 类型定义

### 路由规范

- 所有页面路由放在 `src/app/[locale]/` 下
- 使用 `setRequestLocale(locale)` 启用静态渲染
- 使用 `generateStaticParams` 预生成静态页面

## 与 Monorepo 集成

```bash
# 从根目录运行
make dev-web          # 或 bun --filter web dev
make build-web        # 或 bun --filter web build
```

共享包使用:
- `@vibe-habitat/ui` - 共享 UI 组件 (packages/ui)
- `@vibe-habitat/shared` - 共享逻辑/类型 (packages/shared)
