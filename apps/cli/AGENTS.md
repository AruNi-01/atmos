# CLI Tool (atmos) - AGENTS.md

> **🛠️ atmos CLI**: Command-line interface for developer productivity.

---

## Build And Test

- **Dev**: `just dev-cli` (runs `--help`)
- **Build**: `just build-cli`
- **Install**: `just install-cli` (installs to system)
- **Test**: `cargo test -p atmos` (if tests exist)

---

## 📁 Directory Structure

```
apps/cli/
├── src/
│   ├── commands/            # Subcommand implementations
│   ├── main.rs              # CLI entry point
│   └── config.rs            # Configuration management (if exists)
└── Cargo.toml
```

---

## Coding Conventions

### Commands
- Subcommands implemented in `src/commands/`

### UI/Output
- TUI components or formatted console output in `src/ui.rs`

### Integration
- CLI uses same `core-service` or `api-client` logic as other apps

### Configuration
- Managed in `src/config.rs`

---

## Safety Rails

### NEVER
- Duplicate business logic that exists in `core-service`
- Add dependencies that aren't available on all target platforms

### ALWAYS
- Reuse existing services from `core-service` or `api-client`
- Keep CLI output consistent and user-friendly

