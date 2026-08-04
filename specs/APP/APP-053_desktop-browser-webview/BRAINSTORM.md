# Brainstorm · APP-053: Desktop Browser via Electron `<webview>`

> Problem space. Settled content → PRD / TECH. Product domain name is **browser** (not preview).

## Context

Desktop browser (embedded panel + standalone window) used Electron `WebContentsView` painted above host DOM. Host z-index could never cover it → APP-029 hide-live-guest on overlay intersection; APP-052 overlay window failed. Guest also used a **separate injected selection toolbar** because host `SelectionPopover` could not stack above the native view.

`<webview>` is in-DOM: overlays and host selection chrome can share the host document. Directory renames (`run-preview` → `browser`, etc.) are in progress; symbols/IPC/i18n must finish with **no backward-compat shims**.

## Goals (draft)

- In-panel desktop path: `<webview>` only; delete WebContentsView attach for that path.
- Host element-select UI (SelectionPopover + annotation markers) **same as web** for desktop.
- Full rename preview→browser (modules, IPC, events, partition, i18n for this feature).
- Remove APP-029 + bounds show/hide compensation; add outside-dismiss + pointer-events.
- Keep same-origin / extension **carriers**; share naming + selection chrome only.

## Options

### A — Keep WebContentsView + APP-029
**Cons**: native stacking debt remains; dual selection UI remains.

### B — In-DOM `<webview>` + host selection chrome (chosen)
**Pros**: one UI stack; delete occlusion; rename cleanly.
**Cons**: Electron documents webview as non-preferred; upgrade regression risk.

### C — APP-052 overlay window
**Cons**: already disproven.

## Key forks

- Product name: **browser** everywhere in this domain — no dual protocol.
- Selection: host chrome for all transports; guest only pick highlight + events.
- Events: main-bound guest `webContents` inject + IPC remap (hybrid) vs pure DOM events — prefer hybrid for stable product event names under new `desktop-browser:*` prefix.

## Open questions

- [x] Rename without compat — yes.
- [x] Align desktop selection with web host UI — yes.
- [ ] Packaged preload `file://` — verify in TECH / impl.

## Ready to promote

- PRD: webview, host selection unity, rename, security, capability list.
- TECH: attach gate, no reparent, outside-dismiss, pointer-events, matrix, tradeoff.
