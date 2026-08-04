# TECH · APP-053: Desktop Browser via Electron `<webview>`

> HOW. Domain: **browser**. No backward-compatible preview aliases.

## Scope

| Area | Change |
|------|--------|
| Specs | APP-053 browser + webview + host selection |
| **Browser Use (embedded)** | Host control plane + `atmos browser-use --backend embedded` (see APP-052 §5.2) — CDP/DOM via guest WebContents, **not** user-Chrome `browser_prepare` |
| `apps/desktop-electron/src/browser` | webviewTag, attach policy, surface manager without in-panel WebContentsView, `browser_bridge_*` |
| `apps/web/src/features/browser` | mount `<webview>` for transport `desktop`; host selection UI; delete APP-029; rename symbols |
| `packages/shared/browser` | `browser-runtime.js`; protocol `atmos-browser:*`; host toolbar path (`showSelectionToolbar: false` product) |
| `extension` | runtime rename + protocol rename (same-origin of protocol with desktop) |
| i18n | feature keys under `browser.*` only |

**No compat:** drop old product tokens (no dual stack / re-export shims):

- `preview_bridge_*` → use `browser_bridge_*` only
- `desktop-preview:*` / `atmos-preview:*` → `desktop-browser:*` / `atmos-browser:*`
- `persist:atmos-preview` → `persist:atmos-browser`
- `features/run-preview`, `packages/shared/preview`, `open_preview_browser_window`, `app/preview` route
- top-level feature i18n `preview.*` for this domain (merged under `browser.*`)

## Tradeoff (locked)

Electron prefers WebContentsView over `<webview>`. Accepted: lose official preference for CSS stacking + delete ~APP-029 compensation + one selection UI.

**Upgrade regression checklist:** attach deny-default; preload `file://` packaged; multi-tab no reload; overlay over live guest; host SelectionPopover; pick mode; DevTools; detach; probe_url; cookies session; blur-before-hide; drag pointer-events.

## Naming map (shipped)

| Old | New |
|-----|-----|
| `features/run-preview` | `features/browser` |
| `desktop-electron/src/preview` | `desktop-electron/src/browser` |
| `packages/shared/preview/preview-runtime.js` | `packages/shared/browser/browser-runtime.js` |
| `preview_bridge_*` | `browser_bridge_*` |
| `atmos-preview:*` | `atmos-browser:*` |
| `desktop-preview:*` | `desktop-browser:*` |
| `persist:atmos-preview` | `persist:atmos-browser` |
| transport `desktop-native` | `desktop` |
| `PreviewSurfaceManager` | `BrowserSurfaceManager` |
| `__ATMOS_PREVIEW_*` | `__ATMOS_BROWSER_*` |
| `open_preview_browser_window` / `preview/` route | `open_browser_window` / `browser/` route |
| window label `preview-browser` | `browser` |
| i18n `preview.toolbar` etc. | `browser.toolbar` etc. (flatten former `browser.preview.*`) |

## Architecture

```text
Host renderer (features/browser)
  permanent tab slot → BrowserViewport
    <webview partition preload src>   z guest
    host SelectionPopover + annotations  z chrome
    global Radix portals                 z app
  IPC browser_bridge_* → main

Main
  will-attach-webview default DENY (webview-attach-policy)
  did-attach-webview → bind guest WebContents
  BrowserSurfaceManager: register / inject / pick / devtools / detach / probe
```

### Event path

Hybrid: guest preload → `browser_bridge_event` → gate/remap → `desktop-browser:*` to host. Main attaches inject/title/favicon/window-open on bound guest. Host DOM webview events optional.

### Selection UI

- Product desktop inject: `showSelectionToolbar: false` (emit hover/selected like web).
- Host always renders `SelectionPopover` + annotation overlays for all transports including `desktop`.
- Remove branches that null out host popover/overlays for desktop-only stacking reasons.
- Toolbar-action path from guest may remain for extension if needed; desktop product uses host popover actions.

## Hard constraints

### HC1 Security

- Product UI windows: `webviewTag: true` + `installBrowserWebviewHooks(win, manager)`.
- Pure `evaluateWillAttach` / `forceGuestWebPreferences` / `BROWSER_PARTITION`.
- Default preventDefault; only registered partition+http(s)|about:blank.

### HC2 No reparent

- Webview only inside permanent tab slots; hide inactive with layout-removing CSS; destroy only on tab/session close.

### HC3 Outside-dismiss

- Shared hook: window `blur` + `focusin` on `WEBVIEW` → dismiss open overlays.

### HC4 Pointer-events

- Class/token when overlay open or drag active → webview `pointer-events: none`.

### HC5 Capability matrix

| Capability | Mechanism | Verify |
|------------|-----------|--------|
| Partition | `persist:atmos-browser` | open returns partition; cookie import session |
| Preload | absolute `file://` + will-attach force path | unit `toPreloadFileUrl` |
| Runtime inject | executeJS browser-runtime on load | ready event path / inject helper |
| Pick + annotate | enterPickMode + host SelectionPopover | unit + structural host UI |
| DevTools | guest.openDevTools + policy | unit/policy |
| Nav/title/favicon | main listeners → desktop-browser:* | event-remap tests |
| Zoom | setZoomFactor on guest | unit when bound |
| Detach | BrowserWindow + same partition | structural |
| probe_url | IPC validate http(s) | unit/smoke |

## Surface manager rewrite

- **Remove:** WebContentsView create/addChildView/setBounds/setVisible for in-panel.
- **open:** register session + return `{ partition, preloadUrl, bridgeToken }`; mark pendingAttach.
- **bindGuest / onGuestAttached:** store guest wc; listeners; inject.
- **show/hide/updateBounds:** removed from product call sites; handlers deleted or not registered.
- **navigate / pick / annotations / devtools / close / detach / event / probe:** on guest wc or detached window.

## Web feature

| Piece | Change |
|-------|--------|
| `DesktopBrowserWebview` | Electron-only `<webview>`; layout-before-src; blur before hide |
| desktop transport | `browser_bridge_open` without bounds geometry; no show/hide/updateViewport |
| Preview* components | rename toward Browser* where product-facing; fix imports |
| lifecycle effects | drop bounds ResizeObserver / double-rAF / 320ms show |
| delete | `use-native-preview-occlusion` + tests |
| types | transport mode `desktop` \| `same-origin` \| `extension` |

## i18n

Merge top-level `preview` keys into `browser`. Flatten former `browser.preview.*` to `browser.*`. Update all `useTranslations("preview.…")` and `browser.preview.…`.

## Rollout

1. Specs + pure attach policy tests.
2. Protocol/IPC/i18n rename cut.
3. Surface manager webview path + hooks + webviewTag.
4. Host mount webview + selection unity + delete compensation.
5. Quality gates.

## Risks

| Risk | Mitigation |
|------|------------|
| Webview churn | upgrade checklist |
| Packaged preload | file URL + exists check; CJS sandbox preload |
| Rename miss | product-path grep gate |
| Capability gap | stop and report |
