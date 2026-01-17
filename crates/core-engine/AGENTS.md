# Core Engine Layer (L2) - AGENTS.md

> **⚙️ L2: Technical Capabilities**: This crate encapsulates complex technical operations into reusable modules.

## Core Modules
- **PTY (pty/)**: Managing pseudo-terminals and process pools.
- **Git (git/)**: Wrappers for repository operations (clone, commit, etc.).
- **Tmux (tmux/)**: Session management via tmux integration.
- **FS (fs/)**: File system watching and specialized I/O.

## Working Patterns
- **Decoupling**: The engine should not know about business logic or specific user identities.
- **Error Handling**: Map OS-level errors to domain-specific engine errors.
