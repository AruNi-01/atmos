# Atmos Inspector Extension

Chrome/Edge extension that bridges cross-port preview element selection for Atmos. When the preview target runs on a different port than the Atmos web app (e.g. `localhost:5173` vs `localhost:3030`), browsers block direct iframe DOM access. This extension injects a runtime into the target page to enable element inspection via `postMessage`.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest — permissions, content script registration |
| `background.js` | Service worker (minimal, install log only) |
| `content.js` | Injected by Chrome into matching pages; loads `preview-runtime.js` and `injected.js` |
| `injected.js` | Page-level glue — receives `host-init` from Atmos, creates runtime controller, relays messages |
| `preview-runtime.js` | Extension-specific preview runtime. Shares inspection logic with `packages/shared/preview/preview-runtime.js` but has a different overlay architecture (see below). |

## How It Works

```
Atmos host (localhost:3030)
  │  postMessage("host-init")
  ▼
injected.js (in target page)
  │  creates controller from extension/preview-runtime.js
  │  sends "ready" + extensionVersion
  ▼
extension/preview-runtime.js
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
2. **`extension/preview-runtime.js`** → `var EXTENSION_VERSION = '...'` (top of the IIFE)
3. **`packages/shared/preview/preview-runtime.js`** → same `var EXTENSION_VERSION = '...'` value

All three values must always match. Forgetting any one will break the update detection.

## Two Runtime Variants

There are two `preview-runtime.js` files. They share the same inspection logic (element selection, React/Vue/Angular/Svelte source locators, event handling) and public API (`createRuntime`), but differ in overlay implementation:

| | `extension/preview-runtime.js` | `packages/shared/preview/preview-runtime.js` |
|---|---|---|
| **Used by** | Browser extension (Chrome MV3) | Desktop app (Tauri `include_str!`) |
| **Overlay** | Single root container + single-box divs | Per-segment border divs (4 thin edges per box) |
| **`setCursor()`** | Working — sets cursor on root, boxes, labels | No-op — Tauri manages cursor natively via Rust bridge |
| **UI sizing** | Larger (44px buttons, 22px icons) | Compact (34px buttons, 17px icons) |

The desktop variant uses per-segment borders to avoid intercepting pointer events in the cross-origin Tauri child webview, where a single overlay div would block the native cursor tracking.

When modifying inspection logic, source locators, or the public API, update **both** files. Overlay/cursor changes are variant-specific.

## Downstream Consumers

- **Desktop app** (`apps/desktop/src-tauri/src/preview_bridge/mod.rs`): embeds `packages/shared/preview/preview-runtime.js` at compile time via `include_str!`.
- **Extension transport** (`apps/web/src/components/run-preview/preview-transports/extension-transport.ts`): communicates with `injected.js` via `postMessage`.

## Supported Origins

Defined in `manifest.json` host_permissions / content_scripts matches:

- `localhost` and `*.localhost` (e.g. `atmos.localhost:30001`)
- `127.0.0.1`, `[::1]`
- Both `http` and `https`

To add new origins, update all three sections in `manifest.json`: `host_permissions`, `content_scripts.matches`, `web_accessible_resources.matches`. Also update `isLocalPreviewTarget()` in `Preview.tsx` and `defaultAllowedOrigins` in `injected.js`.

## Local Development

Users install via the Atmos UI "Install" button (downloads a zip). To test changes locally:

1. Edit files in this directory.
2. Go to `chrome://extensions` → find "Atmos Inspector" → click reload ↻.
3. Reload the target page in Atmos Preview.
