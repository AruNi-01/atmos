# Desktop Application - AGENTS.md

> **🖥️ Tauri Frontend**: Cross-platform desktop wrapper for the ATMOS ecosystem.

---

## Build And Test

- **Dev**: `just dev-desktop` — `prepare-sidecar.sh` (rebuilds web static + API/CLI) then `tauri dev --no-dev-server-wait --no-watch` (no `dev-web` required)
- **Build**: `just build-desktop`
- **Prepare**: `bash ./scripts/desktop/prepare-sidecar.sh` (builds latest `apps/web/out`, API/CLI, lays out `binaries/runtime/current`)
- **Faster re-run** (Rust-only): `ATMOS_DESKTOP_SKIP_WEB_BUILD=1 just dev-desktop`
---


## Local API runtime (unified with CLI / local-web)

Desktop **does not** spawn a dedicated Tauri sidecar with a per-launch `ATMOS_LOCAL_TOKEN`.

On startup, `src-tauri/src/runtime.rs` calls `runtime-manager::supervisor::ensure_running` against the bundled layout:

```text
apps/desktop/src-tauri/binaries/runtime/current/
  bin/api
  bin/atmos
  web/              # static export (production navigates to http://127.0.0.1:<port>)
  system-skills/
```

- Discovery: `~/.atmos/runtime_manifest.json` (written by the API; **no auth token** in the manifest).
- Data dir: `ATMOS_DATA_DIR` → Tauri app data directory.
- **Quit also stops the API daemon** — `RunEvent::Exit` in `src-tauri/src/main.rs` calls `runtime_manager::supervisor::stop_running(false)`. Desktop owns the runtime lifecycle for end users; closing the app should not leave a loopback API listening in the background. CLI / local-web-runtime can independently re-`ensure` it later.

`get_api_config` returns `{ host: "127.0.0.1", port }` only. Web reads it via `apps/web/src/lib/desktop-runtime.ts`.

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
│   │   ├── runtime.rs        # ensure shared local API (runtime-manager)
│   │   └── commands.rs       # Hand-written Rust commands (JS ↔ Rust bridge)
│   ├── tauri.conf.json       # Tauri configuration
│   └── tauri.debug.conf.json # Debug configuration
└── package.json
```

---

## Coding Conventions

### Native Bridges
- Use `commands.ts` (auto-generated) for calling Rust logic from React
- Hand-written Rust commands live in `src-tauri/src/commands.rs`

### State Management
- Manage native app state in `src-tauri/src/state.rs`

---

## Safety Rails

### NEVER
- Modify Tauri configuration without understanding desktop-specific constraints
- Assume desktop has same network behavior as web — handle offline/local scenarios
- Re-introduce a Desktop-only API token or kill the shared API on app exit without an explicit product decision

### ALWAYS
- Run `prepare-sidecar.sh` before dev/build (creates `binaries/runtime/current`)
- Test native commands work correctly before integrating with React
