# Agent Integration Crate - AGENTS.md

> **🤖 External AI Agent Integration**: Standalone vertical module for integrating external AI Agent services via ACP (Agent Client Protocol).

---

## Build And Test

- **Build**: `cargo build -p agent`
- **Test**: `cargo test -p agent` or `just test-rust`
- **Lint**: `cargo clippy -p agent`

---

## 📁 Directory Structure

```
crates/agent/
└── src/
    ├── lib.rs              # Public exports
    ├── models.rs           # Data models (AgentId, KnownAgent, AgentStatus, etc.)
    ├── manager/            # Agent lifecycle management
    │   ├── mod.rs          # AgentManager
    │   ├── npm.rs          # npm package management
    │   ├── registry.rs     # ACP Registry integration
    │   ├── manifest.rs     # Agent manifest parsing
    │   ├── binary.rs       # Binary download/management
    │   └── keyring.rs      # Secure API key storage
    └── acp_client/         # ACP protocol implementation
        ├── client.rs       # ACP client
        ├── process.rs      # Agent process spawning
        ├── runner.rs       # Session runner
        ├── tools.rs        # Tool call handling
        ├── types.rs        # ACP protocol types
        └── logging.rs      # Logging utilities
```

---

## Coding Conventions

### Independence
- This crate is **independent** from the L1/L2/L3 layered architecture
- Does NOT depend on `infra`, `core-engine`, or `core-service`

### Module Organization
- `manager/` — Agent lifecycle (install, status, API keys)
- `acp_client/` — ACP protocol implementation

### Public API
```rust
pub use acp_client::{
    run_acp_session,      // Run ACP session
    AcpSessionHandle,     // Session handle
    AcpSessionEvent,      // Session events
    AtmosAcpClient,       // ACP client
    AcpToolHandler,       // Tool call handler
};

pub use manager::AgentManager;
// AgentManager provides:
// - list_agent_status()
// - install_agent(id)
// - get_agent_config(id)
// - set_agent_api_key(id, key)
// - list_registry_agents()
// - install_registry_agent(...)
```

---

## Architecture Position

```
┌─────────────────────────────────────────────────────────┐
│                      apps/api                           │
│                   (Axum HTTP/WS Entry)                  │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                  core-service (L3)                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  AgentService                                     │  │
│  │  - Wraps AgentManager                             │  │
│  │  - Provides unified service layer interface       │  │
│  └───────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐  ┌─────▼─────┐  ┌─────▼───────────┐
│    infra     │  │   core-   │  │     agent       │
│     (L1)     │  │  engine   │  │  (independent)  │
│             │  │   (L2)    │  │                 │
│ - DB        │  │ - PTY     │  │ - ACP Client    │
│ - WebSocket │  │ - Git     │  │ - Agent Manager │
│ - Cache     │  │ - FS      │  │ - Registry      │
│             │  │ - Search  │  │ - Keyring       │
└─────────────┘  └───────────┘  └─────────────────┘
```

---

## Safety Rails

### NEVER
- Depend on `infra`, `core-engine`, or `core-service` — this is an independent module
- Put business logic here — delegate to `core-service` through `AgentService`
- Expose ACP protocol details outside this module — keep protocol encapsulation

### ALWAYS
- Keep ACP protocol details encapsulated in `acp_client/`
- Use system keyring for API key storage
- Maintain independence from core layered architecture
- Support future extensibility to other agent protocols

---

## Compact Instructions

Preserve when compressing:
1. Architecture position: Independent vertical module (parallel to L1/L2/L3)
2. No dependencies on `infra`/`core-engine`/`core-service`
3. Module split: `manager/` (lifecycle) + `acp_client/` (protocol)
4. Secure keyring storage for API keys
