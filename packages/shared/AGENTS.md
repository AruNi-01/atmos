# Shared Package - AGENTS.md

共享逻辑、类型定义和 hooks，供所有前端应用使用。

## 包信息

- **包名**: `@vibe-habitat/shared`
- **路径**: `packages/shared`

## 目录结构

```
packages/shared/
├── src/
│   ├── types/           # 共享类型定义
│   │   └── index.ts
│   ├── utils/           # 共享工具函数
│   │   └── index.ts
│   ├── hooks/           # 共享 React hooks
│   │   └── index.ts
│   └── index.ts         # 入口文件
├── package.json
└── tsconfig.json
```

## 使用方式

```tsx
// 导入类型
import type { User, ApiResponse, Locale } from "@vibe-habitat/shared";

// 导入工具函数
import { formatDate, sleep, generateId } from "@vibe-habitat/shared";

// 或从特定路径导入
import type { User } from "@vibe-habitat/shared/types";
import { formatDate } from "@vibe-habitat/shared/utils";
```

## 包含的内容

### 类型 (types/)

- `Locale` - 语言类型
- `User` - 用户类型
- `ApiResponse<T>` - API 响应包装类型

### 工具函数 (utils/)

- `formatDate(date, locale)` - 格式化日期
- `sleep(ms)` - 异步延时
- `generateId()` - 生成随机 ID

### Hooks (hooks/)

- 待添加共享 React hooks

## 添加新内容

1. 在对应目录创建文件
2. 在该目录的 `index.ts` 中导出
3. 在 `src/index.ts` 中确保导出
