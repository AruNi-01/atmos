# API Server - AGENT.md (Internal Ref)

> **🌐 Web Entry**: Axum-based HTTP and WebSocket server.

## Architecture
- **Handlers**: Thin wrappers in `src/api/` that call `src/service/`.
- **Service Layer**: API-specific orchestration that consumes `core-service`.
- **DTOs**: Definitions in `src/api/dto.rs` must align with frontend `types/api.ts`.

## Working Patterns
- **Middleware**: Authentication and logging live in `src/middleware/`.
- **WebSocket**: Handled in `src/api/terminal/ws.rs`.
