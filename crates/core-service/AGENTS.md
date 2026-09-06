# Core Service Layer (L3) - AGENTS.md

> **🧠 L3: Business Rules**: Implements the core business logic of ATMOS.

---

## Build And Test

- **Build**: `cargo build -p core-service`
- **Test**: `cargo test -p core-service` or `just test-rust`
- **Lint**: `cargo clippy -p core-service`

---

## 📁 Directory Structure

```
crates/core-service/
└── src/
    ├── service/             # Business logic services
    ├── utils/               # Service-level utilities
    ├── lib.rs               # Module exports
    ├── error.rs             # ServiceError definition
    └── types.rs             # Domain types
```

---

## Coding Conventions

### Orchestration
- Services should call multiple Engines (L2) and Repos (L1) to fulfill a business goal
- Services emit domain/application events for client notifications; `apps/api` adapts those events to WebSocket notifications

### Type Safety
- Use `types.rs` for domain-specific models used across services

### Error Handling
- Use `ServiceError` from `error.rs` to wrap engine/repo errors

---

## Core Logic Areas

- **Auth**: Logic for validation and token issuance
- **Project/Workspace**: Orchestrating Engine and Infra to manage development environments
- **Terminal**: High-level terminal session orchestration
- **Notifications**: Service events and settings, without direct WebSocket manager ownership
- **Agent install / registry**: `service/agent.rs` wraps `agent::AgentManager` (install, status, keys, Native tab enable). Not a Chat session.
- **Agent Chat**: `service/agent_chat/` (`AgentChatService`) owns jsonl transcript, native `/fork` `/rewind` intercept on send, `rewind_view`, and sibling `chat_id` after vendor fork. Talks only to `agent::AgentProvider` via `DefaultAgentProviderFactory`. Do not spawn CLIs or hold ACP handles here. Do not `git checkout` / restore workspace files for rewind. WS DTOs stay in `apps/api`. Last New Chat composer snapshots live in `~/.atmos/config/agent/new_chat_configs.json` (see `new_chat_configs.rs`); write from landing chrome via `agent_chat_prefs_set`, never from eager `agent_chat_create` (that still carries catalog defaults such as Cursor Auto).

---

## Dependencies

- `core-engine`: L2 engine capabilities (PTY, Git, FS)
- `infra`: L1 infrastructure (DB, repos, cache, queue, jobs)
- `agent`: Chat `AgentProvider` (native Claude / Codex / OpenCode / Pi / Grok + ACP) and `AgentManager`. See [agent/AGENTS.md](../agent/AGENTS.md).

---

## Safety Rails

### NEVER
- Put technical implementation details here — use `core-engine`
- Access database directly — use repositories from `infra`
- Depend on `apps/api`, Axum, `WsMessage`, `WsAction`, `WsManager`, or browser WebSocket DTOs

### ALWAYS
- Orchestrate multiple L2 and L1 components to fulfill business goals
- Use `ServiceError` for consistent error handling
- Keep transport adaptation in `apps/api`; expose ordinary service methods and events
- Agent Chat: intercept `/fork` `/rewind` on send; persist `rewind_view`; never restore files in this crate
