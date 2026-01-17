# Core Engine Layer - AGENTS.md

> **⚙️ L2: Technical Capabilities**: This layer encapsulates complex tech operations like PTY management, Git handling, and File System watching.

---

## 📁 Directory Structure

```
crates/core-engine/
├── src/
│   ├── pty/                 # Pseudo-terminal Engine
│   │   ├── manager.rs       # Process pool
│   │   └── session.rs       # State management
│   ├── git/                 # Git Wrappers (libgit2/git-cli)
│   ├── fs/                  # File System Watcher (notify)
│   ├── tmux/                # Multiplexer Management
│   └── types.rs             # Engine-specific types
└── README.md
```

---

## 🛠 Working Guidelines

### 1. Error Handling
- Use the unified `error.rs`.
- Map OS-level errors to meaningful Engine errors.

### 2. PTY Sessions
- Sessions must be tracked by ID.
- Ensure proper cleanup of leaked processes.

### 3. Git Operations
- Prefer high-level abstractions for common tasks (clone, pull, commit).
- Handle concurrency when multiple agents access the same repo.

---

## 🚦 Interaction Rules
- **DO**: Depend on `infra` for state persistence if necessary.
- **DON'T**: Expose raw OS handles to `core-service`. Provide safe abstractions.

---

## 🧪 Testing
- Integration tests are crucial here (testing actual PTY spawn or Git clone).
