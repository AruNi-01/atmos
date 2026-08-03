# PRD · APP-052: Desktop Overlay Surface

> Product Requirements · WHAT and WHY. Ship a **shared** desktop floating layer so host popovers, tooltips, dialogs, and modals paint **above** native preview without suspending live preview on every open; keep APP-029 hide as fallback; leave pure web unchanged.

## Context

- **Problem**: On Atmos desktop, native run/browser preview is a main-process view (`WebContentsView`). Host DOM cannot stack above it. APP-029 fixed clickability by **hiding** the native preview whenever app overlays intersect it. That is correct as emergency behavior but **wrong as the default**: opening a menu, tooltip, dialog, or modal over preview freezes or blanks the live page and feels broken for a surface people use continuously.
- **Why now**: Preview is a first-class desktop surface; overlay traffic is constant (toolbar menus, command UI, settings dialogs, hover tips). Hide-on-occlusion scales poorly and trains users that “preview disappears when I use the app.” A shared elevation layer is the product answer already used by mature desktop shells (separate native layer for floating UI), without one native view per widget.
- **Related specs**:
  - **`APP-029_native-preview-occlusion`** — ships hide + static fallback. This PRD **supersedes hide as the primary product behavior** when elevation is available; **retains** hide + fallback as safety net.
  - **`APP-010` / `APP-011`** — native preview / cross-origin embed remains required; do not regress to iframe-only stacking.
  - **`APP-045_desktop-electron-dual-shell`** — production desktop work targets **Electron** (`apps/desktop-electron`). Tauri is not a product delivery target for this feature.
- **Settled product choices** (from BRAINSTORM + owner decisions):
  1. **All** floating overlay classes elevate (not dialog-only).
  2. **Tooltips elevate** (APP-029’s “ignore tooltips” is replaced for the happy path).
  3. Modal / dimmed UI chooses **best live experience**: keep preview **live** under elevated chrome and backdrop where possible.
  4. **Every host window** that can own native preview (main workbench **and** standalone browser / detached preview hosts) gets the same overlay behavior.
  5. Overlay engine is **lazy-created**, then **cleaned up when idle** so it does not permanently hold memory.

## Goals

1. **Primary** — Users can open any host floating UI over native preview and still see a **live** preview underneath (or beside) that UI, with the floating UI fully visible and interactive on top.
2. **Primary** — Elevation uses **one shared overlay rendering engine per host window**, not one native surface per popover/tooltip/dialog.
3. **Primary** — **Web browser** (`app.atmos.land` / non-desktop shell) behavior and performance are **unchanged**; no second process, no hide of iframe preview for this reason, no desktop-only visual regressions on web.
4. **Primary** — When elevation is unavailable or fails, **APP-029-style hide + static fallback** still keeps overlays usable (no permanently unclickable chrome).
5. **Secondary** — Feature teams do not maintain a growing list of “hide preview when my menu opens”; elevation is policy-driven / automatic for known overlay roles.
6. **Secondary** — Idle desktop sessions do not permanently pay for an unused overlay renderer (lazy + cleanup).

## Users & Scenarios

- **Primary persona**: Desktop user with embedded native preview open (sidebar or in-shell browser) while using Atmos chrome.
- **Secondary persona**: Desktop user in a **standalone browser / detached preview** window that still hosts a native guest surface and app chrome.
- **Non-persona for this change**: Pure web users (must feel zero difference).

### Key scenarios

1. User opens a **toolbar dropdown or select** that extends over the preview; menu is fully visible and clickable; preview **keeps rendering** behind/around it.
2. User hovers a control near the preview and a **tooltip** appears over the guest page; tooltip is readable and not buried under the native view; preview stays live.
3. User opens a **centered dialog or command-style modal** with a dimming backdrop over the workbench including preview; dialog and backdrop sit above the guest; **preview continues live under the dimmer** so context is not “preview died.”
4. User opens a **sheet / drawer** that covers part of the preview; elevated UI wins stacking; live preview remains where not covered by opaque chrome.
5. User works in a **standalone browser window** with the same class of overlays; behavior matches the main window.
6. Overlay engine was torn down after idle; user opens a popover again; first open may take a brief create cost, then works; no permanent second browser left running after idle cleanup.
7. Elevation cannot run (capability missing, crash, mid-create); intersecting overlays still become usable via **hide + fallback**, then restore when clear.

## User Stories

- As a desktop user, I want menus and dialogs to appear **on top of** the embedded browser without blanking it, so that preview remains a living part of the workbench.
- As a desktop user, I want **tooltips** near preview to remain readable, so that chrome affordances stay trustworthy over the guest page.
- As a desktop user, I want modals to dim the UI **without killing** the live page behind them, so that I keep spatial context of what I was looking at.
- As a desktop user in a **detached browser** window, I want the same stacking rules, so that floating UI is not a main-window-only special case.
- As a web user, I want popovers and dialogs to behave exactly as today, so that desktop stacking work never taxes the browser product.
- As a product engineer, I want floating primitives to participate automatically (or via a stable overlay role), so that I do not re-implement preview hide for every new menu.

## Functional Requirements

### Must Have

- **M1 — Shared overlay engine**: For each desktop **host window** that can embed native preview, floating host UI that must stack above the guest uses **at most one** shared native overlay content surface for that window. Multiple concurrent floating UIs (e.g. dialog + nested menu + tooltip) share that engine’s stacking context. **Must not** spawn one native view/window per floating widget as the normal path.

- **M2 — Full floating class coverage**: The following host UI roles **must** be elevatable above native preview when they would otherwise be covered (or when product policy always elevates them on desktop with overlay capability—TECH may choose the trigger; product requires **all** of these classes to win stacking when they appear over native preview):
  - Dialog / modal (including modal backdrop / overlay)
  - Sheet / drawer
  - Popover
  - Dropdown menu / context menu / select content
  - **Tooltip / hover card** (explicitly included; APP-029’s tooltip exclusion does not apply to the happy path)
  - Other app overlays already treated as APP-029 candidates (e.g. marked native-surface overlays), plus an explicit opt-in role for future custom floating UI

- **M3 — Live preview is the happy path**: Opening any elevated floating UI **must not**, by default, suspend/hide the native preview solely because of that UI. Live guest content continues under or beside elevated chrome.

- **M4 — Best-experience modals**: For modal / dimmed presentations:
  - Elevated **backdrop and dialog content** stack above the native guest.
  - Native preview **remains live** under translucent/dimmed regions wherever the design uses a dimmer (user keeps context; no static “preview paused” placeholder as the default modal experience).
  - While a **modal** is open, the user must not interact with the guest page as if the modal were absent (preview is visible but not the active interaction target for modal semantics).
  - Non-modal floating UI (menus, tooltips, non-modal popovers) must not leave the workbench feeling “stuck”; dismiss and outside-click behavior must match existing product expectations as closely as possible once elevated.

- **M5 — All relevant host windows**: Overlay behavior applies to:
  - Main Atmos workbench window with embedded native preview
  - **Standalone browser / detached preview** (and any other product window that hosts native preview + host chrome overlays)
  Behavior and lifecycle rules are the same family; no “main window only” ship.

- **M6 — Lazy create + idle cleanup**:
  - Do **not** create the shared overlay engine at app launch solely to sit idle.
  - Create on **first need** to elevate in that host window.
  - After a defined idle period with **no** elevated floating UI, **tear down** the engine for that host window so memory is reclaimed.
  - Subsequent elevation recreates lazily. Brief first-open cost after cleanup is acceptable; permanent idle residency is not.

- **M7 — Hide fallback (APP-029 retained)**: If elevation is not available yet (cold create in progress beyond a UX budget), fails, or is unsupported for a given case, intersecting overlays must still be usable via **hide native preview + static React fallback + automatic restore**, without requiring per-feature hide lists. Fallback must not be the steady-state path when elevation is healthy.

- **M8 — Web non-impact**: In pure web / non-desktop-native-preview sessions:
  - No overlay native engine
  - No change to portal roots or stacking for normal document UI
  - No new mandatory desktop-only user-visible states
  Desktop adaptation is capability-gated; shared components remain one codebase.

- **M9 — Automatic / centralized participation**: Elevation must not depend on each feature hand-wiring “hide preview.” Prefer the same class of **role markers / portal policy / geometry** already used for occlusion so new dialogs and menus participate by construction. Explicit opt-in remains available for custom floating UI.

- **M10 — Focus and keyboard feel like one window**: Elevated UI must support expected keyboard paths (Esc to dismiss, Tab within dialogs, typeahead in menus) without trapping the user in a dead focus island or requiring a click “back into” the app with no visible focus. Exact a11y machinery is TECH; product bar is **parity with today’s non-preview-overlapping overlays**.

- **M11 — Visual parity**: Elevated floating UI must use the same design language (theme, density, typography, motion) as host chrome—not a second unstyled system. Users should not perceive “a different app’s menus.”

- **M12 — No success toasts**: Elevation, fallback hide, create, and cleanup are silent. Errors surface only if the user would otherwise be stuck (existing error patterns).

### Nice to Have

- **N1**: Soften first elevation after idle teardown (prewarm on hover of known triggers, or after first desktop preview attach) without defeating idle cleanup.
- **N2**: Partial geometry: when only a small corner of a menu intersects preview, still elevate only when needed (if cheaper than always-on elevation for that open).
- **N3**: Telemetry (local/debug only is fine) for elevation vs fallback rate and overlay engine create/destroy counts—to catch regressions that silently fall back to hide.
- **N4**: Out-of-window-bounds floating (Raycast-style) if the chosen native vehicle allows it without extra product scope.

## Out of Scope

- **One native surface per floating widget** as the normal architecture.
- **Replacing native preview with iframe** solely to regain CSS stacking.
- **Pixel-perfect hole-punch / irregular clipping** of the guest under rounded shadows (opaque/backdrop regions and full elevated layers are enough).
- **True live bitmap snapshot** of the guest as the primary modal backdrop (live view under dimmer is the goal; snapshot is not required).
- **Mobile** overlay elevation.
- **Tauri product parity** for this feature (Electron is the desktop target).
- **Redesigning the component library** or replacing Radix/shadcn with native OS menus for all chrome.
- **Changing guest-page content** or preview navigation semantics.
- **Always-on overlay engine from process start** with no idle teardown.

## Success Metrics

- **Leading (qualitative / dogfood)**: Opening toolbar menus, tooltips, dialogs, and sheets over native preview no longer blanks or freezes the live guest as the normal experience.
- **Leading**: Fallback hide rate is rare in healthy desktop sessions (most overlapping floating UI uses elevation). Target directionally: fallback is for failure/cold edge, not every popover.
- **Leading**: After idle, overlay engine is destroyed; process tools do not show a permanent extra content process solely for an unused overlay.
- **Lagging**: No increase in “can’t click menu over preview” reports; no web-only stacking/regression bugs attributed to this work.
- **Qualitative**: Modal over preview still shows a living page under the dimmer; tooltips over preview are readable.
- **Hard gate**: Pure web smoke of the same floating primitives shows no behavioral change.

## Resolved BRAINSTORM forks (product)

| Fork | Resolution |
|------|------------|
| Overlay class scope | **All** floating roles in M2, including **tooltips**. |
| Tooltip policy | **Elevate** on happy path (not ignore, not hide-only). |
| Modal + live preview | **Live guest under dimmer**; modal blocks interaction with guest; no default “preview paused” for healthy elevation. |
| Host windows | **Main + standalone/detached browser hosts** (all native-preview hosts). |
| Lifetime | **Lazy create** on first need; **idle cleanup** to free memory; recreate later as needed. |
| Hide path | **Fallback only** when elevation unavailable/fails; APP-029 machinery retained. |
| Shared engine | **One per host window** for floating UI; multi-widget stacking inside it. |
| Web | **Unaffected**; capability-gated desktop path only. |
| Vehicle (WebContentsView vs child window) | **Deferred to TECH** (product-neutral). |
| Content model / IPC | **Deferred to TECH** (must meet M1, M10, M11). |
| Exact idle timeout / create budget | **Deferred to TECH** (must meet M6 spirit). |

## Risks & Open Questions

- **Risk**: First open after cleanup feels slow if create is heavy—mitigate with acceptable create budget and optional N1 prewarm; never keep a permanent idle process as the only fix.
- **Risk**: Focus/a11y across two content surfaces feels “almost native but wrong”—M10 is a ship gate; if elevation cannot meet it for a class, that class may temporarily use fallback rather than ship broken focus.
- **Risk**: Over-elevating (always portaling every tooltip) costs more than geometry-only—product still requires tooltips to win stacking over native preview; TECH may elevate only when needed as long as M2/M3 hold.
- **Risk**: Silent permanent fallback to hide would reintroduce the original pain—N3 / dogfood should catch “elevation never actually runs.”
- **Open (TECH)**: Idle teardown duration; cold-create UX budget before hide fallback; pointer-event routing details for non-modal outside clicks; theme sync mechanism.

## Milestones

- **Phase 1 — Contract + shell**: Shared overlay capability on all native-preview host windows; lazy create + idle destroy; hide fallback still correct.
- **Phase 2 — Elevate core chrome**: Dialogs, modals (with live under dimmer), sheets/drawers, menus/popovers/selects over preview without suspend.
- **Phase 3 — Tooltips + parity**: Tooltips/hover cards elevated; keyboard/focus parity bar (M10); standalone browser hosts verified.
- **Phase 4 — Harden**: Fallback only on real failure; idle memory validation; optional prewarm/telemetry (N1/N3).

## Relationship to APP-029

| | APP-029 | APP-052 |
|--|---------|---------|
| Primary product behavior | Hide guest when overlays intersect | Elevate floating UI above guest |
| Live preview during overlays | No (suspended) | Yes (happy path) |
| Tooltips | Ignored by occlusion | Elevate |
| Shared overlay engine | Explicitly out of scope | Required (M1) |
| Hide + static fallback | Required | Required as **fallback** (M7) |

APP-029 remains the safety net and regression baseline until APP-052 elevation is proven; it is no longer the desired steady-state UX.
