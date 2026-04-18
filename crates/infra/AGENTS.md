# Infrastructure Layer (L1) - AGENTS.md

> **🔧 L1: The Backbone**: Handles direct interactions with data providers and low-level system services.

---

## Build And Test

- **Build**: `cargo build -p infra`
- **Test**: `cargo test -p infra` or `just test-rust`
- **Lint**: `cargo clippy -p infra`

---

## 📁 Directory Structure

```
crates/infra/
└── src/
    ├── db/
    │   ├── entities/        # SeaORM entities
    │   ├── repo/            # Repository pattern
    │   └── migration/       # Database migrations
    ├── websocket/           # WebSocket connection management
    ├── jobs/                # Background job processing
    ├── queue/               # Job queue management
    ├── cache/               # Caching layer
    └── utils/               # Utilities
```

---

## Coding Conventions

### Entities
- Defined in `db/entities/`
- Must inherit from `base.rs` fields

### Repositories
- Use Repository pattern in `db/repo/` to abstract SeaORM away from business logic

### WebSocket
- Real-time signaling logic lives in `websocket/manager.rs`

---

## Safety Rails

### NEVER
- Put business logic here — this is data access only
- Access repositories directly from `apps/api` — go through `core-service`

### ALWAYS
- Keep entities inheriting from `base.rs`
- Use Repository pattern to abstract SeaORM

