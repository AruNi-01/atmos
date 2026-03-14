# Core Engine Layer (L2) - AGENTS.md

> **⚙️ L2: Technical Capabilities**: Encapsulates complex technical operations into reusable modules.

---

## Build And Test

- **Build**: `cargo build -p core-engine`
- **Test**: `cargo test -p core-engine` or `just test-rust`
- **Lint**: `cargo clippy -p core-engine`

---

## 📁 Directory Structure

```
crates/core-engine/
└── src/
    ├── pty/                 # Pseudo-terminals and process pools
    ├── git/                 # Repository operations
    ├── tmux/                # Session management via tmux
    ├── fs/                  # File system operations
    ├── github/              # GitHub API integration
    ├── search/              # Code search functionality
    ├── app/                 # Application-level utilities
    ├── shims/               # Shell shims and wrappers
    └── lib.rs
```

---

## Coding Conventions

### Decoupling
- Engine should not know about business logic or specific user identities

### Error Handling
- Map OS-level errors to domain-specific engine errors

---

## Safety Rails

### NEVER
- Put business logic or user-specific concepts here
- Access database directly — use repositories from `infra`

### ALWAYS
- Keep modules focused on technical capabilities
- Map OS errors to domain errors for clean abstraction

---

## Compact Instructions

Preserve when compressing:
1. Layer position: L2 (technical capabilities)
2. No business logic rule
3. Error mapping pattern (OS → domain)
