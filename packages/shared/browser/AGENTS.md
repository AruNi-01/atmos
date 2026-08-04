# Shared browser runtime

`browser-runtime.js` is the guest page runtime for desktop inject and related tooling.

- Protocol events: `atmos-browser:*`
- Global: `window.__ATMOS_BROWSER_RUNTIME__`
- Product desktop uses `showSelectionToolbar: false` (host SelectionPopover).
