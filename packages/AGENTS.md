# Packages Directory - AGENTS.md

> **📦 Shared JS/TS** and edge Workers. Package boundary map (APP-050).

---

## Role table

| Package | Namespace | May contain | Must not | Channel |
|---------|-----------|-------------|----------|---------|
| **api-types** | `@atmos/api-types` | Main `/ws` frames, `WsAction`, multi-client DTOs | React, transport, business rules | Main `/ws` |
| **api-client** | `@atmos/api-client` | WS session kernel, reconnect, request helpers | UI, Query, feature stores | Main `/ws` transport |
| **shared** | `@atmos/shared` | Pure utils, hooks, debug, **terminal stream protocol** | Main `/ws` types, WS session kernel | Terminal stream (exception) |
| **ui** | `@workspace/ui` | Design system | API clients, wire types | UI only |
| **i18n** | `@atmos/i18n` | next-intl routing helpers | Mobile-only copy as sole home | Next apps |
| **config** | `@atmos/config` | tsconfig bases | Runtime product code | Tooling |
| **relay** | `@atmos/relay` (private) | Cloudflare Worker/DO | App business logic / client SDK | Relay edge |

Apps (`apps/web`, `apps/mobile`, `apps/desktop-electron`, …) own UI, feature state, platform bootstrap, and **desktop IPC**.

---

## Decision tree

1. **Main `/ws` frame, `WsAction`, multi-client DTO?** → `@atmos/api-types` ([api-types/AGENTS.md](api-types/AGENTS.md), APP-048)  
1b. **Single-app DTO only?** → owning app until a second consumer  
2. **Main `/ws` connect / reconnect / request_id?** → `@atmos/api-client` ([api-client/AGENTS.md](api-client/AGENTS.md), APP-049)  
3. **Terminal stream protocol / title helpers?** → `@atmos/shared/terminal`  
4. **Pure helper / generic hook / debug logger?** → `@atmos/shared`  
5. **Design-system chrome?** → `@workspace/ui` (not mobile)  
6. **next-intl routing?** → `@atmos/i18n`  
7. **tsconfig base?** → `@atmos/config`  
8. **Relay edge routing?** → `packages/relay` only  
9. **Electron IPC / preload bridge?** → `apps/desktop-electron` only  
10. **TanStack Query keys / server-state?** → app (APP-035)  
11. **Else** → owning app  

---

## Dependency direction

```text
apps/* ──► @atmos/api-client ──► @atmos/api-types
apps/* ──► @atmos/api-types
apps/* ──► @atmos/shared
apps/web ──► @workspace/ui
Next apps ──► @atmos/i18n
```

**Forbidden:** `shared → api-client|api-types`, `api-types → runtime packages`, `ui → api-client|api-types`, apps importing `packages/relay/src`.

**Allowed:** `api-client → shared` for pure helpers only (prefer zero).

---

## API clients vs apps

- **Shared main-app WS session kernel** → `@atmos/api-client`  
- **Shared main-app wire types** → `@atmos/api-types`  
- **App feature API modules, platform bindings, UI** → `apps/*`  
- Do **not** reintroduce dual action catalogs or dual pending-map kernels in apps  

Types track the server via `@atmos/api-types` (enum-backed action drift), not by hand-copying into each app forever.

---

## Build And Test

```bash
bun install
bun run --filter @atmos/api-types test
bun run --filter @atmos/api-client test
bun run scripts/check-package-boundaries.ts
cd packages/relay && bunx wrangler dev
```

---

## Safety Rails

### NEVER

- API calls in `@workspace/ui`
- Main `/ws` wire types or WS session kernel under `@atmos/shared` utils (terminal stream exception only)
- Business rules in `packages/relay` beyond routing/auth/presence
- Desktop IPC types in `@atmos/api-types`

### ALWAYS

- `workspace:*` for monorepo deps
- Deploy relay only after D1 migrations ([relay/README.md](relay/README.md))
- When adding Rust `WsAction`: update `@atmos/api-types` in the same PR

---

## Related

- [api-types/AGENTS.md](api-types/AGENTS.md)
- [api-client/AGENTS.md](api-client/AGENTS.md)
- [shared/AGENTS.md](shared/AGENTS.md)
- [relay/AGENTS.md](relay/AGENTS.md)
- [specs/APP/APP-050_shared-package-layering](../specs/APP/APP-050_shared-package-layering/)
