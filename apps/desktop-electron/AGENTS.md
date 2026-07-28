# Desktop Electron — AGENTS.md

> Chromium desktop shell for Atmos (APP-045 dual-shell). **Production default remains Tauri** (`apps/desktop`).

## Stack

- **TypeScript** sources under `src/`
- **esbuild** → `dist/main.js`, `dist/preload.cjs`, `dist/preview-preload.cjs` (CJS preloads for Electron loader)
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
- **macOS dev Dock name/icon**: Stock `Electron.app` always shows “Electron” (bundle `Info.plist`). `just dev-desktop-electron` stages a branded copy under `.cache/dev-app/Atmos Electron.app` via `scripts/prepare-dev-app.ts`. Packaged builds use electron-builder identity instead.
- **Close button**: Intercepted (`windows/close-behavior.ts`) — always hide (macOS) / minimize (other); process stays. Dock click restores without reload. Full quit via Cmd+Q / menu only.
- **Packaging**: `electron-builder.yml` + `scripts/package.ts`; artifacts named `Atmos-Electron_<version>_<arch>.*`.
- **macOS DMG layout**: minimal plain backdrop under `resources/dmg/`. Window **540×380**, icons at (148,170) / (392,170), `iconSize: 96`. Top: slogan only; center solid arrow; bottom `Drag Atmos to Applications to install`. Regenerate with `python3 scripts/generate-dmg-background.py` if you move icons.
- **macOS signing**: default **ad-hoc** (`mac.identity: "-"`, hardened runtime) so GitHub Release DMGs get a sealed app signature and Gatekeeper’s “unidentified developer” path instead of “damaged”. Override with `CSC_LINK` / `CSC_KEY_PASSWORD` (and optional `CSC_NAME` / `APPLE_SIGNING_IDENTITY` secret in CI) for Developer ID. Not notarized.

## Never

- Depend on Tauri crates or `@tauri-apps/*` in this package
- Enable `nodeIntegration` for product UI or preview
- Use `desktop-*` tags or production updater feeds for Electron packages
- Flip `just release-desktop` / Homebrew default to Electron without APP-045 Phase 5 product sign-off
