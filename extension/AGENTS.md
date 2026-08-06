# Atmos Inspector Extension

Chrome/Edge extension that bridges cross-port preview element selection for Atmos. When the preview target runs on a different port than the Atmos web app (e.g. `localhost:5173` vs `localhost:3030`), browsers block direct iframe DOM access. This extension injects a runtime into the target page to enable element inspection via `postMessage`.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest — permissions, content script registration |
| `background.js` | Service worker (minimal, install log only) |
| `content.js` | Injected by Chrome into matching pages; loads `browser-runtime.js` and `injected.js` |
| `injected.js` | Page-level glue — receives `host-init` from Atmos, creates runtime controller, relays messages |
| `browser-runtime.js` | **Synced copy** of `packages/shared/browser/browser-runtime.js` (run `bun run extension/scripts/sync-browser-runtime.ts`). Do not hand-edit. |

## How It Works

```
Atmos host (localhost:3030)
  │  postMessage("host-init")
  ▼
injected.js (in target page)
  │  creates controller from extension/browser-runtime.js
  │  sends "ready" + extensionVersion
  ▼
extension/browser-runtime.js
  │  mousemove → hover overlay
  │  click → selected payload (DOM context + source location)
  │  pushState/popstate → navigation-changed
  ▼
Atmos host receives events via postMessage
```

## Version Bumping (Important)

The extension includes a version-check mechanism. When users click the element picker, Atmos compares the installed extension version against the server version (once per day). If they differ, a green "Update" badge appears.

**When you modify any file in this directory, you MUST bump the version in TWO places:**

1. **`manifest.json`** → `"version"` field
2. **`extension/browser-runtime.js`** → `var EXTENSION_VERSION = '...'` (top of the IIFE)
3. **`packages/shared/browser/browser-runtime.js`** → same `var EXTENSION_VERSION = '...'` value

All three values must always match. Forgetting any one will break the update detection.

## Single Runtime Source

**Canonical file:** `packages/shared/browser/browser-runtime.js`

- Desktop Electron injects that file (copied to `apps/desktop-electron/dist/browser-runtime.js` at build).
- Extension ships a copy under `extension/browser-runtime.js` — regenerate with:

```bash
bun run extension/scripts/sync-browser-runtime.ts
```

`injected.js` creates the runtime with `showSelectionToolbar: false` and `showHoverLabel: true` so host SelectionPopover matches desktop (guest draws hover/lock only).

When changing inspection logic, edit **shared only**, then re-sync the extension.

## Downstream Consumers

- **Desktop Electron** (`apps/desktop-electron/src/browser`): injects `packages/shared/browser/browser-runtime.js` into guests (legacy Tauri path is non-product).
- **Extension transport** (`apps/web/src/features/browser/lib/browser-transports/extension-transport.ts`): communicates with `injected.js` via `postMessage`.

## Supported Origins

Defined in `manifest.json` host_permissions / content_scripts matches:

- `localhost` and `*.localhost` (e.g. `atmos.localhost:30001`)
- `127.0.0.1`, `[::1]`
- Both `http` and `https`

To add new origins, update all three sections in `manifest.json`: `host_permissions`, `content_scripts.matches`, `web_accessible_resources.matches`. Also update `isLocalPreviewTarget()` in `BrowserSession.tsx` and `defaultAllowedOrigins` in `injected.js`.

## Local Development

Users install via the Atmos UI "Install" button (downloads a zip). To test changes locally:

1. Edit files in this directory.
2. Go to `chrome://extensions` → find "Atmos Inspector" → click reload ↻.
3. Reload the target page in Atmos Preview.
