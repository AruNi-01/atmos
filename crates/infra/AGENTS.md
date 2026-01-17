# Infrastructure Layer - AGENTS.md

> **🔧 L1: The Backbone**: This layer handles data persistence, real-time communication (WebSocket), and background processing.

---

## 📁 Directory Structure

```
crates/infra/
├── src/
│   ├── db/                  # Data Access Layer
│   │   ├── entities/        # SeaORM Models
│   │   ├── repo/            # Repository Pattern (Traits)
│   │   ├── migration/       # DB Schema Evolution
│   │   └── pool.rs          # Connection Pool
│   ├── websocket/           # WS Engine
│   │   ├── manager.rs       # Connection Tracking
│   │   └── heartbeat.rs     # Health Checks
│   ├── cache/               # Redis/Memory Cache
│   └── jobs/                # Background Tasks
└── README.md
```

---

## 🛠 Working Guidelines

### 1. Database Migrations
- NEVER modify existing migrations.
- Create new migrations in `src/db/migration/`.
- Use SeaORM's schema building blocks.

### 2. Entity Definition
- All entities must inherit from `base.rs` fields (`guid`, `create_time`, `update_time`).
- Use `SeaORM` attributes for relationships.

### 3. WebSocket Communication
- Logic should be decoupled from specific transports.
- Use the `manager.rs` for broad-casting or targeted messaging.

---

## 🚦 Interaction Rules
- **DO**: Provide clean traits for `core-engine` or `core-service` to consume.
- **DON'T**: Put business logic here. This layer only knows *how* to save/send data, not *why*.

---

## 🧪 Testing
- Use `tokio::test` for async infrastructure tests.
- Use a test database container if possible.
