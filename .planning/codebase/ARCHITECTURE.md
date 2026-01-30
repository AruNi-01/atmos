# Architecture

**Analysis Date:** 2026-01-30

## Pattern Overview

**Overall:** Layered Monorepo with Dependency Inversion

The codebase follows a strict layered architecture where each layer depends only on the layers beneath it. The architecture separates concerns into infrastructure (L1), technical capabilities (L2), business logic (L3), and API/entry points.

**Key Characteristics:**
- **Three-layer Rust backend**: `infra` (L1) → `core-engine` (L2) → `core-service` (L3) → `api` (entry)
- **Frontend-backend separation**: Next.js frontend communicates via WebSocket and REST APIs
- **Trait-based dependency injection**: `WsMessageHandler` trait allows `core-service` to be injected into `infra`
- **Shared workspace pattern**: Bun workspaces manage frontend packages, Cargo workspace manages Rust crates

## Layers

**Layer 1: Infrastructure (crates/infra)**
- Purpose: Database connectivity, WebSocket framework, job scheduling, caching
- Location: `crates/infra/src/`
- Contains: Database entities, migrations, repositories, WebSocket message protocols, connection management
- Depends on: External libraries (sea-orm, tokio-tungstenite, serde)
- Used by: `core-service`, `apps/api`

**Layer 2: Core Engine (crates/core-engine)**
- Purpose: Technical capabilities wrapped in clean abstractions
- Location: `crates/core-engine/src/`
- Contains: `FsEngine` (file system), `GitEngine` (git operations), `TmuxEngine` (tmux sessions), `TestEngine` (testing)
- Depends on: System libraries, external tools (git, tmux)
- Used by: `core-service`

**Layer 3: Core Service (crates/core-service)**
- Purpose: Business logic and orchestration
- Location: `crates/core-service/src/service/`
- Contains: `ProjectService`, `WorkspaceService`, `TerminalService`, `WsMessageService`, `TestService`
- Depends on: `infra`, `core-engine`
- Used by: `apps/api`

**API Entry (apps/api)**
- Purpose: HTTP/WebSocket handlers, request/response DTOs
- Location: `apps/api/src/`
- Contains: Route handlers, middleware, `AppState` (DI container)
- Depends on: `core-service` (all services injected via `AppState`)
- Used by: Frontend clients

## Data Flow

**WebSocket Request Flow:**

1. Frontend sends JSON message via `useWebSocketStore` (`apps/web/src/hooks/use-websocket.ts`)
2. Message routed to `apps/api/src/api/ws/mod.rs` (Axum WebSocket handler)
3. `WsService` (`infra`) accepts connection, assigns `conn_id`, manages heartbeat
4. `WsService` calls `WsMessageHandler.handle_message()` (trait method)
5. `WsMessageService` (`core-service`) processes the action (Fs, Git, Project, Workspace)
6. Action handlers delegate to appropriate engines/services:
   - FS/Git actions → `FsEngine`/`GitEngine` (`core-engine`)
   - Project/Workspace actions → `ProjectService`/`WorkspaceService` (database via `infra`)
7. Response serialized as JSON and sent back through WebSocket

**Terminal Session Flow:**

1. Frontend requests terminal creation via WebSocket
2. `TerminalService` creates tmux session (via `TmuxEngine`) and window
3. PTY spawned in dedicated thread, attached to tmux window
4. Terminal output streamed via unbounded channel to WebSocket
5. On disconnect: PTY detached but tmux window preserved (persistence)
6. On reconnect: Frontend can reattach to existing tmux window by name/index

**HTTP REST Flow:**

1. Frontend calls REST API functions (`apps/web/src/api/rest-api.ts`)
2. Axum route handler in `apps/api/src/api/` processes request
3. Handler calls service method from `AppState`
4. Service queries database via repositories from `infra`
5. Response returned as JSON

## Key Abstractions

**WsMessageHandler Trait:**
- Purpose: Enables dependency inversion - WebSocket framework in `infra` doesn't know about business logic
- Examples: `crates/core-service/src/service/ws_message.rs` implements this trait
- Pattern: Trait defined in `infra`, implemented by `core-service`, consumed by `WsService`

**Repository Pattern:**
- Purpose: Abstract database access behind clean interfaces
- Examples: `ProjectRepo`, `WorkspaceRepo`, `TestMessageRepo` in `crates/infra/src/db/repo/`
- Pattern: Each entity has a corresponding repository with CRUD operations

**Service Pattern:**
- Purpose: Encapsulate business logic separate from transport (HTTP/WS)
- Examples: `ProjectService`, `WorkspaceService` in `crates/core-service/src/service/`
- Pattern: Stateless services with injected dependencies (DB connection, engines)

**Engine Pattern:**
- Purpose: Wrap external tools/system capabilities in Rust abstractions
- Examples: `FsEngine`, `GitEngine`, `TmuxEngine` in `crates/core-engine/src/`
- Pattern: Struct with methods that shell out to CLI tools or use system APIs

## Entry Points

**API Server:**
- Location: `apps/api/src/main.rs`
- Triggers: `cargo run --bin api` or `just dev-api`
- Responsibilities: Initialize database, run migrations, create services, start Axum server on port 8080

**Web Application:**
- Location: `apps/web/src/app/[locale]/layout.tsx` (root layout)
- Triggers: `bun run dev` or `just dev-web`
- Responsibilities: Next.js app with WebSocket provider, theme provider, i18n provider

**CLI Tool:**
- Location: `apps/cli/src/main.rs`
- Triggers: `cargo run --bin cli` or built binary
- Responsibilities: Command-line interface for backend operations

**Desktop App:**
- Location: `apps/desktop/src-tauri/` (Tauri Rust backend)
- Triggers: Tauri build process
- Responsibilities: Native desktop wrapper around web frontend

## Error Handling

**Strategy:** Result types with custom error enums

**Patterns:**
- `Result<T>` alias in each crate (`infra::Result`, `core_service::Result`)
- `thiserror` for deriving error enums with context
- Errors propagated up layers and converted to HTTP/WebSocket responses at API boundary
- WebSocket errors include `code` and `message` fields in JSON payload

## Cross-Cutting Concerns

**Logging:** Structured logging with `tracing` crate, levels controlled via env vars
- Example: `tracing::info!("[WsMessageService] Client connected: {}", conn_id)`

**Validation:** Path validation, git repo checks performed in engine layer before operations
- Example: `FsEngine::validate_git_path()` in `crates/core-engine/src/fs/`

**Authentication:** Not yet implemented (see TODOs in codebase)

**Database Migrations:** Sea-ORM migrations in `crates/infra/src/db/migration/`, run on API startup

---

*Architecture analysis: 2026-01-30*
