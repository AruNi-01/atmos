# Shared Utilities - AGENTS.md

> **🎁 @atmos/shared**: Logic and hooks shared across the frontend ecosystem.

---

## Build And Test

- **Typecheck**: `bun run --filter shared typecheck`
- No build step — this is a library package

---

## 📁 Directory Structure

```
packages/shared/
└── src/
    ├── hooks/               # Generic React hooks
    ├── utils/               # Framework-agnostic, pure helpers (no side effects)
    ├── debug/               # Debug-only utilities (may have side effects — see below)
    └── index.ts             # Module exports
```

---

## Coding Conventions

### Tree Shaking
- Ensure exports are clean to minimize bundle size

### Pure Functions
- Utils should be side-effect free

---

## Safety Rails

### NEVER
- Add framework-specific code to utils — keep them framework-agnostic
- Add API calls or side effects to `utils/` functions
- Add main-app `/ws` wire types (`WsAction`, frames, multi-client DTOs) — use `@atmos/api-types`
- Add WS session / reconnect / pending-map kernels — use `@atmos/api-client`
- Import `@atmos/api-client` or `@atmos/api-types` from utils (keep pure-shared free of wire coupling)

### ALWAYS
- Keep `utils/` functions pure and reusable
- Use tree-shaking-friendly exports
- Put **terminal stream** protocol helpers, `ByteStreamPort`, and logical ControlPort under `src/terminal/` only (not a dumping ground for main `/ws`)

### Exception: `src/debug/`
`src/debug/` is explicitly allowed to contain utilities with side effects (network
calls, `console.*`, mutable state). These are debug-only tools — **never import
them in production code paths**. They are exported under the `@atmos/shared/debug/*`
subpath, kept out of the main `"."` barrel so they are never accidentally
tree-shaken into production bundles.

```ts
// ✅ correct — explicit debug import
import { getDebugLogger } from "@atmos/shared/debug/debug-logger";

// ❌ wrong — never re-export from utils/ or the root index
```

