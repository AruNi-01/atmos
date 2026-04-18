# Desktop Application - AGENTS.md

> **🖥️ Tauri Frontend**: Cross-platform desktop wrapper for the ATMOS ecosystem.

---

## Build And Test

- **Dev**: `just dev-desktop` (full) or `just dev-desktop-tauri` (Tauri only)
- **Build**: `just build-desktop`
- **Prepare**: `bash ./scripts/desktop/prepare-sidecar.sh` (run before dev/build)

---

## 📁 Directory Structure

```
apps/desktop/
├── src/
│   ├── components/           # React UI components
│   ├── hooks/                # Custom React hooks
│   ├── pages/                # Page components
│   ├── styles/               # Component styles
│   └── types/                # TypeScript definitions
├── src-tauri/                # Rust-based native layer
│   ├── src/
│   │   └── commands/         # Hand-written Rust commands (JS ↔ Rust bridge)
│   ├── tauri.conf.json       # Tauri configuration
│   └── tauri.debug.conf.json # Debug configuration
└── package.json
```

---

## Coding Conventions

### Native Bridges
- Use `commands.ts` (auto-generated) for calling Rust logic from React
- Hand-written Rust commands live in `src-tauri/src/commands/`

### State Management
- Manage native app state in `src-tauri/src/state.rs`

---

## Safety Rails

### NEVER
- Modify Tauri configuration without understanding desktop-specific constraints
- Assume desktop has same network behavior as web — handle offline/local scenarios

### ALWAYS
- Run `prepare-sidecar.sh` before dev/build
- Test native commands work correctly before integrating with React

