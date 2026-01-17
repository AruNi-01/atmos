# 配置更新：完全匹配 shadcn 官方示例

## 🎯 关键发现

通过对比官方示例 `/Users/username/Desktop/monorepo-shadcn`，发现了关键区别：

### 官方使用 `@workspace/ui` 作为包名

**不是** `@vibe-habitat/ui`，而是直接使用 `@workspace/ui`！

## ✅ 已完成的更新

### 1. packages/ui/package.json
```json
{
  "name": "@workspace/ui",  // ✅ 改为 @workspace/ui
  "exports": {
    "./globals.css": "./src/styles/globals.css",
    "./postcss.config": "./postcss.config.mjs",
    "./lib/*": "./src/lib/*.ts",
    "./components/*": "./src/components/*.tsx",
    "./hooks/*": "./src/hooks/*.ts"
  }
}
```

### 2. apps/*/package.json
```json
{
  "dependencies": {
    "@workspace/ui": "workspace:*"  // ✅ 使用 @workspace/ui
  }
}
```

### 3. apps/*/tsconfig.json
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@workspace/ui/*": ["../../packages/ui/src/*"]  // ✅ 只需要这一个映射
    }
  }
}
```

### 4. apps/*/components.json
```json
{
  "aliases": {
    "components": "@/components",
    "hooks": "@/hooks",
    "lib": "@/lib",
    "utils": "@workspace/ui/lib/utils",  // ✅ 使用 @workspace/ui
    "ui": "@workspace/ui/components"
  }
}
```

### 5. 代码导入方式
```typescript
// ✅ 使用完整路径导入
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { ThemeToggle } from "@workspace/ui/components/theme-toggle";
```

### 6. CSS 导入
```css
/* apps/*/src/app/globals.css */
@import "@workspace/ui/globals.css";  /* ✅ 使用 globals.css */
```

### 7. PostCSS 配置
```javascript
// apps/*/postcss.config.mjs
import uiPostcssConfig from "@workspace/ui/postcss.config";  // ✅ 使用 postcss.config
export default uiPostcssConfig;
```

## 📊 与官方示例的对比

| 配置项 | 官方示例 | 我们的配置 | 状态 |
|--------|----------|------------|------|
| UI 包名 | `@workspace/ui` | `@workspace/ui` | ✅ 匹配 |
| exports 格式 | `./globals.css`, `./postcss.config` | `./globals.css`, `./postcss.config` | ✅ 匹配 |
| TypeScript paths | `@workspace/ui/*` | `@workspace/ui/*` | ✅ 匹配 |
| 导入方式 | `@workspace/ui/components/button` | `@workspace/ui/components/button` | ✅ 匹配 |
| components.json | `@workspace/ui/components` | `@workspace/ui/components` | ✅ 匹配 |

## 🎨 使用方式

### 添加 shadcn 组件
```bash
# 在 packages/ui 中添加
cd packages/ui
bunx shadcn@latest add button

# 组件会被添加到 src/components/ui/button.tsx
```

### 在代码中使用
```typescript
// 直接导入具体组件
import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { cn } from "@workspace/ui/lib/utils";

export default function Page() {
  return (
    <Card>
      <Button>Click me</Button>
    </Card>
  );
}
```

## ✨ 核心优势

1. **完全匹配官方** - 配置与 shadcn 官方示例一致
2. **通用性** - `@workspace/ui` 不绑定项目名
3. **可移植性** - 换项目不需要修改配置
4. **shadcn CLI 支持** - CLI 能正确识别并工作

## 🔧 验证

- ✅ `bun install` - 依赖安装成功
- ✅ `bun run build` (apps/web) - 构建成功
- ✅ shadcn CLI 在 packages/ui 中正常工作
- ✅ TypeScript 类型检查通过
- ✅ 导入路径正确解析

## 📝 总结

通过参考官方示例，我们发现关键是：
1. **包名就是 `@workspace/ui`**（不是 `@vibe-habitat/ui`）
2. **exports 使用简短路径**（`./globals.css` 而不是 `./styles`）
3. **导入使用完整路径**（`@workspace/ui/components/button`）

这样的配置既符合官方规范，又能让所有工具正常工作！🎉
