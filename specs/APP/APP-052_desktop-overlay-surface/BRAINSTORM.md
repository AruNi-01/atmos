# Brainstorm · APP-052: Desktop Overlay Surface

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

- **Trigger**: Desktop native preview (`WebContentsView` / child webview) paints above host DOM. APP-029 shipped **geometry-based occlusion → hide native preview** so dialogs/popovers are clickable. It works, but every intersecting popover / dialog / modal **suspends live preview**, which feels broken for a daily browser surface.
- **Who feels it**: Desktop users with right-sidebar (or in-shell) native preview open while using app chrome—toolbars, command UI, dropdowns, dialogs, sheets.
- **Current workaround**: APP-029 `useNativePreviewOcclusion` + `shouldSuspendDesktopPreview` + static React fallback (`apps/web/.../use-native-preview-occlusion.ts`, `Preview.tsx`, lifecycle hide/show). Explicit markers: `data-atmos-native-surface-overlay`, ignore via `data-atmos-ignore-native-surface-occlusion`.
- **Why hard**: Guest content is a **main-process native view**, not a DOM node—CSS `z-index` cannot win. True “float above browser” needs another native layer (or temporary hide). Electron has no first-class “HTML element above WebContentsView” API.
- **Product constraint (user-stated)**: Overlay must be **common / shared** for performance and memory—**not one WebContentsView per popover**. Hide remains a **fallback**, not the default interaction. **Web (browser) must be unaffected**—desktop-only elevation path with clean adaptation.
- **Related prior decision**: APP-029 BRAINSTORM **rejected** “native overlay window” for that scope (cost). This spec **reopens** that product direction because hide-as-primary UX is no longer acceptable; cost is now justified by daily friction.
- **Platform note**: Production desktop is Electron (`apps/desktop-electron`, `PreviewSurfaceManager`). Tauri path is deprecated for product work—design for Electron; do not invest dual-shell parity unless PRD says otherwise.
- **External analogy**: Raycast 2.0 renders popovers/tooltips as **native windows** over a system WebView (not Electron, not “z-index over BrowserView”). The transferable idea is **floating UI on a separate native layer**, not their hybrid stack wholesale.

## Goals (draft)

- **Primary**: Live native preview stays visible while host popovers / dialogs / modals that overlap it remain fully visible and interactive **above** the guest surface.
- **Primary**: **One shared overlay rendering surface per host window** (or stricter: one per app process if proven safe)—multiple concurrent floating UIs share that engine; no per-popover native view spawn.
- **Primary**: **Web browser session unchanged**—same components, no layout thrash, no desktop-only bugs on `app.atmos.land` / pure web.
- **Primary**: Keep APP-029-style **hide + static fallback as safety net** when elevation is unavailable, fails, or intentionally not applied (e.g. tooltips? decide in PRD).
- **Secondary**: Central policy (geometry and/or portal adapter) so feature teams do not hand-register every menu.
- **Secondary**: Memory/CPU bounded—overlay surface cold-start vs warm tradeoff is explicit; idle footprint measurable.
- **Non-goal (draft)**: Pixel-perfect partial clipping of the guest webview under an irregular popover shape (rounded corners can be “good enough” with opaque/backdrop regions).
- **Non-goal (draft)**: Replacing the design system; Radix/shadcn primitives should keep working with an elevation adapter, not a second component library.

## Options

### Option A — Keep hide-only (status quo, APP-029)

Geometry detects intersection → hide `WebContentsView` → React fallback → restore.

**Pros**: Already shipped; simple mental model; no second renderer.  
**Cons**: Live preview dies on every overlapping chrome interaction—current pain.  
**Unknown**: None on feasibility.  
**Role in this spec**: **Fallback only**, not primary.

### Option B — Per-floating-UI native view / window

Each popover or modal gets its own `WebContentsView` or `BrowserWindow`.

**Pros**: Isolation, independent lifetime.  
**Cons**: Memory/process explosion; focus and theme sync nightmare; contradicts user constraint.  
**Verdict lean**: **Reject** as default. At most allow rare exceptions (e.g. detached inspector) outside this feature’s normal path.

### Option C — Singleton Overlay Surface (shared engine) ★ leading direction

**One** long-lived (or lazily created, then reused) native surface **above** the preview `WebContentsView` on the same host window:

- Hosted as a single `WebContentsView` (or one transparent child window) owned by desktop main process.
- Renders a **shared floating-UI document/runtime**—one Chromium instance paints **N** concurrent elevated widgets (stacking order inside that document).
- Main shell detects “must elevate” (intersection with native preview and/or explicit portal policy) and **projects** floating UI into the overlay runtime instead of (or in addition to) host DOM.
- Preview stays live underneath; overlay bounds can track window chrome / full content area as needed.
- On failure / unsupported / non-elevated cases → fall back to Option A hide path.

**Pros**: Matches “one engine, many UIs”; live preview; aligns with Electron multi-view model already used by `PreviewSurfaceManager`; Raycast-like layering without leaving Electron.  
**Cons**: Cross-WebContents focus, pointer, a11y, and style/theme sync are real work; portal/elevation design must not break web; implementation complexity high vs APP-029.  
**Unknown**: Exact content model (full React twin vs thin floating shell); warm vs cold start; whether full-window dimmed modals need live preview visible through backdrop.

### Option D — Transparent always-on-top child `BrowserWindow` as the shared overlay root

Same “singleton shared engine” as C, but surface is a **child window** parented to the host instead of a sibling `WebContentsView`.

**Pros**: Can extend slightly past host bounds (Raycast-like); OS stacking is straightforward.  
**Cons**: Multi-monitor / full-screen / focus-steal edge cases; window chrome sync harder; two window objects to keep aligned on move/resize/maximize.  
**Unknown**: Whether Atmos needs out-of-bounds popovers enough to pay this tax.

### Option E — Layout-only / chrome-outside-preview (no second surface)

Force all menus to open only in regions that never intersect native preview bounds.

**Pros**: Zero native work.  
**Cons**: Cannot cover real product cases (center dialogs, command palette, sheets, drag overlays); not a complete product answer.  
**Role**: **Complementary hygiene** for toolbar menus that *can* open downward into chrome—not a substitute for overlay surface.

### Option F — Guest becomes iframe so DOM stacking works

Abandon native embed for stacking convenience.

**Pros**: z-index works.  
**Cons**: Cross-origin / cookie / process isolation regressions; fights APP-010/011 preview direction.  
**Verdict lean**: **Out of scope / reject** for this problem.

## Framing summary

| Framing | Shape |
|--------|--------|
| **Minimal** | Elevate only full-screen-ish dialogs/sheets that already feel “modal”; leave small popovers on hide path. Shared surface still singleton. |
| **Generous** | All intersecting portaled overlays (popover, dropdown, dialog, sheet, command UI) elevate automatically; live preview always; warm overlay process; theme/focus parity. |
| **Sideways** | Shrink preview `setBounds` around floating rects (hole punching) without second renderer—partial hide, not full hide. Still thrashy; hard with rounded shadows; keep as research note, not primary. |

## Key forks in the road

- **Fork 1 — Primary elevation vehicle**: Sibling **`WebContentsView` overlay** (Option C) vs **child `BrowserWindow`** (Option D). Decide in TECH; product only cares “one shared surface above preview.”
- **Fork 2 — Content model for the shared engine**:
  - **(2a)** Overlay loads a **dedicated floating-UI shell** (thin React entry) and receives render instructions / component payloads over IPC.
  - **(2b)** Overlay loads the **same app origin** with a special entry/route and mounts elevated portals there (style parity easier; heavier).
  - **(2c)** “DOM projection” / remote render of existing nodes (research-heavy; avoid unless proven).
  Decide in TECH; PRD should require visual parity and single-engine reuse, not a specific IPC schema.
- **Fork 3 — Elevation trigger**: Pure **geometry** (APP-029 candidates) vs **portal adapter** (components always portal to overlay root when desktop overlay is available) vs hybrid (portal when intersecting only). Decide in PRD (UX + web safety) / TECH (hooks).
- **Fork 4 — What still uses hide fallback**: Unsupported markers, tooltips, transitions, overlay crash, surface not ready, non-desktop. Decide in PRD.
- **Fork 5 — Lifetime**: Always warm at desktop launch vs create-on-first-elevation vs retain-after-use with idle teardown. Decide in TECH with memory budgets.
- **Fork 6 — Scope of host windows**: Main product window only vs also standalone browser / detached preview hosts. Decide in PRD.
- **Fork 7 — Relation to APP-029**: Supersede “hide as primary product behavior” while **keeping** occlusion detection + hide as fallback; do not delete APP-029 code until overlay path is proven. Decide in PRD.

## Open questions

- [ ] **Q1**: Must a semi-transparent modal backdrop keep the **live** preview visible behind the dimmer, or is elevating only the dialog chrome enough? *(PRD)*
- [ ] **Q2**: Should **tooltips** elevate, stay host-DOM (may clip under preview), or continue to be ignored (APP-029 currently ignores tooltips)? *(PRD)*
- [ ] **Q3**: Acceptable idle memory for a warm overlay surface (order-of-magnitude only)? *(PRD / TECH)*
- [ ] **Q4**: Is automatic elevation required for **all** current APP-029 selectors, or can v1 start with dialog/sheet/modal + opt-in popovers? *(PRD)*
- [ ] **Q5**: Focus trap / Esc / Tab: single focus domain across host + overlay WebContents—must feel like one window. What a11y bar? *(PRD / TECH)*
- [ ] **Q6**: Theme, density, and CSS variables: overlay document must match host without shipping a second design system. Preferred approach? *(TECH)*
- [ ] **Q7**: Pointer events outside elevated UI but over live preview: click-through to guest vs block? (modal vs non-modal). *(PRD)*
- [ ] **Q8**: Multiple concurrent elevated layers (dropdown open over dialog)—all in one surface’s stacking context? *(TECH—almost certainly yes under shared engine)*
- [ ] **Q9**: Standalone native browser window (if any) needs the same overlay manager attachment? *(PRD)*
- [ ] **Q10**: Web adapter surface—feature flag, runtime capability (`desktop.overlaySurface`), or compile-time shell only? *(TECH)*

## Constraints to carry into PRD / TECH

1. **Shared engine**: max **one** overlay native content surface per host window for floating UI (unless TECH documents a rare escape hatch).
2. **No web regression**: pure web path keeps current portals to `document.body` (or existing roots); no second process, no IPC, no hide-of-preview (preview is iframe or none).
3. **Hide is backup**: APP-029 path remains for non-elevated occlusion and failure modes; default happy path should not flash-hide preview on routine popover open.
4. **Reuse existing desktop surface ownership**: extend `PreviewSurfaceManager` / desktop IPC patterns rather than inventing a parallel embed system where possible.
5. **Do not enumerate every feature forever**: central policy (geometry + shared overlay markers) beats per-feature hide lists; elevation should be as automatic as APP-029 detection was.
6. **Performance**: prefer reuse + show/hide/bounds of the singleton surface over create/destroy; avoid full app reload per open.

## References

- Specs: `APP-029_native-preview-occlusion` (hide + fallback shipped; native overlay rejected then)
- Specs: `APP-010_preview-element-select`, `APP-011_preview-cross-origin-extend`, `APP-045_desktop-electron-dual-shell`
- Code: `apps/web/src/features/run-preview/hooks/use-native-preview-occlusion.ts`
- Code: `apps/web/src/features/run-preview/components/Preview.tsx` (`shouldSuspendDesktopPreview`)
- Code: `apps/web/src/features/run-preview/hooks/use-preview-lifecycle-effects.ts`
- Code: `apps/desktop-electron/src/preview/surface-manager.ts` (`WebContentsView`, `addChildView`, `setVisible`)
- Electron: Web Embeds / `WebContentsView` / View stacking (`addChildView` order)
- Raycast: [A Technical Deep Dive Into the New Raycast](https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast) — native windows for popovers/tooltips over WebView UI
- Community: multi-view browser patterns (e.g. shared top BrowserView/WebContentsView for chrome that must stack above content)

## Ready to promote

- **Promote to PRD**:
  - Problem statement: hide-on-occlusion is correct emergency behavior but unacceptable as default for overlapping chrome.
  - Must-have: live preview + interactive elevated host UI via **shared** overlay surface; web unaffected; hide as fallback.
  - Must-have: no per-popover native view.
  - Scope: which overlay classes in v1 (dialog/modal/sheet vs all popovers).
  - Success metrics qualitative: no full-preview suspend on routine dropdown over preview; web unchanged.
  - Non-goals: iframe guest, per-widget processes, pixel-perfect hole punch.
  - Explicit relationship: supersedes APP-029 **product priority** (hide no longer primary), retains APP-029 **machinery** as fallback.

- **Promote to TECH**:
  - Singleton overlay attachment on host `BrowserWindow` / `contentView` above preview view.
  - Elevation policy + web capability gating.
  - Content model for shared floating runtime (2a/2b).
  - Focus, input, theme sync, bounds on resize/DPI.
  - Lifecycle warm/cold and failure → hide fallback.
  - IPC / bridge shape next to existing `preview_bridge_*` (new overlay bridge vs extend).
  - Migration plan from pure APP-029 path without breaking desktop preview.

- **Do not invent in brainstorm**: concrete IPC payloads, route names, component file layouts (those belong in TECH after PRD scope lock).
