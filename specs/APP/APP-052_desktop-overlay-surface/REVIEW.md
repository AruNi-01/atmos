# REVIEW · APP-052: Desktop Overlay Surface - Implementation Review

> Post-implementation review log for functional completeness, architecture, maintainability, code size, testability, and follow-up fixes. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: 2026-08-03  
**Review scope**: functional review + implementation review (user-reported: opening any floating UI either shows nothing or blacks out the window)  
**Related code**: `apps/desktop-electron/src/overlay/`, `apps/web/src/shared/lib/desktop-overlay/`, `apps/web/src/features/run-preview/components/Preview.tsx`

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P0 | frontend | Cross-realm `instanceof HTMLElement` made overlay layer counting always zero | fixed |
| REV-002 | P0 | infra | `window.open` + `overrideBrowserWindowOptions` transparency unreliable → opaque black overlay | fixed |
| REV-003 | P0 | frontend | Unconditional pointer capture for any open layer (incl. tooltips) ate all host clicks | fixed |
| REV-004 | P1 | frontend | Host-document layers counted into elevation → empty capture shield + suppressed APP-029 hide | fixed |
| REV-005 | P2 | frontend | No keyboard focus handoff to overlay window for capture layers | fixed |

---

## REV-001 · Cross-realm `instanceof HTMLElement` made overlay layer counting always zero

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P0 |
| **Area** | frontend |
| **Reported by** | user review (弹窗不显示) |
| **Owner** | unassigned |

### Finding

`countOpenLayers` filtered nodes with `node instanceof HTMLElement`. The overlay
portal document belongs to a different window realm (child `BrowserWindow`), so
its nodes are never instances of the host realm's `HTMLElement`. Every elevated
layer counted as 0 → `overlay_bridge_note_activity` never fired → the overlay
window never showed → all portaled dialogs/menus were invisible. The default
`window.getComputedStyle` was also host-realm.

### Evidence

- `apps/web/src/shared/lib/desktop-overlay/layer-count.ts` (pre-fix: `instanceof HTMLElement`, host `window.getComputedStyle`)

### Required fix

Use realm-safe checks: `node.nodeType === 1` and
`el.ownerDocument.defaultView.getComputedStyle(el)`.

### Acceptance

- [x] Unit test counts open layers from a foreign-realm document.

### Fix log

- 2026-08-03 - `layer-count.ts` rewritten realm-safe; regression test "counts layers from a foreign-realm document" in `__tests__/layer-count.test.ts`. Verified via `bun test src/shared/lib/desktop-overlay/`.

---

## REV-002 · `window.open` + `overrideBrowserWindowOptions` transparency unreliable → opaque black overlay

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P0 |
| **Area** | infra |
| **Reported by** | user review (黑屏) |
| **Owner** | unassigned |

### Finding

Per-pixel transparency must be set at `BrowserWindow` construction. Renderer-
initiated windows created through `window.open` + `overrideBrowserWindowOptions`
do not reliably honor `transparent: true` (electron#22281, #2170); post-create
`setBackgroundColor("#00000000")` cannot retrofit it. Whenever the overlay was
shown, the full host content area painted opaque black.

### Evidence

- `apps/desktop-electron/src/overlay/overlay-surface-manager.ts` (pre-fix: transparency via `overrideBrowserWindowOptions` + `setBackgroundColor` reinforcement)

### Required fix

Return a `createWindow` callback from `setWindowOpenHandler` so main constructs
the `BrowserWindow` itself with `transparent: true` (constructor path), keeping
the opener's `window.open` proxy via the passed-through child `webContents`.

### Acceptance

- [x] Overlay window constructed in main with `transparent: true`; registration no longer races `did-create-window`.

### Fix log

- 2026-08-03 - `overlayWindowOpenHandler` now returns `createWindow`; `registerOverlayWindow` is idempotent and public; `webPreferences` stay in `overrideBrowserWindowOptions` (applied to the child webContents before `createWindow`). Verified via `bun run build` + `tsc --noEmit` (overlay files clean); headed desktop dogfood pending.

---

## REV-003 · Unconditional pointer capture for any open layer (incl. tooltips) ate all host clicks

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P0 |
| **Area** | frontend |
| **Reported by** | user review (点击无效) |
| **Owner** | unassigned |

### Finding

`showOverlayWindow` and main's `noteActivity` both forced `capture` whenever any
layer was open. Tooltips open on hover constantly, so the full-window invisible
overlay swallowed every click — buttons that should open menus/dialogs appeared
dead, with hover/hide flicker loops on top.

### Required fix

Classify layers: tooltip/hover-card–only frames stay `pass-through`
(`setIgnoreMouseEvents(true, { forward: true })`); menus/popovers/dialogs use
`capture`. Pointer mode is owned by the web side; main no longer overrides it in
`noteActivity`.

### Acceptance

- [x] `summarizeOpenLayers` classification unit tests (pass-through vs capture).

### Fix log

- 2026-08-03 - `summarizeOpenLayers` added; provider sends `overlay_bridge_set_pointer_mode` on change only; main `noteActivity` no longer forces capture. Verified via `bun test src/shared/lib/desktop-overlay/`.

---

## REV-004 · Host-document layers counted into elevation → empty capture shield + suppressed APP-029 hide

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`recountNow` used `Math.max(overlayCount, hostBodyCount)`. Host-document
floaters (portals outside the `@workspace/ui` context, `[role="dialog"]`
matches) both (a) showed + captured an overlay that contained nothing → click
shield, and (b) inflated `elevatedLayerCount` so `elevationCovers` became true
and the APP-029 hide was suppressed — the host dialog rendered *under* the live
preview.

### Required fix

Count overlay-document layers only. Host-document floaters are exclusively
APP-029's occlusion-hide concern (they can never be covered by elevation).
Preview suspend: host occlusion always suspends; elevatable chrome flags gate on
`elevationHealthy` (capability + surfaceReady + !ensureFailed + portal set, no
layer-count race on open).

### Acceptance

- [x] Policy unit tests: host occlusion always suspends; chrome gated on health.

### Fix log

- 2026-08-03 - Provider counts portal roots only; `elevation-policy.ts` reduced to `computeElevationHealthy` + `shouldSuspendDesktopNativePreview` (dead exports `shouldElevate`/`pointerModeForLayers`/`expandRect`/`rectsIntersect`/`shouldFallbackHideDuringEnsure`/`shouldSuspendFromOcclusion` removed); `Preview.tsx` composition updated. Verified via `bun test src/shared/lib/desktop-overlay/` + `just typecheck` (web ✓).

---

## REV-005 · No keyboard focus handoff to overlay window for capture layers

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The overlay window was always shown with `showInactive()`. Radix keyboard
handlers (Escape, menu arrows/typeahead, dialog inputs) listen on the overlay
document, but OS key events kept going to the host window → Escape and text
input inside elevated dialogs could not work (PRD M10).

### Required fix

Focus the overlay window when pointer mode transitions to `capture` (and on
show while capture); return focus to the host on `release` / pass-through /
destroy. Tooltip-only frames never take focus.

### Acceptance

- [x] Focus moves with capture transitions in `OverlaySurfaceManager`; manual Esc/typeahead matrix pending desktop dogfood.

### Fix log

- 2026-08-03 - `focusOverlayForCapture` / `refocusHost` added to `OverlaySurfaceManager` (`setPointerMode`, `noteActivity` show path, `release`, `destroyOverlayWindow`). Manual desktop verification pending.
