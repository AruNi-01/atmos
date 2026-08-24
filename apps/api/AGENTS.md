# Web API Server - AGENTS.md

> **🌐 API Entry Point**: Axum **Atmos Server** — exposes `core-service` via HTTP/WebSocket on loopback (and static web when `ATMOS_STATIC_DIR` is set).

---

## Build And Test

- **Dev**: `just dev-api` or `just dev-api-watch` (writes `~/.atmos/runtime_manifest.json` on bind)
- **Build**: `just build-api`
- **Test**: `just test-api` or `cargo test -p api`
- **Lint**: `cargo clippy -p api`

---

## 📁 Directory Structure

```
apps/api/
├── src/
│   ├── main.rs              # Startup, manifest, relay spawn
│   ├── app_state.rs         # DI container (AppState)
│   ├── error.rs
│   ├── relay/               # APP-016 outbound relay + register
│   │   ├── mod.rs
│   │   ├── ingest.rs        # Relay → WsManager injection
│   │   └── register.rs      # ATMOS_REGISTER_TOKEN one-shot
│   ├── api/                 # Handlers & DTOs
│   │   ├── dto.rs
│   │   ├── ws/              # Browser WebSocket entry: connection, protocol, router
│   │   │   ├── handlers.rs  # Axum upgrade handler
│   │   │   ├── manager.rs   # API-owned browser WS connection manager
│   │   │   ├── message.rs   # WsMessage / WsAction / WsEvent and DTO modules
│   │   │   └── router/      # WsAction → service/core adapter
│   │   ├── workspace/
│   │   ├── agent/
│   │   ├── project/
│   │   ├── system/
│   │   └── test/
│   ├── middleware/          # Loopback token (optional), destructive routes
│   └── config/
└── Cargo.toml               # runtime-manager (client feature)
```

---

## Local runtime integration

On successful `TcpListener::bind`:

1. **`runtime_manager::write_runtime_manifest`** — loopback URL for Desktop/CLI (`source: "api"`).
2. On shutdown — **`remove_runtime_manifest`** (graceful exit).
3. If `relay_identity.json` exists and `ATMOS_RELAY_DISABLE != 1` — spawn **`relay::run`** (outbound WSS to `packages/relay`).
4. If `ATMOS_REGISTER_TOKEN` set at startup — **`relay::try_consume_register_token`** then clear env.

**Auth**: `require_local_token` applies only when `ATMOS_LOCAL_TOKEN` is configured. Default dev/Desktop path is **open loopback**.

**Origin guard**: `require_allowed_origin` is the outermost layer and is the control that keeps a random web page from driving this Server. A WebSocket handshake is exempt from CORS, so the `Origin` allowlist must be enforced as a request guard — `CorsLayer` alone does not protect `/ws*`. Rules: a request with no `Origin` is allowed (non-browser clients such as the relay/tunnel bridge and CLI never send one); a request with `Origin` must satisfy `ServerConfig::is_origin_allowed`; and the `Host` header must be an IP literal, `localhost`, or listed in `ATMOS_ALLOWED_HOSTS` (blocks DNS rebinding, which arrives without an `Origin` header). Keep CORS and the guard on the same predicate — never add a second origin rule.

---

## Coding Conventions

### Request Handling

- Handlers stay thin — call `core-service`.
- DTOs in `api/dto.rs`; use `BaseReq` / `BasePageReq` where applicable.

### WebSocket

- Primary transport for interactive features (see root **Transport Rules**).
- Browser/client WebSocket belongs here, not in `infra`.
- `/ws/pt-design/:roomId` is the local PT Design collab hub (same frames as Relay). User + Agent on this machine stay here; remote invite still uses `packages/relay`.
- `POST /api/pt-design/agent/invoke` is non-browser Agent/CLI ingress (same category as `/api/canvas/agent/invoke`). The Server does not run PT Design tools; it forwards to the open board over `/ws` (`pt_design_agent_dispatch`). Opening the tab is enough — Share is not required. Users do not configure MCP or put `pt-design-mcp` on PATH.
- `api/ws` owns connection lifecycle, auth context, message parsing, protocol DTOs, action routing, and mapping service events to WS notifications.
- `core-service` should not depend on `WsMessage`, `WsAction`, `WsManager`, or Axum. If a service needs to notify clients, emit a service event and adapt it here.
- `relay/ingest` must treat relay peers like local WS clients for routing (`conn_id`, events), while relay protocol adaptation stays in `apps/api/src/relay`.

### REST

- REST is allowed only for four categories; anything else goes through WS:
  1. **Non-browser clients** — CLI (`/api/review/*`, canvas invoke), external agent webhooks (`/hooks/*`).
  2. **Binary / streaming payloads** — file serving (`/api/system/file`), attachment upload.
  3. **Pre-connection bootstrap** — data needed before a WS connection exists (`/healthz`, `/api/system/computer*`, client-session).
  4. **Diagnostics / destructive ops** — tmux cleanup, process kill, relay register.
- Do not duplicate WS-capable flows as new REST APIs. When adding a REST route, state in the PR/spec why it cannot be a WS action.
- Computer REST **types** are not `@atmos/api-types`. They live with the TS consumer (`apps/web/src/api/rest-api.ts` today). Hub/Relay HTTP contracts are `@atmos/hub-client` / `@atmos/relay-client` — see [packages/AGENTS.md](../../packages/AGENTS.md).

---

## Safety Rails

### NEVER

- Implement business logic here — use `crates/core-service`.
- Access DB outside `infra` repositories.
- Add parallel REST for flows that should extend WS messages.
- Move browser/client WebSocket protocol or connection management into `infra`.

### ALWAYS

- Use `AppState` for services.
- Keep main-app WS TS in sync via `@atmos/api-types` (APP-048 / APP-064): when adding `WsAction` or `WsEvent`, update extract fixtures, `actions.ts` / `events.ts`, DTOs, and a **`WsContract` row** in the same change set. Recipe: [packages/api-types/AGENTS.md](../../packages/api-types/AGENTS.md). Do not add oRPC or a parallel REST path for a new interactive action.
- When changing relay protocol, update `packages/relay` and APP-016 TECH.

---

## Related

- [crates/runtime-manager/AGENTS.md](../../crates/runtime-manager/AGENTS.md)
- [packages/relay/AGENTS.md](../../packages/relay/AGENTS.md)
- [packages/api-types/AGENTS.md](../../packages/api-types/AGENTS.md)
- [apps/cli/AGENTS.md](../cli/AGENTS.md)
