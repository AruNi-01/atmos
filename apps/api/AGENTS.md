# Web API Server - AGENTS.md

> **🌐 API Entry Point**: Axum server exposing `core-service` logic via HTTP and WebSocket.

---

## Build And Test

- **Dev**: `just dev-api` or `just dev-api-watch` (with hot reload)
- **Build**: `just build-api`
- **Test**: `just test-api` or `cargo test -p api`
- **Lint**: `cargo clippy -p api`

---

## 📁 Directory Structure

```
apps/api/
├── src/
│   ├── main.rs              # App startup
│   ├── app_state.rs         # DI container (AppState)
│   ├── error.rs             # Error types
│   ├── api/                 # Handlers & DTOs
│   │   ├── dto.rs           # Shared API models
│   │   ├── ws/              # WebSocket handlers
│   │   │   ├── handlers.rs
│   │   │   ├── terminal_handler.rs
│   │   │   └── agent_handler.rs
│   │   ├── workspace/       # Workspace routes
│   │   ├── agent/           # Agent routes
│   │   ├── project/         # Project routes
│   │   ├── system/          # System routes (diagnostics, skills)
│   │   ├── token_usage/     # Token usage routes
│   │   └── test/            # Test routes
│   ├── middleware/          # JWT, Auth, Logging
│   └── config/              # Env var loading
└── README.md
```

---

## Coding Conventions

### Request Handling
- Handlers should be thin — extract data from requests and call `core-service`
- Use `dto.rs` for defining the JSON interface

### DTO Conventions
- Use `BaseReq`, `BasePageReq` for consistency
- Implement `From` traits to convert between DTOs and Core Service types

### WebSocket Bridge
- The `ws.rs` handler in `terminal` module bridges `infra::websocket` to Axum sockets

---

## Safety Rails

### NEVER
- Implement complex business logic here — delegate to `crates/core-service`
- Access database directly — use repositories from `infra`
- Add new REST endpoints by default — check if WebSocket should be used instead (see root AGENTS.md Transport Rules)

### ALWAYS
- Use `AppState` to access services
- Keep handlers focused on request/response concerns
- Update `dto.rs` when changing API contracts

