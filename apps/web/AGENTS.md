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
│   ├── components/
│   ├── hooks/
│   │   └── use-websocket.ts # WS URL + relay mode
│   └── lib/
│       ├── desktop-runtime.ts      # Tauri / same-origin API discovery
│       ├── atmos-computer-store.ts # Access token, relay client sessions (APP-016)
│       ├── ws-url.ts
│       └── ...
└── package.json
```

---

## API & transport

### Resolving the Server

| Runtime | Mechanism |
|---------|-----------|
| **Browser dev** | `NEXT_PUBLIC_API_PORT` (default `30303`) via `desktop-runtime.ts` |
| **Tauri Desktop** | `get_api_config` invoke → `{ host, port }` — **no token** by default |
| **Desktop prod** | Same-origin `window.location` when served from API static export |
| **Relay mode** | Control plane `client_token` + `relay_ws_url` (Settings → Atmos Computer) |

Use `getRuntimeApiConfig()` / `httpBase()` / `wsBase()` — not raw `fetch` host guesses in features.

### WebSocket-first

- Interactive flows: `use-websocket.ts`, agent/session streams.
- Extend WS protocol before adding REST (see root AGENTS.md).

### REST

- `src/api/rest-api.ts` — bootstrap, uploads, canvas invoke paths that are already REST.
- Optional `Authorization` only when `cfg.token` is set (Tauri legacy / explicit env).

---

## APP-016 (Atmos Computer) UI

- **Settings** → `AtmosComputerSection.tsx`, `atmos-access-token.ts`
- User-created **Access Token** (Bearer) for control plane — not a shared CP key.
- Register token flow for remote computers: copy CLI / env `ATMOS_REGISTER_TOKEN`.

Spec: [specs/APP/APP-016_atmos-computer/](../../specs/APP/APP-016_atmos-computer/)

---

## Coding Conventions

- API types ↔ `apps/api/src/api/dto.rs`
- UI atoms from `@workspace/ui`; semantic theme tokens (`bg-background`, etc.)
- Dialog-specific rules: [src/components/dialogs/AGENTS.md](src/components/dialogs/AGENTS.md)

---

## Safety Rails

### NEVER

- `fetch()` inside feature components — use `src/api/` or shared clients.
- Hardcode `ATMOS_LOCAL_TOKEN` in web bundle for default dev.
- Add REST duplicates for WS-first features.

### ALWAYS

- Test light/dark for UI changes.
- Keep Desktop and browser dev paths working through `desktop-runtime.ts`.

---

## Related

- [apps/desktop/AGENTS.md](../desktop/AGENTS.md)
- [apps/api/AGENTS.md](../api/AGENTS.md)
- [packages/relay/AGENTS.md](../../packages/relay/AGENTS.md)
