# Desktop — AGENTS.md (production)

> **Production Atmos desktop shell.** Engine: Electron (users do not need to know the framework).  
> Product identity: **Atmos** / `com.atmos.desktop`.  
> **`apps/desktop` (Tauri) is DEPRECATED** — [apps/desktop/AGENTS.md](../desktop/AGENTS.md). Do not ship from it.

## Where to change desktop code

| Task | Location |
|------|----------|
| **All desktop shell work** (window, IPC, AppShot, preview, tunnel, cookies, packaging, branding, release) | **`apps/desktop-electron/**` (this package)** |
| Deprecated Tauri shell | `apps/desktop/**` — **do not add features** |
| Shared prepare-sidecar runtime layout (Server + web static) | `scripts/desktop/prepare-sidecar.sh` → still stages under `apps/desktop/src-tauri/binaries/runtime/current` for historical path; consumed by this package |

**Default rule:** if the change is “desktop app behavior or packaging”, implement it **here**, not in `apps/desktop`.

## Commands

```bash
just dev-desktop                   # production desktop
just build-desktop                 # prepare-sidecar + package installers
just release-desktop 2026.7.28     # /atmos-desktop-release
just release-desktop-dry-run 2026.7.28
just test-desktop-electron-smoke

cd apps/desktop-electron
bun run build
bun run package
bun test
```

## Identity

| | Production desktop | Deprecated Tauri (`apps/desktop`) |
|--|--------------------|-------------------------------------|
| Product name | `Atmos` | `Atmos (Tauri)` |
| App id | `com.atmos.desktop` | `com.atmos.desktop.tauri` |
| Dev bundle id | `com.atmos.desktop.dev` | `com.atmos.desktop.tauri.dev` |
| Tag | `desktop-electron-<version>` | ~~`desktop-*` (do not ship)~~ |
| Workflow | `release-desktop-electron.yml` | deprecated |
| Artifacts | `Atmos_<version>_<arch>.*` | n/a |

Shared data contracts:

| Contract | Path |
|----------|------|
| Server data | `ATMOS_DATA_DIR` or `~/.atmos/desktop` |
| AppShot | `~/.atmos/appshots/records/<13-digit-ms>/` |
| Protocol | `atmos://appshots/{timestamp}` |
| Tunnel gateway | `http://127.0.0.1:30313` + `entry_token` |

Release notes: `releasenotes/Atmos Desktop <version>.md`.

## Architecture

- Preload: `window.__ATMOS_DESKTOP__` (`shell: 'electron'`, `invoke`, `on`)
- UI from Atmos Server loopback static
- Preview: `WebContentsView` + `persist:atmos-preview`
- Commands match historical names (`get_api_config`, `preview_bridge_*`, `appshot_*`, `tunnel_connector_*`, …)
- AppShot: dual-shift, live TCC, frontmost capture, pending auto-accept, shared `appshots` layout
- Cookies: `atmos-browser-cookies` under `resources/bin`
- Tunnel: shared local gateway + share URL
- Quit: stop Server when this process started it
- Dev Dock branding: `scripts/prepare-dev-app.ts` → `.cache/dev-app/Atmos.app`
- Packaging: `electron-builder.yml`; ad-hoc sign by default (`identity: "-"`)

## Never

- Implement desktop product changes under deprecated `apps/desktop` (Tauri) — **always this package**
- Ship from `apps/desktop`
- Enable `nodeIntegration` for product UI or preview
- Fork AppShot/Server on-disk contracts
