# Web Application - AGENTS.md

> **💻 Main Workspace**: Next.js app — talks to **Atmos Server** over loopback (dev), same-origin (Desktop production), or **Relay WSS** (remote Computer).

---

## Build And Test

- **Dev**: `just dev-web` (API usually on `30303` via `just dev-api`)
- **Build**: `bun build` — static export targets include Desktop (`BUILD_TARGET=desktop`) and Cloudflare Pages (`bun run build:pages`)
- **Test / lint / typecheck**: `bun test`, `bun lint`, `bun typecheck`

---

## 📁 Directory Structure

```
apps/web/
├── src/
│   ├── app/[locale]/...
│   ├── api/                 # Next API routes (dev/bootstrap only where needed)
│   ├── app-shell/           # Global chrome, sidebars, overlays, layout state
│   ├── features/            # Business-owned components/hooks/stores/libs
│   ├── providers/           # App-wide React providers
│   └── shared/
│       ├── components/      # Web-app shared rendering components only
│       ├── hooks/           # Cross-feature hooks
│       ├── lib/             # Platform helpers and pure utilities
│       ├── stores/          # Cross-feature client stores/preferences
│       └── types/           # Cross-feature domain types
└── package.json
```

Prefer feature-local ownership over top-level buckets. A feature owns its
`components/`, `hooks/`, `store/`, `lib/`, and `types/` when those files exist
for that feature only. Keep feature roots thin, usually limited to `AGENTS.md`
and deliberate public barrels such as `index.ts`. Move code into `shared/` only
after two or more features use it, and keep `shared/lib` free of UI component
imports and feature store writes.

---

## API & transport

### Resolving the Server

| Runtime | Mechanism |
|---------|-----------|
| **Browser dev** | `NEXT_PUBLIC_API_PORT` (default `30303`) via `desktop-runtime.ts` |
| **Tauri Desktop** | `get_api_config` invoke → `{ host, port }` — **no token** by default |
| **Desktop prod** | Same-origin `window.location` when served from API static export |
| **Relay mode** | Relay `client_token` + `relay_ws_url` (Settings → Atmos Computer) |

Use `getRuntimeApiConfig()` / `httpBase()` / `wsBase()` — not raw `fetch` host guesses in features.

### WebSocket-first

- Interactive flows: `use-websocket.ts` + `src/api/ws/request.ts` (`wsRequest` / `wsRequestForComputerScope`).
- Wire types and `action → input/output` live in `@atmos/api-types`. New Computer RPC: follow [packages/api-types/AGENTS.md](../../packages/api-types/AGENTS.md).
- Feature wrappers stay here (`src/api/ws-api.ts`, `src/api/ws/*-api.ts`). Call `wsRequest("the_action", { ...snake_case wire })` with **no** `<T>`. Re-export wire DTOs from `@atmos/api-types/ws/dto/<domain>`; do not keep a second copy. Dynamic action names use `requestUnchecked`.
- Do not add oRPC/tRPC or a second action catalog. Do not put domain methods on `@atmos/api-client`.
- Extend WS before adding REST (see root Transport Rules).

### REST

- Computer local/gateway HTTP: `src/api/rest-api.ts` (types + fetch) and `src/api/relay.ts` (same paths via Relay `gateway_url`). Handwritten; not `WsContract`.
- Hub HTTPS: `@atmos/hub-client` (`hubMe`, `hubFetch`, …). Relay control: `@atmos/relay-client`.
- Optional `Authorization` only when `cfg.token` is set (Tauri legacy / explicit env).
- Do not generate OpenAPI “for all REST” — the three HTTP planes stay separate.

---

## APP-016 (Atmos Computer) UI

- **Settings** → `AtmosComputerSection.tsx`, `atmos-access-token.ts`
- Frontend location: `src/features/atmos-computer/`,
  `src/features/tunnel-connector/`, and `src/features/connection/`
- Hub-minted **device credential** (Bearer) for relay — Settings → Account; not a user-generated Access Token.
- Optional **Relay Secret Key** belongs to Atmos Computer relay settings and is sent as `X-Atmos-Relay-Secret` only for self-hosted/private relays.
- Register token flow for remote computers: copy CLI / env `ATMOS_REGISTER_TOKEN`.

Spec: [specs/APP/APP-016_atmos-computer/](../../specs/APP/APP-016_atmos-computer/)

---

## Coding Conventions

- Main `/ws` types ↔ `@atmos/api-types` (`WsContract`). REST DTO leftovers may still track `apps/api/src/api/dto.rs` until a second TS consumer exists.
- UI atoms from `@workspace/ui`; semantic theme tokens (`bg-background`, etc.)
- Feature-local dialogs live with their feature, not in a global dialog folder.
- Settings-specific rules: [src/features/settings/components/AGENTS.md](src/features/settings/components/AGENTS.md)
- Desktop standalone windows for embedded surfaces such as Preview and Agent Chat must be mutually exclusive with their embedded surface. Use the shared standalone handoff helper so the embedded UI shows a paused placeholder with a return button while the standalone window is active.

---

## Safety Rails

### NEVER

- `fetch()` inside feature components — use `src/api/` or shared clients.
- Hardcode `ATMOS_LOCAL_TOKEN` in web bundle for default dev.
- Add REST duplicates for WS-first features.
- Add oRPC/tRPC or a second `WsAction` / pending-map kernel in the web app.

### ALWAYS

- Test light/dark for UI changes.
- Keep Desktop and browser dev paths working through `desktop-runtime.ts`.

---

## Related

- [apps/desktop/AGENTS.md](../desktop/AGENTS.md)
- [apps/api/AGENTS.md](../api/AGENTS.md)
- [packages/api-types/AGENTS.md](../../packages/api-types/AGENTS.md)
- [packages/relay/AGENTS.md](../../packages/relay/AGENTS.md)
