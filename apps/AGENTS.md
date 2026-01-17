# Apps Directory - AGENTS.md

此目录包含 Monorepo 中的所有端侧应用程序（Web, Desktop, CLI, API 等）。

## 🚀 创建新的前端 App (Next.js)

遵循以下标准化步骤，确保新 App 能够正确接入 Monorepo 的共享基建。

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
    "ui": "@workspace/ui/components/ui"
  },
  "iconLibrary": "lucide"
}
```

### 步骤 5: 配置全局样式

更新 `src/app/globals.css`：

```css
/* 导入 UI 包的全局样式 */
@import "@workspace/ui/globals.css";

/* 显式映射 UI 包源码路径，确保 Tailwind v4 扫描到共享组件 */
@source "../../../../packages/ui/src";

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

---

## 🏗️ 应用架构规范

### 1. 别名使用规范 (`components.json`)
- **`ui`**: 必须指向 `@workspace/ui/components/ui`。
- **`utils`**: 必须指向 `@workspace/ui/lib/utils`。
- **`components`**: 指向本地 `@/components`，用于存放业务区块。

### 2. 样式继承
App 不应重复定义基础变量，应通过 `@import "@workspace/ui/globals.css"` 继承全局设计系统。

### 3. I18n 接入
所有前端 App 应接入 `@vibe-habitat/i18n` 以保持翻译逻辑的一致性。
