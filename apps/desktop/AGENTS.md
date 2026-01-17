# Desktop Application - AGENTS.md

> **🖥️ Tauri Frontend**: A cross-platform desktop wrapper for the Vibe Habitat ecosystem.

## Structure
- **Frontend (src/)**: React-based UI, mirroring the Web experience but with local capabilities.
- **Backend (src-tauri/)**: Rust-based native layer.
- **Commands**: Hand-written Rust commands in `src-tauri/src/commands/` bridge JS and Rust.

## Working Patterns
- **Native Bridges**: Use `commands.ts` (auto-generated) for calling Rust logic from React.
- **State**: Manage native app state in `src-tauri/src/state.rs`.
