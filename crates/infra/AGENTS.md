# Infrastructure Layer (L1) - AGENTS.md

> **🔧 L1: The Backbone**: This crate handles direct interactions with data providers and low-level system services.

## Core Responsibilities
- **Database (db/)**: SeaORM entities, repositories, and migrations.
- **WebSocket (websocket/)**: Connection management, heartbeats, and message routing.
- **System (cache/jobs/queue/)**: Future-ready infrastructure for async processing.

## Working Patterns
- **Entities**: Defined in `db/entities/`. Must inherit from `base.rs` fields.
- **Repos**: Use the Repository pattern in `db/repo/` to abstract SeaORM away from business logic.
- **WS**: Logic for real-time signaling lives in `websocket/manager.rs`.
