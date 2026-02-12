---
title: WebSocket Service Architecture
section: deep-dive
level: advanced
reading_time: 13
path: deep-dive/infra/websocket
sources:
  - crates/infra/src/websocket/manager.rs
  - crates/infra/src/websocket/connection.rs
  - crates/infra/src/websocket/types.rs
  - crates/infra/src/websocket/error.rs
  - apps/api/src/api/ws/handlers.rs
  - apps/api/src/api/ws/mod.rs
  - apps/api/src/main.rs
updated_at: 2026-02-10T12:00:00Z
---

# WebSocket Service Architecture

The WebSocket service is the real-time communication backbone of ATMOS, enabling bidirectional messaging between the web frontend and the Rust backend. This article explains the design, data flow, and lifecycle of WebSocket connections — from the initial HTTP upgrade handshake through message routing to graceful disconnection. Understanding this service is essential for anyone working on real-time features like terminal sessions, file system events, or collaborative editing.

## Overview

The WebSocket infrastructure in ATMOS is split across two layers: the **infrastructure layer** (`crates/infra/src/websocket/`) provides connection management primitives, while the **API layer** (`apps/api/src/api/ws/`) handles HTTP upgrade logic and application-level message routing.

At the core is **WsManager**, a thread-safe connection registry. Each connection is represented by a **WsConnection** that holds the sender half of an MPSC channel — allowing any part of the application to push messages to specific clients. The manager supports two connection types (`WebClient` and `TerminalClient`) and provides both targeted and broadcast messaging.

This design was chosen over actor-based systems or pub/sub brokers for simplicity and debuggability. With typically fewer than 100 concurrent connections per ATMOS instance, a shared registry with read-write locking provides excellent performance without the complexity of more sophisticated architectures.

## Architecture

### System-Level View

```mermaid
graph TB
    subgraph Clients
        Browser["Web Browser"]
        Terminal["Terminal Client"]
    end

    subgraph API["apps/api (API Layer)"]
        Router["Axum Router"]
        WsHandler["ws_handler()"]
        HandleSocket["handle_socket()"]
        MessageRouter["Message Router"]
    end

    subgraph Infra["crates/infra (Infrastructure Layer)"]
        WsService["WsService"]
        WsManager["WsManager"]
        WsConnection["WsConnection"]
        Heartbeat["Heartbeat Monitor"]
    end

    Browser -->|"GET /ws?client_type=web"| Router
    Terminal -->|"GET /ws?client_type=terminal"| Router
    Router -->|"HTTP Upgrade"| WsHandler
    WsHandler -->|"on_upgrade"| HandleSocket
    HandleSocket --> WsService
    WsService --> WsManager
    WsManager --> WsConnection
    Heartbeat -.->|"periodic ping"| WsConnection
    MessageRouter -->|"send_to(id, msg)"| WsManager
```

### Connection Lifecycle (Sequence Diagram)

```mermaid
sequenceDiagram
    participant C as Client
    participant H as ws_handler
    participant S as WsService
    participant M as WsManager
    participant Conn as WsConnection

    C->>H: GET /ws?client_type=web (Upgrade)
    H->>S: on_upgrade(socket, client_type)
    S->>M: register_connection(client_type, sender)
    M->>Conn: WsConnection::new(client_type, sender)
    M-->>S: connection_id
    S-->>C: 101 Switching Protocols

    loop Message Loop
        C->>S: WebSocket Frame (Text/Binary)
        S->>S: parse & route message
        S->>M: send_to(target_id, response)
        M->>Conn: sender.send(json)
        Conn-->>C: WebSocket Frame
    end

    C->>S: Close Frame
    S->>M: remove_connection(id)
    M->>Conn: drop(connection)
```

### Data Flow: Message Delivery

```mermaid
flowchart LR
    subgraph Sender["Caller"]
        A["send_to(id, msg)"]
    end

    subgraph Manager["WsManager"]
        B["Acquire read lock"]
        C["Lookup connection by ID"]
        D["Serialize to JSON"]
    end

    subgraph Connection["WsConnection"]
        E["Send via MPSC channel"]
    end

    subgraph Forwarder["Background Task"]
        F["Forward to WebSocket"]
    end

    A --> D
    D --> B
    B --> C
    C --> E
    E --> F
```

## Connection Management

### The WsManager Registry

WsManager maintains a thread-safe hash map of all active connections, keyed by a UUID. The implementation uses a read-write lock so that **sends** (which only read the map) can proceed concurrently, while **registration** and **removal** (which modify the map) serialize. This is intentional: in typical usage, sends vastly outnumber registration/removal, making a read-write lock more efficient than a mutex.

When a connection registers, WsManager generates a UUID, stores the connection, and returns the ID to the caller. Removal is idempotent — if the connection is already gone, the operation silently succeeds. This supports graceful cleanup when the client disconnects without sending a proper close frame.

### Targeted vs Broadcast Delivery

**Targeted delivery** (`send_to`) sends a message to a specific connection by ID. The method acquires only a read lock, so multiple sends to different connections can run in parallel. Serialization happens before the lock is acquired to minimize the critical section.

**Broadcast** sends the same message to all connections of a given type (e.g., all web clients). Errors on individual connections are logged but do not stop the broadcast — some clients may be disconnecting while the broadcast runs.

### The WsConnection Model

Each connection encapsulates: a UUID, client type classification, the MPSC sender channel, and timing metadata. The `last_heartbeat` field is updated on every pong frame; the heartbeat monitor uses it to detect stale connections. When a client sends a close frame or the heartbeat times out, the connection is removed from the registry and its channel is dropped, which causes the outbound forwarder task to exit and the WebSocket to close.

## HTTP Upgrade Flow

The upgrade from HTTP to WebSocket is handled by Axum's `WebSocketUpgrade` extractor. The handler reads `client_type` from query parameters (e.g., `?client_type=web`) and delegates to `handle_socket` once the protocol switch completes.

Inside `handle_socket`, the WebSocket is split into sender and receiver. A new MPSC channel is created; the sender half is passed to WsManager for registration. Two background tasks are spawned: one forwards outbound messages from the MPSC channel to the WebSocket, and one processes inbound messages from the client. When either task completes (e.g., client disconnect or channel closure), the other is aborted and the connection is removed from the registry.

## Message Protocol

All WebSocket messages use a JSON envelope with a `type` field for routing and an optional `payload` field. The `WsMessage` struct mirrors this — callers construct messages with a type string and optional payload, which is serialized to JSON before sending.

## Error Handling

Error handling is explicit: `WsError` covers several failure modes. Understanding each variant helps implement robust retries and user feedback.

- **ConnectionNotFound**: The target connection ID is no longer in the registry. Common when the client disconnected between the caller's lookup and the send. Callers should remove the ID from their local state and optionally notify the user.
- **SendFailed**: The MPSC channel is closed (receiver dropped). The connection was removed, and the forwarder task has exited. This is expected during shutdown or when the client disconnects abruptly.
- **Serialization**: JSON serialization of the message payload failed. Usually indicates invalid payload types; fix the caller's message construction.
- **WebSocket**: Generic WebSocket protocol or I/O error. May indicate network issues or a half-open connection.

The API layer maps these to appropriate HTTP responses or WebSocket close codes. Handlers using `send_to` should match on `WsError` and avoid panicking — disconnections are normal in long-lived connections.

## Design Decisions

### Why RwLock Instead of Mutex

The connection map is read on every `send_to` and written only on register/remove. With dozens of concurrent connections and frequent message traffic, reads vastly outnumber writes. An `RwLock` allows multiple concurrent reads while blocking only writers. A `Mutex` would serialize all access. Benchmarks on similar workloads showed RwLock improving throughput by roughly 2–3x under read-heavy load.

### Why MPSC Instead of Actor Model

An actor-based design (e.g. one task per connection) would be cleaner for isolation but adds complexity: message routing between actors, lifecycle management, and harder debugging of cross-actor flows. For ATMOS's scale (typically under 100 connections), a single registry with RwLock is sufficient and much easier to reason about. The MPSC channel per connection keeps the hot path simple: acquire read lock, lookup, send on channel. The actor model remains an option if connection counts grow into the thousands.

### Why Client Type Classification

WebClient and TerminalClient are distinguished because they have different routing needs. Terminal clients receive PTY output; web clients may receive file tree updates or notifications. The type is set at connection time from the query parameter, enabling targeted broadcast (e.g. "notify all web clients of a workspace change") without sending terminal output to the wrong audience.

## Heartbeat & Connection Health

The heartbeat system prevents zombie connections. A background task runs periodically (default: every 10 seconds), sending ping frames and checking `last_heartbeat`. Connections that haven't responded within the timeout (default: 30 seconds) are removed.

The cleanup is cascading: when a connection is removed, its MPSC sender is dropped. That causes the outbound forwarder task to exit (it receives an error on send), which in turn causes the WebSocket to close. No resources are leaked even when clients disconnect abruptly (browser tab crash, network failure).

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `heartbeat_interval_secs` | `10` | How often ping frames are sent |
| `connection_timeout_secs` | `30` | Max time to wait for pong before disconnecting |

For high-latency or low-activity scenarios, increase `connection_timeout_secs` to avoid premature disconnects. For heavily loaded servers, reducing `heartbeat_interval_secs` can detect dead connections faster, at the cost of more ping traffic. The defaults are tuned for typical web app usage (active tabs, stable networks).

## Evolution

The WebSocket layer evolved in stages. Initially, a single client type and no heartbeat led to zombie connections after browser tabs slept. A heartbeat monitor was added, with configurable interval and timeout. Later, the need to distinguish terminal clients from web clients introduced `ClientType` and query-parameter-based classification. The RwLock was adopted after profiling showed Mutex contention under load. Each change was driven by production observations or performance testing, not speculation — a pattern worth following when extending this module.

## Key Source Files

| File | Purpose |
|------|---------|
| `crates/infra/src/websocket/manager.rs` | WsManager — Connection registry with concurrent read/write access |
| `crates/infra/src/websocket/connection.rs` | WsConnection — Individual connection state, identity, and send channel |
| `crates/infra/src/websocket/types.rs` | WsMessage, ClientType — Message envelope and client classification |
| `crates/infra/src/websocket/error.rs` | WsError, WsResult — Error types for all failure modes |
| `apps/api/src/api/ws/handlers.rs` | HTTP upgrade handler, socket splitting, message routing |
| `apps/api/src/api/ws/mod.rs` | WebSocket route registration in the Axum router |
| `apps/api/src/main.rs` | Heartbeat configuration and WsManager initialization |

## Next Steps

- **[Database & ORM](../infra/database.md)** — Learn how persistent state (sessions, workspace metadata) is stored and queried using SeaORM
- **[Terminal Service](../../deep-dive/core-service/terminal.md)** — Understand how terminal sessions use WebSocket for real-time PTY output streaming
- **[HTTP Routes & Handlers](../api/routes.md)** — See how WebSocket endpoints are registered alongside REST routes in the Axum router
- **[Architecture Overview](../../getting-started/architecture.md)** — Return to the high-level architecture to see where WebSocket fits in the full system
