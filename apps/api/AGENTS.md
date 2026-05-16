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
│   │   ├── ws/              # WebSocket handlers
│   │   ├── workspace/
│   │   ├── agent/
│   │   ├── project/
│   │   ├── system/
│   │   ├── token_usage/
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

---

## Coding Conventions

### Request Handling

- Handlers stay thin — call `core-service`.
- DTOs in `api/dto.rs`; use `BaseReq` / `BasePageReq` where applicable.

### WebSocket

- Primary transport for interactive features (see root **Transport Rules**).
- `relay/ingest` must treat relay peers like local WS clients for routing (`conn_id`, events).

### REST

- Exception paths: bootstrap, settings persistence, review/canvas agent invoke, diagnostics.
- Do not duplicate WS-capable flows as new REST APIs without justification.

---

## Safety Rails

### NEVER

- Implement business logic here — use `crates/core-service`.
- Access DB outside `infra` repositories.
- Add parallel REST for flows that should extend WS messages.

### ALWAYS

- Use `AppState` for services.
- Keep DTOs in sync with `apps/web/src/types/api.ts` (or app-local types).
- When changing relay protocol, update `packages/relay` and APP-016 TECH.

---

## Related

- [crates/runtime-manager/AGENTS.md](../../crates/runtime-manager/AGENTS.md)
- [packages/relay/AGENTS.md](../../packages/relay/AGENTS.md)
- [apps/cli/AGENTS.md](../cli/AGENTS.md)
