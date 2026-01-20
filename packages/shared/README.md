# Shared Package - Code Structure

> **📂 This document explains the file/folder structure** within the shared package. For working instructions, see [AGENTS.md](./AGENTS.md).

---

## 📁 Directory Structure

```
packages/shared/
├── src/
│   ├── utils/                  # Utility functions
│   │   ├── format.ts           # Formatting utilities
│   │   ├── validation.ts       # Validation helpers
│   │   └── string.ts           # String manipulation
│   │
│   ├── hooks/                  # Shared React hooks
│   │   ├── use-local-storage.ts
│   │   ├── use-debounce.ts
│   │   └── use-media-query.ts
│   │
│   ├── types/                  # TypeScript types
│   │   ├── common.ts           # Common types
│   │   ├── api.ts              # API response types
│   │   └── user.ts             # User-related types
│   │
│   ├── constants/              # Constants and enums
│   │   ├── routes.ts           # Route constants
│   │   ├── config.ts           # App configuration
│   │   └── errors.ts           # Error messages
│   │
│   └── lib/                    # Core libraries
│       ├── api-client.ts       # API client
│       └── logger.ts           # Logging utilities
│
├── package.json                # Package metadata
├── tsconfig.json               # TypeScript configuration
├── AGENTS.md                   # Working instructions
└── README.md                   # This file
```

---

## 📝 Module Organization

### 1. Utils (`src/utils/`)

Pure utility functions with no dependencies.

**Examples**:
```typescript
// src/utils/format.ts
export function formatDate(date: Date): string { ... }
export function formatCurrency(amount: number): string { ... }

// src/utils/validation.ts
export function isValidEmail(email: string): boolean { ... }
export function isValidUrl(url: string): boolean { ... }
```

**Usage**:
```tsx
import { formatDate, formatCurrency } from "@atmos/shared/utils/format";
import { isValidEmail } from "@atmos/shared/utils/validation";
```

---

### 2. Hooks (`src/hooks/`)

Shared React hooks for common functionality.

**Examples**:
```typescript
// src/hooks/use-local-storage.ts
export function useLocalStorage<T>(key: string, initialValue: T) { ... }

// src/hooks/use-debounce.ts
export function useDebounce<T>(value: T, delay: number) { ... }
```

**Usage**:
```tsx
import { useLocalStorage } from "@atmos/shared/hooks/use-local-storage";
import { useDebounce } from "@atmos/shared/hooks/use-debounce";

function MyComponent() {
  const [value, setValue] = useLocalStorage("key", "default");
  const debouncedValue = useDebounce(value, 500);
}
```

---

### 3. Types (`src/types/`)

Shared TypeScript types and interfaces.

**Examples**:
```typescript
// src/types/common.ts
export type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

// src/types/user.ts
export interface User {
  id: string;
  name: string;
  email: string;
}
```

**Usage**:
```tsx
import type { Result, User } from "@atmos/shared/types";
```

---

### 4. Constants (`src/constants/`)

Application-wide constants.

**Examples**:
```typescript
// src/constants/routes.ts
export const ROUTES = {
  HOME: "/",
  ABOUT: "/about",
  DASHBOARD: "/dashboard",
} as const;

// src/constants/config.ts
export const CONFIG = {
  API_BASE_URL: process.env.NEXT_PUBLIC_API_URL,
  APP_NAME: "ATMOS",
} as const;
```

**Usage**:
```tsx
import { ROUTES, CONFIG } from "@atmos/shared/constants";
```

---

### 5. Libraries (`src/lib/`)

Core libraries and client implementations.

**Examples**:
```typescript
// src/lib/api-client.ts
export class ApiClient {
  async get<T>(endpoint: string): Promise<T> { ... }
  async post<T>(endpoint: string, data: unknown): Promise<T> { ... }
}

// src/lib/logger.ts
export const logger = {
  info: (message: string) => { ... },
  error: (message: string, error: Error) => { ... },
};
```

**Usage**:
```tsx
import { ApiClient } from "@atmos/shared/lib/api-client";
import { logger } from "@atmos/shared/lib/logger";
```

---

## 📦 Package Exports

Configure in `package.json`:

```json
{
  "name": "@atmos/shared",
  "exports": {
    "./utils/*": "./src/utils/*.ts",
    "./hooks/*": "./src/hooks/*.ts",
    "./types/*": "./src/types/*.ts",
    "./types": "./src/types/index.ts",
    "./constants": "./src/constants/index.ts",
    "./lib/*": "./src/lib/*.ts"
  }
}
```

---

## 🎯 Design Principles

### 1. Pure Functions
Utilities should be pure functions with no side effects.

```typescript
// ✅ Good: Pure function
export function formatDate(date: Date): string {
  return date.toISOString();
}

// ❌ Bad: Side effects
let lastDate: Date;
export function formatDate(date: Date): string {
  lastDate = date; // Side effect!
  return date.toISOString();
}
```

### 2. Framework Agnostic
Utils and types should work in any environment.

```typescript
// ✅ Good: Works anywhere
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ⚠️ OK: React-specific (in hooks/)
export function useDebounce<T>(value: T, delay: number) { ... }
```

### 3. Type Safety
Always provide full TypeScript types.

```typescript
// ✅ Good: Fully typed
export function formatCurrency(
  amount: number,
  currency: string = "USD"
): string { ... }

// ❌ Bad: Missing types
export function formatCurrency(amount, currency = "USD") { ... }
```

---

## 🚫 What NOT to Put Here

❌ **DON'T** add UI components (use `@workspace/ui`)
❌ **DON'T** add app-specific business logic
❌ **DON'T** add framework-specific code (except in `hooks/`)
❌ **DON'T** add backend-only code

---

## ✅ What TO Put Here

✅ **DO** add reusable utilities
✅ **DO** add shared TypeScript types
✅ **DO** add common React hooks
✅ **DO** add application constants
✅ **DO** add shared API clients

---

## 🧪 Testing

```
packages/shared/
├── src/
│   └── utils/
│       └── format.ts
└── __tests__/
    └── utils/
        └── format.test.ts
```

**Example Test**:
```typescript
import { formatDate } from "../src/utils/format";

describe("formatDate", () => {
  it("should format date correctly", () => {
    const date = new Date("2024-01-01");
    expect(formatDate(date)).toBe("2024-01-01T00:00:00.000Z");
  });
});
```

---

## 📦 Dependencies

### Production Dependencies
- Minimal dependencies (prefer zero-dependency utils)
- Only add if truly necessary

### Development Dependencies
- `typescript`: Type checking
- `@types/*`: Type definitions
- `@atmos/config`: Shared configs

---

## 🔗 Related Documentation

- **Working Instructions**: [AGENTS.md](./AGENTS.md)
- **Package Overview**: [../AGENTS.md](../AGENTS.md)
- **Usage in Apps**: [../../apps/AGENTS.md](../../apps/AGENTS.md)

---

**For Development**: See [AGENTS.md](./AGENTS.md) for usage patterns and contribution guidelines.
