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
just build-desktop-electron        # prepare-sidecar + electron-builder package
just release-desktop-electron 2026.7.28   # tag desktop-electron-* + push (CI package)
just release-desktop-electron 2026.7.28 --dry-run

cd apps/desktop-electron
bun run build
bun run package
bun run typecheck
bun test
```

## Release identity (must stay separate from Tauri)

| | Electron (this app) | Tauri (production) |
|--|---------------------|--------------------|
| Product name | `Atmos Electron` | `Atmos` |
| App id | `com.atmos.desktop.electron` | `com.atmos.desktop` |
| Tag | `desktop-electron-<version>` | `desktop-<version>` |
| Workflow | `.github/workflows/release-desktop-electron.yml` | `.github/workflows/release-desktop.yml` |
| Homebrew / R2 latest | **no** | yes |

Release notes: `releasenotes/Atmos Desktop Electron <version>.md`.

## Architecture

- Preload exposes `window.__ATMOS_DESKTOP__` (`shell: 'electron'`, `invoke`, `on`)
- Product UI loads from Atmos Server loopback static (`http://127.0.0.1:port/`)
- Preview uses `persist:atmos-preview` session partition + limited preview preload
- Command names match Tauri (`get_api_config`, `preview_bridge_*`, `appshot_*`, `tunnel_connector_*`, …)
- **Branding**: `Atmos Electron` / `com.atmos.desktop.electron`. Icons sync from `apps/desktop/src-tauri/icons` → `resources/icons` on build. Packaged runtime lives under `process.resourcesPath/runtime/current`.
- **Packaging**: `electron-builder.yml` + `scripts/package.ts`; artifacts named `Atmos-Electron_<version>_<arch>.*`.

## Never

- Depend on Tauri crates or `@tauri-apps/*` in this package
- Enable `nodeIntegration` for product UI or preview
- Use `desktop-*` tags or production updater feeds for Electron packages
- Flip `just release-desktop` / Homebrew default to Electron without APP-045 Phase 5 product sign-off
