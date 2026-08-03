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
| Artifacts | local: `Atmos.*` · release (CI rename): `Atmos_<version>_<arch>.*` | n/a |

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
- **Overlay surface (APP-052)**: one shared elevatable overlay per host window (`src/overlay/`, `overlay_bridge_*`, `get_desktop_capabilities.overlaySurface`) so host floating UI can stack above live preview; APP-029 hide remains fallback
- Commands match historical names (`get_api_config`, `preview_bridge_*`, `overlay_bridge_*`, `appshot_*`, `tunnel_connector_*`, …)
- AppShot: dual-shift, live TCC, frontmost capture, target-window border/flash overlay, pending auto-accept + fly-in preview (`source_bounds`), shared `appshots` layout
- Cookies: `atmos-browser-cookies` under `resources/bin`
- Tunnel: shared local gateway + share URL
- Quit: stop Server when this process started it
- Dev Dock branding: `scripts/prepare-dev-app.ts` → `.cache/dev-app/Atmos.app`
- Packaging: `electron-builder.yml`; ad-hoc sign by default (`identity: "-"`)

### Floating UI over native preview

Host DOM cannot cover `WebContentsView` via CSS. Product rules, portal checklist, and anti-patterns live in a **load-on-demand** reference (not duplicated here):

→ [agents/references/desktop-floating-ui.md](../../agents/references/desktop-floating-ui.md)

Attach overlay host wiring on every product window that can host preview (`main-window`, `secondary`, …). Do not spawn one native surface per popover.

## Never

- Implement desktop product changes under deprecated `apps/desktop` (Tauri) — **always this package**
- Ship from `apps/desktop`
- Enable `nodeIntegration` for product UI or preview
- Fork AppShot/Server on-disk contracts
- Expect host `z-index` alone to paint above preview WebContentsView
