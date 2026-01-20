# CLI Tool (atmos) - AGENTS.md

> **🛠️ atmos CLI**: The command-line interface for developer productivity.

## Structure
- **Commands**: Subcommands implemented in `src/commands/`.
- **UI**: TUI components or formatted console output in `src/ui.rs`.

## Working Patterns
- **Integration**: CLI uses the same `core-service` or `api-client` logic as other apps.
- **Configuration**: Managed in `src/config.rs`.
