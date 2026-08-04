# PRD · APP-053: Desktop Browser via Electron `<webview>`

> WHAT & WHY. Product domain: **browser** (no “preview” product naming). No backward compatibility for renamed symbols/IPC.

## Goal

Ship desktop browser content as an in-DOM Electron `<webview>`, so host overlays and the **same host-rendered element-select UI used on web** stack with normal CSS; delete native-view compensation (APP-029, bounds show/hide); complete the product rename from preview→browser without dual-stack shims.

## Users

- Desktop Electron users of the embedded Browser panel and standalone browser window.
- Users who open menus/dialogs over the browser surface or use element pick/annotate.
- Users relying on multi-tab browser state, DevTools (when allowed), detach, cookies session.

## Must Haves

1. **In-DOM desktop guest** — Desktop transport only: content is `<webview>` in host layout. No in-panel `WebContentsView` / `addChildView`. Same-origin and extension keep iframe/extension carriers.
2. **Overlay stacking** — Host Radix overlays cover the live guest via z-index; no APP-029 static “occluded” replacement of the live page.
3. **Attach security** — `webviewTag` only with default-deny `will-attach-webview`: registered partition + allowlisted URL; forced `sandbox` / `contextIsolation` / no `nodeIntegration`; attach-time permission/navigation policy.
4. **No reparent** — Per-tab host slots stable; tab switch must not destroy guest state.
5. **Unified host selection UI** — Desktop uses host `SelectionPopover` + host annotation overlays like web. Guest must not productize a separate injected selection toolbar/popover (`showSelectionToolbar` guest chrome path off for product desktop flow). Guest may still draw pick highlights and emit selection/hover events.
6. **Outside-dismiss** — Shared path dismisses host overlays on window blur / focus into `WEBVIEW`.
7. **Pointer-events** — Webview `pointer-events: none` while host overlays open or tab/file/splitter drag over the surface.
8. **Capability parity** — Partition/session, preload + shared browser runtime inject, pick/annotate (via host UI + events), DevTools, nav/title/favicon, zoom, detach window, probe_url. Stop and report if any cannot match.
9. **Browser naming, no compat** — Feature module, electron browser surface, shared runtime package, IPC (`browser_bridge_*`), events (`atmos-browser:*` / `desktop-browser:*`), feature i18n under `browser.*`, routes. No dual exports or preview aliases for renamed APIs.
10. **Compensation removal** — APP-029 gone; no in-panel show/hide/updateViewport bounds-sync for geometry.

## Nice to Haves

- Z-index tokens for guest / inset chrome / global overlays.
- `app-region: no-drag` on overlays covering desktop drag regions.

## Non-Goals

- Re-arguing webview vs WebContentsView (tradeoff only in TECH).
- APP-052 revival; Tauri product work; mobile.
- Renaming historical closed specs’ folder names.
- Dual-protocol compatibility for old `browser_bridge_*` / `atmos-browser:*`.

## Success

- Menus/dialogs over live browser page; host selection popover works on desktop.
- Tab switch preserves guest state.
- Attach deny-by-default tests pass; quality gates green; rename grep clean on product paths.
