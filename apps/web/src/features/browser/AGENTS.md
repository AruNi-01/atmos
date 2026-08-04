# Browser Feature — Agent Guide

Product domain name is **browser** (not preview). Feature path: `apps/web/src/features/browser`.

## Transports

| Mode | Where | Carrier |
|------|-------|---------|
| `same-origin` | Web | iframe |
| `extension` | Web | Atmos Inspector extension |
| `desktop` | Electron desktop | in-DOM `<webview>` (APP-053) |

Desktop selection chrome uses the **same host** `SelectionPopover` + annotation overlays as web. Guest runtime injects with `showSelectionToolbar: false`.

## Desktop notes

- Main process: `apps/desktop-electron/src/browser` — attach policy, `BrowserSurfaceManager`, `browser_bridge_*` IPC.
- Partition: `persist:atmos-browser`. Events: `atmos-browser:*` → `desktop-browser:*`.
- Do not reintroduce WebContentsView for in-panel browser or APP-029 occlusion hide.
- Permanent tab slots in `BrowserPanel` / `BrowserStandalonePage` — never reparent `<webview>`.
