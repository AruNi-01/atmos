# UI 包使用指南

## 快速开始

### 1. 在新的 App 中使用 UI 包

#### 安装依赖

在 `apps/your-app/package.json` 中添加：

```json
{
  "dependencies": {
    "@vibe-habitat/ui": "workspace:*",
    "@vibe-habitat/i18n": "workspace:*"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "tailwindcss": "^4"
  }
}
```

运行：
```bash
bun install
```

#### 配置样式

创建 `apps/your-app/src/app/globals.css`：

```css
/* 导入 UI 包的全局样式 */
@import "@vibe-habitat/ui/styles";

/* 可选：导入额外的动画库 */
@import "tw-animate-css";

/* 你的自定义样式 */
.custom-class {
  /* ... */
}
```

#### 配置 PostCSS

创建 `apps/your-app/postcss.config.mjs`：

```js
import uiPostcssConfig from "@vibe-habitat/ui/postcss";

export default uiPostcssConfig;
```

#### 在 Layout 中导入样式

在 `apps/your-app/src/app/layout.tsx` 中：

```tsx
import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

### 2. 使用 UI 组件

```tsx
import { 
  Button, 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent,
  Input,
  Label,
  ThemeToggle,
  LanguageSelector
} from "@vibe-habitat/ui";

export default function Page() {
  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Enter your name" />
            </div>
            <Button>Submit</Button>
          </div>
        </CardContent>
      </Card>
      
      <div className="flex gap-2 mt-4">
        <ThemeToggle />
        <LanguageSelector />
      </div>
    </div>
  );
}
```

## 常用组件

### 按钮

```tsx
import { Button } from "@vibe-habitat/ui";

<Button variant="default">Default</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

<Button size="default">Default</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon">🔥</Button>
```

### 卡片

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@vibe-habitat/ui";

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description goes here</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card content</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### 输入框

```tsx
import { Input, Label } from "@vibe-habitat/ui";

<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input 
    id="email" 
    type="email" 
    placeholder="you@example.com" 
  />
</div>
```

### 下拉菜单

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@vibe-habitat/ui";

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline">Open Menu</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuLabel>My Account</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem>Profile</DropdownMenuItem>
    <DropdownMenuItem>Settings</DropdownMenuItem>
    <DropdownMenuItem>Logout</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### 主题切换

```tsx
import { ThemeToggle } from "@vibe-habitat/ui";

<ThemeToggle />
```

### 语言选择器

```tsx
import { LanguageSelector } from "@vibe-habitat/ui";

<LanguageSelector />
```

## 添加新的 shadcn 组件

### 步骤 1: 添加组件

```bash
cd packages/ui
bunx shadcn@latest add <component-name>
```

例如：
```bash
bunx shadcn@latest add dialog
bunx shadcn@latest add select
bunx shadcn@latest add table
```

### 步骤 2: 导出组件

在 `packages/ui/src/index.ts` 中添加：

```ts
export * from "./components/ui/<component-name>";
```

### 步骤 3: 在 App 中使用

```tsx
import { Dialog } from "@vibe-habitat/ui";
```

## 自定义主题

### 修改颜色

编辑 `packages/ui/src/styles/globals.css`：

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

### 修改圆角

```css
:root {
  --radius: 0.625rem; /* 默认 */
  /* 或者 */
  --radius: 0.5rem;   /* 更小的圆角 */
  --radius: 1rem;     /* 更大的圆角 */
}
```

## Tailwind 工具类

UI 包已经配置好了 Tailwind CSS 4，你可以直接使用所有 Tailwind 类：

```tsx
<div className="flex items-center justify-between p-4 bg-background text-foreground">
  <h1 className="text-2xl font-bold">Title</h1>
  <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
    Click me
  </Button>
</div>
```

### 常用的主题颜色类

- `bg-background` / `text-foreground`
- `bg-card` / `text-card-foreground`
- `bg-primary` / `text-primary-foreground`
- `bg-secondary` / `text-secondary-foreground`
- `bg-muted` / `text-muted-foreground`
- `bg-accent` / `text-accent-foreground`
- `bg-destructive` / `text-destructive-foreground`
- `border-border`
- `ring-ring`

### 圆角类

- `rounded-sm` - `calc(var(--radius) - 4px)`
- `rounded-md` - `calc(var(--radius) - 2px)`
- `rounded-lg` - `var(--radius)`
- `rounded-xl` - `calc(var(--radius) + 4px)`
- `rounded-2xl` - `calc(var(--radius) + 8px)`

## 工具函数

### cn() - 条件类名合并

```tsx
import { cn } from "@vibe-habitat/ui";

<div className={cn(
  "base-class",
  isActive && "active-class",
  isDisabled && "disabled-class"
)}>
  Content
</div>
```

## 最佳实践

### ✅ 推荐

1. **使用 UI 包的组件**
   ```tsx
   import { Button } from "@vibe-habitat/ui";
   ```

2. **使用主题颜色变量**
   ```tsx
   <div className="bg-background text-foreground">
   ```

3. **在 App 中添加自定义样式**
   ```css
   /* apps/your-app/src/app/globals.css */
   @import "@vibe-habitat/ui/styles";
   
   .custom-component {
     /* 你的样式 */
   }
   ```

### ❌ 避免

1. **不要在 App 中重复定义 Tailwind 配置**
   ```ts
   // ❌ 不要这样做
   // apps/your-app/tailwind.config.ts
   ```

2. **不要修改 UI 包的原子组件**
   ```tsx
   // ❌ 不要直接修改
   // packages/ui/src/components/ui/button.tsx
   ```

3. **不要在 App 中重复定义主题变量**
   ```css
   /* ❌ 不要这样做 */
   :root {
     --background: ...;
   }
   ```

## 故障排除

### 样式不生效

1. 确保已导入全局样式：
   ```css
   @import "@vibe-habitat/ui/styles";
   ```

2. 确保 PostCSS 配置正确：
   ```js
   import uiPostcssConfig from "@vibe-habitat/ui/postcss";
   export default uiPostcssConfig;
   ```

3. 重启开发服务器：
   ```bash
   bun run dev
   ```

### 组件导入错误

确保已安装依赖：
```bash
bun install
```

### TypeScript 错误

确保 tsconfig.json 配置了路径别名：
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## 更多资源

- [shadcn/ui 文档](https://ui.shadcn.com)
- [Tailwind CSS 文档](https://tailwindcss.com)
- [Next.js 文档](https://nextjs.org)
- `packages/ui/AGENTS.md` - UI 包详细文档
