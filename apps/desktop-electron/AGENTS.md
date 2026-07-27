# Desktop Electron — AGENTS.md

> Chromium desktop shell for Atmos (APP-045 dual-shell). **Production default remains Tauri** (`apps/desktop`).

## Stack

- **TypeScript** sources under `src/`
- **esbuild** → `dist/main.js`, `dist/preload.js`, `dist/preview-preload.cjs` (CJS for sandboxed preview)
- Electron 37+ (`WebContentsView` for native preview)

## Commands

```bash
just dev-desktop-electron          # prepare + build + launch
ATMOS_DESKTOP_SKIP_WEB_BUILD=1 just dev-desktop-electron
just test-desktop-electron-smoke   # headless router + ensure Server

cd apps/desktop-electron
bun run build
bun run typecheck
bun test
```

## Architecture

- Preload exposes `window.__ATMOS_DESKTOP__` (`shell: 'electron'`, `invoke`, `on`)
- Product UI loads from Atmos Server loopback static (`http://127.0.0.1:port/`)
- Preview uses `persist:atmos-preview` session partition + limited preview preload
- Command names match Tauri (`get_api_config`, `preview_bridge_*`, `appshot_*`, `tunnel_connector_*`, …)
- **Branding**: product name `Atmos` / id `com.atmos.desktop` (matches Tauri). Icons sync from `apps/desktop/src-tauri/icons` → `resources/icons` on `bun run build` (also falls back to Tauri path at runtime). Dock + window icons applied in `src/branding.ts`.

## Never

- Depend on Tauri crates or `@tauri-apps/*` in this package
- Enable `nodeIntegration` for product UI or preview
- Flip `just release-desktop` to Electron without APP-045 Phase 5 product sign-off
