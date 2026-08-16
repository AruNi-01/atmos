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
| Server shell data | `ATMOS_DATA_DIR` or `~/.atmos/data/desktop` (shell-only; product data stays under `~/.atmos/data/{token-usage,quota-usage,db,…}`) |
| AppShot | `~/.atmos/appshots/records/<13-digit-ms>/` |
| Protocol | `atmos://appshots/{timestamp}` |
| Tunnel gateway | `http://127.0.0.1:30313` + `entry_token` |

Release notes: `releasenotes/Atmos Desktop <version>.md`.

## Architecture

- Preload: `window.__ATMOS_DESKTOP__` (`shell: 'electron'`, `invoke`, `on`, `terminalStream`)
- UI from Atmos Server loopback static
- **Known debt (transport):** session kernel still uses **HTTP + WebSocket**. **Local terminal live I/O** uses renderer↔main binary IPC (`terminalStream` in preload; [ADR-006](../../docs/adr/006-terminal-client-byte-stream-port.md)). Main prefers Unix domain WS to sidecar `/ws/terminal/:id`, with loopback WS fallback. See [docs/architecture/known-debt-client-transport.md](../../docs/architecture/known-debt-client-transport.md).
- **Relay client kind:** product UI is `apps/web`; Electron is detected at runtime. Relay sessions use `@atmos/relay-client` with `clientKind: "desktop"` via `workbenchRelayClientKind()` (not a separate desktop SDK). Computer gateway REST (`/api/system/*` on `gateway_url`) stays in `apps/web/src/api/relay.ts`.
- Browser (APP-053): in-DOM `<webview>` + `persist:atmos-browser` (default-deny `will-attach-webview`); `apps/desktop-electron/src/browser`
- Browser guest inject: `packages/shared/browser/browser-runtime.js` is **copied into `dist/browser-runtime.js` at build** (packaged apps must not rely on monorepo paths)
- Commands: `get_api_config`, `browser_bridge_*`, `appshot_*`, `tunnel_connector_*`, …; terminal live stream is **not** a JSON command (`terminalStream` IPC)
- AppShot: dual-shift, live TCC, frontmost capture, target-window border/flash overlay, pending auto-accept + fly-in preview (`source_bounds`), shared `appshots` layout
- Cookies: `atmos-browser-cookies` under `resources/bin`
- Tunnel: shared local gateway + share URL
- Quit: stop Server when this process started it
- Dev Dock branding: `scripts/prepare-dev-app.ts` → `.cache/dev-app/Atmos.app`
- Packaging: `electron-builder.yml`; ad-hoc sign by default (`identity: "-"`)
- macOS icons: `resources/icons/icon.icon` (Liquid Glass / macOS 26+ via Xcode `actool` ≥ 26) + legacy `icon.icns`; `bun run regen-legacy-icns` also refreshes Desktop Use host icns + web `notification-icon.png` so brand surfaces stay unified; CI uses `macos-26` / `macos-26-intel` runners
- **CLI floor for CLI-backed features** (Desktop Use, etc.): package pin `desktop-use/cli-requirement.json` (`min_cli_version`); do not gate on channel latest. Details: [agents/references/cli-feature-versions.md](../../agents/references/cli-feature-versions.md)

## Never

- Implement desktop product changes under deprecated `apps/desktop` (Tauri) — **always this package**
- Ship from `apps/desktop`
- Enable `nodeIntegration` for product UI or browser guests
- Fork AppShot/Server on-disk contracts
- Bundle the Atmos CLI binary into the app; or use R2/GitHub “latest CLI” as a feature readiness gate (use package `min_cli_version` instead)
