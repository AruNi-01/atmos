# Web API Server - AGENTS.md

> **🌐 API Entry Point**: The Axum server that exposes `core-service` logic to the outside world via HTTP and WebSocket.

---

## 📁 Directory Structure

```
apps/api/
├── src/
│   ├── main.rs              # App Startup
│   ├── app_state.rs         # DI Container (AppState)
│   ├── service/             # API-specific orchestration
│   ├── api/                 # Handlers & DTOs
│   │   ├── dto.rs           # Shared API Models
│   │   └── [module]/        # Domain-specific routes
│   ├── middleware/          # JWT, Auth, Logging
│   └── config/              # Env var loading
└── README.md
```

---

## 🛠 Working Guidelines

### 1. Request Handling
- Handlers should be thin. They extract data from requests and call `core-service`.
- Use `dto.rs` for defining the JSON interface.

### 2. DTO Conventions
- Use `BaseReq`, `BasePageReq` for consistency.
- Implement `From` traits to convert between DTOs and Core Service types.

### 3. WebSocket Bridge
- The `ws.rs` handler in `terminal` module bridges `infra::websocket` to actual Axum sockets.

---

## 🚦 Interaction Rules
- **DO**: Use `AppState` to access services.
- **DON'T**: Implement complex business logic here. Delegate to `crates/core-service`.

---

## 🚀 Commands
```bash
just dev-api    # Start server
just test-api   # Run integration tests
```
