# Infrastructure Layer (L1) - AGENTS.md

> **🔧 L1: The Backbone**: Handles persistence, **local runtime primitives** (`jobs`, `queue`), and low-level data utilities. User-facing HTTP/WebSocket entry code lives in `apps/api`.

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
    ├── jobs/                # Local product job scheduler (APP-051 LocalScheduler)
    ├── queue/               # Local event queue (APP-051 LocalMemoryQueue)
    └── utils/               # Utilities
```

### Jobs vs Queue vs Direct (APP-051)

| Driver | Port | Use for |
|--------|------|---------|
| Time (interval) | `infra::jobs` (`LocalScheduler`) | Product timers: automation tick, AI usage refresh, idle cleanup |
| External events | `infra::queue` (`LocalMemoryQueue`) | GitHub delivery → consumer |
| Interactive user action | **Direct service call** | Manual automation run — never jobs/queue |

v1 adapters are **process-local only** (Tokio). No apalis / external MQ in default deps.

---

## Coding Conventions

### Entities
- Defined in `db/entities/`
- Must inherit from `base.rs` fields

### Repositories
- Use Repository pattern in `db/repo/` to abstract SeaORM away from business logic

### Jobs / Queue
- Handlers and domain rules live in service / capability crates / `apps/api`
- Ports only own timers, channels, retry primitives, lifecycle
- Prefer named `JobId` / `Topic` strings from the APP-051 catalog

### Transports
- Inbound browser/client WebSocket code belongs in `apps/api/src/api/ws`
- External-service clients may live in a dedicated capability crate when they are not API entry adapters

---

## Safety Rails

### NEVER
- Put **domain** business rules in `jobs`/`queue` adapters (no automation pause policy, no provider collect, no GitHub matching)
- Access repositories directly from `apps/api` — go through `core-service`
- Add inbound HTTP/WebSocket handlers, browser connection managers, or API protocol DTOs here
- Force-migrate connection keepalives / PTY pumps onto jobs

### ALWAYS
- Keep entities inheriting from `base.rs`
- Use Repository pattern to abstract SeaORM
- Register product timers via `LocalScheduler`; event work via `LocalMemoryQueue`
