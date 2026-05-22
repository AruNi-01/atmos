# Infrastructure Layer (L1) - AGENTS.md

> **🔧 L1: The Backbone**: Handles persistence, local infrastructure primitives, and low-level data utilities. User-facing HTTP/WebSocket entry code lives in `apps/api`.

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

### Transports
- Inbound browser/client WebSocket code belongs in `apps/api/src/api/ws`
- External-service clients may live in a dedicated capability crate when they are not API entry adapters

---

## Safety Rails

### NEVER
- Put business logic here — this is data access only
- Access repositories directly from `apps/api` — go through `core-service`
- Add inbound HTTP/WebSocket handlers, browser connection managers, or API protocol DTOs here

### ALWAYS
- Keep entities inheriting from `base.rs`
- Use Repository pattern to abstract SeaORM
