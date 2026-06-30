# Shared Preview Runtime - Agent Guide

This directory owns `preview-runtime.js`, the canonical runtime injected into
desktop-native preview webviews and the browser extension.

## Desktop Preview Cursor Rules

Desktop preview runs inside a Tauri child webview, but the OS cursor is shared
with the parent webview. Cursor changes from the injected runtime and the
desktop bridge can fight each other and cause visible flicker.

When adding or changing overlay UI such as element-selection toolbars,
annotation markers, buttons, inputs, or cards:

1. Mark every runtime-owned overlay node with `data-atmos-preview-overlay="true"`.
2. Keep overlay cursor CSS layered so toolbar controls show their native cursor:
   overlay defaults to `default`, buttons and descendants use `pointer`, and
   text inputs/textarea/contenteditable controls use `text`.
3. Do not use plain `cursor: revert` for the whole overlay. Overlay background
   and plain text nodes can inherit the picker cursor from the page-wide rule.
4. Do not force the green/orange element-selection picker cursor onto overlay controls. The
   picker cursor is for the inspected page surface, not for the toolbar UI.
5. In the desktop bridge cursor tracker, overlay targets must be computed from
   their real CSS cursor. Do not apply `window.__ATMOS_PREVIEW_PICK_CURSOR__`
   when `event.target.closest('[data-atmos-preview-overlay="true"]')` is true.
6. Do not skip overlay mousemove events entirely. Skipping them can leave a
   stale OS cursor from the parent webview.

The stable pattern is:

```js
var isOverlayTarget =
  target.closest && target.closest('[data-atmos-preview-overlay="true"]');
var override = isOverlayTarget ? '' : window.__ATMOS_PREVIEW_PICK_CURSOR__;
```

Then fall back to `getComputedStyle(target).cursor`, resolving `auto` to a
concrete cursor value in the desktop bridge.

## Verification Checklist

After changing element-selection overlay UI or cursor logic, test in
desktop-native preview:

- Hover inspected page text: cursor remains text/custom as expected.
- Hover inspected page buttons/links: cursor remains stable.
- Select an element so the toolbar appears.
- Move across toolbar buttons and inputs: cursor changes to each control's
  native cursor without flickering.
- Move from toolbar back to the page: picker cursor returns without flickering.

Remember that `preview-runtime.js` is embedded into the desktop app via
`include_str!`, so desktop changes require a Rust rebuild/restart to take
effect.
