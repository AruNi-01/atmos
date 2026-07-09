# Config Package - AGENTS.md

> **⚙️ @atmos/config**: Shared TypeScript configuration bases (QUALITY-005).

---

## Build And Test

- No build step — configuration-only package
- Consuming apps/packages extend the JSON bases under `typescript/`

---

## TypeScript 7 dual-package model

Atmos installs two TypeScript packages on purpose until TypeScript 7.1 ships a stable programmatic API:

| Package | Role | Version |
|---------|------|---------|
| `@typescript/native` (`npm:typescript@7`) | Native Go `tsc` binary (typecheck / CI) | 7.x |
| `typescript` | Programmatic API for eslint / typescript-eslint | 6.x |

With Bun, installing both makes `.bin/tsc` resolve to the **native 7** binary, while `require("typescript")` / `import "typescript"` still resolve to the **6.x API**.

### Commands

```bash
bun run typecheck          # scripts/typecheck-all.ts → native TS 7
bun run typecheck:bench    # wall-time vs QUALITY-005 baseline
bun --filter web typecheck # package script still calls `tsc --noEmit` (TS 7 via .bin)
```

Env knobs for the orchestrator:

- `ATMOS_TSC_CHECKERS` (default 8 local / 2 CI)
- `ATMOS_TSC_BUILDERS` (default 4 local / 2 CI)
- `ATMOS_TSC_SINGLE_THREADED=1`
- `ATMOS_TSC_FILTER=<substring>`

### Editor

Enable the TypeScript 7 / native language server in Cursor or VS Code so editor diagnostics match CI. Do not point the workspace TypeScript SDK at the 6.x API package for typechecking.

---

## 📁 Directory Structure

```
packages/config/
└── typescript/
    ├── base.json           # Shared TS 7-safe library defaults
    ├── nextjs.json         # Next.js apps
    ├── react.json          # React library / non-Next
    ├── react-native.json   # Expo mobile overlay helpers
    └── workers.json        # Cloudflare Workers (relay)
```

---

## Coding Conventions

### TypeScript Configuration

- Prefer extending `@atmos/config/typescript/base` (or nextjs / workers) from package `tsconfig.json`.
- **Never** set `ignoreDeprecations` or `baseUrl` (hard errors under TypeScript 7).
- List ambient `"types"` explicitly when needed (`node`, `@playwright/test`, `@cloudflare/workers-types`).

### Migrated Configurations

The following have moved to `@workspace/ui`:

- PostCSS config → use `@workspace/ui/postcss.config`
- Styles → use `@workspace/ui/globals.css`
- Tailwind → v4 requires no config file

### ESLint

- ESLint configuration is managed by individual apps (`eslint-config-next`).
- ESLint must keep resolving the TypeScript **6** API via the `typescript` package name.

---

## Safety Rails

### NEVER

- Put ESLint configs here — apps manage their own
- Put PostCSS/Tailwind configs here — they're in `@workspace/ui`
- Reintroduce `ignoreDeprecations` or `baseUrl` to silence TS 7
- Install only `typescript@7` without keeping a 6.x API package for eslint

### ALWAYS

- Keep `@typescript/native` (TS 7) and `typescript@6` installed together at the workspace root
- Run typecheck through native `tsc` 7.x (`bun run typecheck`)
- Keep this package focused on shared TypeScript configuration
