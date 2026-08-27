# Packages Directory - AGENTS.md

> **📦 Shared JS/TS** and edge Workers. Package boundary map (APP-050).

---

## Role table

| Package | Namespace | May contain | Must not | Channel |
|---------|-----------|-------------|----------|---------|
| **api-types** | `@atmos/api-types` | Main `/ws` frames, `WsAction`, `WsEvent`, `WsContract` input/output, multi-client DTOs | React, transport, business rules, oRPC | Main `/ws` |
| **api-client** | `@atmos/api-client` | WS session kernel, reconnect, typed `request` | UI, Query, feature stores, domain APIs | Main `/ws` transport |
| **hub-client** | `@atmos/hub-client` | Hub HTTPS client (auth, devices, integrations), pluggable device credential store | Main `/ws`, UI, Query | Hub control plane |
| **relay-client** | `@atmos/relay-client` | Relay HTTPS client (computers, register tokens, client sessions), pluggable transport | Worker impl, main `/ws`, UI | Relay control plane |
| **shared** | `@atmos/shared` | Pure utils, hooks, debug, **terminal stream protocol** | Main `/ws` types, WS session kernel | Terminal stream (exception) |
| **ui** | `@workspace/ui` | Design system | API clients, wire types | UI only |
| **i18n** | `@atmos/i18n` | next-intl routing helpers | Mobile-only copy as sole home | Next apps |
| **config** | `@atmos/config` | tsconfig bases | Runtime product code | Tooling |
| **relay** | `@atmos/relay` (private) | Cloudflare Worker/DO | App business logic / client SDK | Relay edge |
| **pt-design** | `@atmos/pt-design` | Prototype wireframe canvas, Design IR, MCP/CLI (APP-062) | api-*/shared/ui, Atmos Rust CLI | Isolated product |
| **md-live** | `@atmos/md-live` | Live markdown embed directives, document-edit fence, AgentRequest prompts (APP-067) | api-*/shared/ui, apps, React | Isolated codec |

Apps (`apps/web`, `apps/mobile`, `apps/desktop-electron`, …) own UI, feature state, platform bootstrap, and **desktop IPC**.

---

## Decision tree

1. **Main `/ws` frame, `WsAction`, `WsEvent`, multi-client DTO, or `WsContract` input/output map?** → `@atmos/api-types` ([api-types/AGENTS.md](api-types/AGENTS.md), APP-048 / APP-064). Do **not** add oRPC, tRPC, ts-rest, or another RPC framework for type safety.  
1b. **Single-app DTO only?** → owning app until a second consumer  
1c. **App feature wrapper** (`fsApi`, mobile `ws-actions.ts`)? → owning app. Do not put domain methods on `@atmos/api-client`.  
2. **Main `/ws` connect / reconnect / request_id?** → `@atmos/api-client` ([api-client/AGENTS.md](api-client/AGENTS.md), APP-049)  
2b. **Hub HTTPS (session, devices, Linear OAuth finish, etc.)?** → `@atmos/hub-client` ([hub-client/AGENTS.md](hub-client/AGENTS.md), APP-056)  
2c. **Relay REST (computers, register tokens, client sessions)?** → `@atmos/relay-client` ([relay-client/AGENTS.md](relay-client/AGENTS.md), APP-016/056)  
3. **Terminal stream protocol / title helpers?** → `@atmos/shared/terminal`  
4. **Pure helper / generic hook / debug logger?** → `@atmos/shared`  
5. **Design-system chrome?** → `@workspace/ui` (not mobile)  
6. **next-intl routing?** → `@atmos/i18n`  
7. **tsconfig base?** → `@atmos/config`  
8. **Relay edge routing?** → `packages/relay` only  
9. **Electron IPC / preload bridge?** → `apps/desktop-electron` only  
10. **TanStack Query keys / server-state?** → app (APP-035)  
11. **UI prototype wireframe / Design IR / PT Design MCP or CLI?** → `@atmos/pt-design` (APP-062). Not Canvas (APP-014), not `@workspace/ui`, not `apps/cli`.
12. **Live markdown embed directives / `atmos-md-live` fence / AgentRequest?** → `@atmos/md-live` (APP-067). Host UI is `apps/web/src/features/md-live`. Not Wiki, not `@workspace/ui`.
13. **Else** → owning app  

---

## Dependency direction

```text
apps/* ──► @atmos/api-client ──► @atmos/api-types
apps/* ──► @atmos/api-types
apps/* ──► @atmos/hub-client
apps/* ──► @atmos/relay-client
apps/web ──► @atmos/pt-design (public embed only)
apps/* ──► @atmos/shared
apps/web ──► @workspace/ui
Next apps ──► @atmos/i18n
```

**Forbidden:** `shared → api-client|api-types|hub-client|relay-client`, `api-types → runtime packages`, `ui → api-client|api-types|hub-client|relay-client`, `hub-client → api-client|api-types|relay-client`, `relay-client → api-client|api-types|hub-client`, apps importing `packages/relay/src`.

**Allowed:** `api-client → shared` for pure helpers only (prefer zero).

---

## API clients vs apps

- **Shared main-app WS session kernel** → `@atmos/api-client`  
- **Shared main-app wire types + `WsContract`** → `@atmos/api-types` (how to add an action: [api-types/AGENTS.md](api-types/AGENTS.md))  
- **Shared Hub control-plane HTTPS client** → `@atmos/hub-client` (apps bootstrap base URL + platform device store)  
- **Shared Relay control-plane HTTPS client** → `@atmos/relay-client` (apps inject transport if needed, e.g. desktop loopback proxy)  
- **Relay `clientKind`**: `web` | `desktop` (Electron workbench) | `mobile` — set at `createClientSession`  
- **Computer gateway REST** (`gateway_url` + `/api/system/*`) → owning app after session (not relay-client)  
- **App feature API modules, platform bindings, UI** → `apps/*` (`wsRequest` / mobile `ws-actions.ts`). Do not put `gitApi` on the kernel.  
- Do **not** reintroduce dual action catalogs or dual pending-map kernels in apps  
- Do **not** add oRPC/tRPC/ts-rest for Computer `/ws` type safety — extend `WsContract`  
- Do **not** re-implement Hub fetch / device credential storage per app — extend `@atmos/hub-client`  
- Do **not** re-implement Relay computers / register / client_sessions per app — extend `@atmos/relay-client`  

Types track the server via `@atmos/api-types` (enum extract + `WsContract`), not by hand-copying into each app forever.

### HTTP contracts (not `WsContract`)

HTTP is three planes. Do **not** fold them into `@atmos/api-types` or one OpenAPI.

| Plane | Transport | Contract home | Shape |
|-------|-----------|---------------|--------|
| Hub | HTTPS | `@atmos/hub-client` | Named functions + DTOs in `src/types.ts` (`hubMe(): Promise<HubMe>`) |
| Relay control | HTTPS | `@atmos/relay-client` | Named methods on `createRelayClient()` + `src/types.ts` |
| Computer REST | loopback / gateway `/api/*` | **owning app** (`apps/web/src/api/rest-api.ts`, `relay.ts`) | Handwritten types next to the fetch helper |

- Hub/Relay already have procedure-level typing (function in → function out). Adding oRPC would duplicate that.
- Computer REST is the exception transport (bootstrap, binary, CLI/hooks, diagnostics). Types stay app-local until a **second** TS consumer (e.g. mobile) needs the same DTO — then extract, still **not** into `api-types/ws`.
- Same PR as the server route: update the matching client DTO + function. No extract gate (unlike `WsAction`).

---

## Build And Test

```bash
bun install
bun run --filter @atmos/api-types test
bun run --filter @atmos/api-client test
bun run --filter @atmos/hub-client test
bun run --filter @atmos/relay-client test
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
- Deploy hub/relay only after D1 migrations ([hub/README.md](hub/README.md), [relay/README.md](relay/README.md))
- When adding Rust `WsAction` / `WsEvent`: update `@atmos/api-types` catalog **and** `WsContract` (actions) in the same PR — see [api-types/AGENTS.md](api-types/AGENTS.md)

---

## Related

- [api-types/AGENTS.md](api-types/AGENTS.md)
- [api-client/AGENTS.md](api-client/AGENTS.md)
- [hub/AGENTS.md](hub/AGENTS.md)
- [hub-client/AGENTS.md](hub-client/AGENTS.md)
- [relay-client/AGENTS.md](relay-client/AGENTS.md)
- [shared/AGENTS.md](shared/AGENTS.md)
- [relay/AGENTS.md](relay/AGENTS.md)
- [specs/APP/APP-050_shared-package-layering](../specs/APP/APP-050_shared-package-layering/)
- [specs/APP/APP-064_api-contract-hardening](../specs/APP/APP-064_api-contract-hardening/)
