# Core Service Layer (L3) - AGENTS.md

> **🧠 L3: Business Rules**: This crate implements the core business logic of Vibe Habitat.

## Directory Structure

```
src/
├── lib.rs                    # Module exports
├── error.rs                  # ServiceError definition
├── types.rs                  # Domain types (SharedString, etc.)
├── test_service.rs           # TestService - demo orchestration
├── ws_message_service.rs     # WebSocket message processing
└── message_push_service.rs   # Message push with Arc<RwLock<String>>
```

## Services

| Service | Purpose |
|---------|---------|
| `TestService` | Demo: orchestrates `TestEngine` + `TestMessageRepo` |
| `WsMessageService` | Processes WebSocket messages, logs, calls engine, saves to DB |
| `MessagePushService` | Manages latest message state for WebSocket push |

## Core Logic
- **Auth**: Logic for validation and token issuance.
- **Project/Workspace**: Orchestrating Engine and Infra to manage development environments.
- **Terminal**: High-level terminal session orchestration.

## Working Patterns
- **Orchestration**: Services should call multiple Engines (L2) and Repos (L1) to fulfill a business goal.
- **Type Safety**: Use `types.rs` for domain-specific models used across services.
- **Error Handling**: Use `ServiceError` from `error.rs` to wrap engine/repo errors.

## Dependencies
- `core-engine`: L2 engine capabilities (PTY, Git, FS)
- `infra`: L1 infrastructure (DB, WebSocket, Jobs)
