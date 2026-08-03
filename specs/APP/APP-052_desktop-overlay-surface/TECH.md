# TECH · APP-052: Desktop Overlay Surface

> Technical Design · HOW. Implements PRD APP-052: Desktop Overlay Surface.  
> Addresses **M1–M12**. Nice-to-haves **N1–N3** noted as optional follow-ups; **N4** only if free with the chosen vehicle.

## Scope summary

Desktop-only (Electron production shell): introduce a **singleton floating overlay surface per host `BrowserWindow`**, elevate host floating UI (dialogs, sheets, menus, popovers, tooltips, …) so it paints **above** native preview `WebContentsView`s while preview stays **live**, and keep APP-029 **hide + static fallback** when elevation is not ready or fails. Pure web is a no-op.

**Out of this TECH**: Rust/api/WS changes, mobile, Tauri parity, per-widget native surfaces, iframe guest stacking, pixel hole-punch.

**Layers touched**:

```
packages/ui          — portal container from React context (default document)
apps/web             — elevation policy, capability gate, APP-029 integration
apps/desktop-electron — OverlaySurfaceManager, IPC, window open handler, lifecycle
```

No `apps/api` / `crates/*` / WebSocket protocol work.

---

## Architecture overview

### Stacking problem (status quo)

```
BrowserWindow
└── contentView
    ├── host shell WebContents          ← React chrome, Radix portals (bottom)
    └── preview WebContentsView(s)      ← native guest (above host DOM)
```

Host `z-index` cannot win. APP-029 hides preview so host portals are clickable.

### Target stacking (happy path)

```
BrowserWindow (host)
├── contentView
│   ├── host shell WebContents
│   └── preview WebContentsView(s)      ← stays visible + live
└── Overlay surface (singleton, lazy)   ← elevated floating UI only
    └── same-origin document
        └── #atmos-overlay-root
            └── createPortal(host React trees)  ← dialogs, menus, tooltips, …
```

### End-to-end flow

```
[packages/ui Portal] ──container?──► FloatingElevationContext (apps/web)
         │                                    │
         │ document.body (web / no elevate)   │ ensure overlay + portal target
         ▼                                    ▼
   host document                    OverlaySurfaceManager (main)
                                    create/show singleton surface
                                    bounds + pointer policy
         │                                    │
         └──── createPortal(node, overlayDoc.#root) ──┘
                          │
                          ▼
              preview stays live underneath
              APP-029 hide only if elevation inactive for occluding layers
```

### Decisions (TECH locks)

| Topic | Decision | Why |
|-------|----------|-----|
| **Vehicle** | **Transparent parented child `BrowserWindow`** (one per host), not a third `WebContentsView` | Child window always stacks above parent content **including** all `WebContentsView`s; host can obtain a same-origin `Window` / `document` for **`createPortal`**, so arbitrary React children keep working without a second component registry or IPC-serialized trees. |
| **Content model** | **Host React tree + `createPortal` into overlay document** | M11 visual/state parity; one reconciler; no dual app boot for every dialog. Overlay document is a thin same-origin shell (CSS + empty root), not a second product app. |
| **Shared engine** | Exactly **one** overlay window per host `BrowserWindow` | M1; N concurrent layers share one document stacking context. |
| **Elevation trigger** | **Hybrid** (see Policy) | Modal/sheet always elevate when any native preview is attached on that host; lightweight floaters elevate on **geometry intersection** (and tooltips included). No elevate when no native preview → zero cost. |
| **Lifetime** | **Lazy create** on first ensure; **idle destroy** after quiet period | M6. |
| **Fallback** | APP-029 path when elevation not active for an occluding layer | M7. |
| **Web** | Capability false → context returns `null` container → existing portals | M8. |

**Rejected alternatives** (short):

- **Per-popover WebContentsView** — violates M1/memory.
- **Overlay `WebContentsView` + IPC remount of UI** — forces serializable props / component registry; poor fit for Atmos dialogs with rich children.
- **Always-warm overlay from app start** — violates M6.
- **Iframe guest** — out of scope; fights APP-010/011.

---

## Module-by-module design

### `apps/desktop-electron` — OverlaySurfaceManager

**New module** (suggested path):

- `apps/desktop-electron/src/overlay/overlay-surface-manager.ts`
- `apps/desktop-electron/src/overlay/types.ts`
- `apps/desktop-electron/src/overlay/constants.ts`

**Wire into** `AppState` (alongside `preview: PreviewSurfaceManager`):

```ts
// app-state.ts (conceptual)
overlay: OverlaySurfaceManager | null;
```

**Responsibilities**:

| Method | Behavior |
|--------|----------|
| `ensure(host, reason)` | If no surface for `host`: create transparent parented `BrowserWindow`, load overlay URL, wait ready (or timeout). Show if hidden. Cancel idle timer. Return `{ ready: boolean }`. |
| `setPointerMode(host, mode)` | `pass-through` \| `capture` (see Pointer policy). |
| `setBoundsToHost(host)` | Match host **content** bounds (x/y/w/h in screen space); re-run on host `resize` / `move` / display change. |
| `noteActivity(host)` | Reset idle timer while layers elevated. |
| `scheduleIdleDestroy(host)` | After `OVERLAY_IDLE_MS` with no elevated activity → destroy surface, free memory. |
| `destroy(host)` / `destroyAll()` | Tear down on host `closed` and app quit. |

**Window options** (normative intent):

- `parent: host`
- `frame: false`, `transparent: true`, `hasShadow: false`
- `resizable: false`, `maximizable: false`, `fullscreenable: false`
- `skipTaskbar: true`
- `show: false` until ready
- `webPreferences`: `sandbox` consistent with shell; **same partition/session as host shell** so same-origin assets resolve; preload **narrow** (`overlay-preload`) — only overlay bridge, not full desktop invoke if avoidable
- Do **not** use `alwaysOnTop` relative to other apps; parenting is enough for in-app stacking

**Load URL**:

- Dev: same origin as shell (`http://localhost:…/desktop-overlay` or query `?atmos_desktop_overlay=1`)
- Prod desktop export: sibling static entry or hash route that ships with `BUILD_TARGET=desktop`
- Document body: transparent background; single `#atmos-overlay-root`; import **shared CSS tokens** (same pipeline as shell) so portaled nodes look correct before host injects extra sheets

**Ready protocol**:

1. Overlay renderer fires `overlay_bridge_ready` (via preload → main → host event, or `ipcRenderer` to main then `webContents.send` to host).
2. Host `FloatingElevationProvider` resolves `ensure()` promise only after ready **or** after `OVERLAY_CREATE_BUDGET_MS` (then elevation fails open → fallback hide).

**Host association**:

- Key surfaces by `host.id` (Electron window id).
- `preview_bridge_*` already resolves invoking window via `hostWindowFromArgs` — overlay commands use the same pattern so **standalone browser windows** get their own singleton (M5).

**Stacking vs preview**:

- No change to `PreviewSurfaceManager` z-order required: child overlay window paints above parent’s entire surface, including preview views.
- When overlay is destroyed, preview behavior unchanged.

### `apps/desktop-electron` — IPC / bridge commands

Extend desktop invoke map in `apps/desktop-electron/src/ipc/handlers.ts` (names stable, snake_case like preview):

| Command | Args | Result |
|---------|------|--------|
| `overlay_bridge_ensure` | `{ host hint via invoke event }` | `{ ok: true, windowId, ready: boolean }` or error |
| `overlay_bridge_set_pointer_mode` | `{ mode: "pass-through" \| "capture" }` | `null` |
| `overlay_bridge_note_activity` | `{}` | `null` |
| `overlay_bridge_release` | `{}` | `null` — host reports zero elevated layers; start idle timer |
| `overlay_bridge_destroy` | `{}` | `null` — force teardown (tests / host closed) |

**Events** (host listen via existing `desktopListen` / `atmos:desktop-event:*` pattern):

| Event | Payload |
|-------|---------|
| `desktop-overlay:ready` | `{ windowId }` |
| `desktop-overlay:destroyed` | `{ windowId }` |
| `desktop-overlay:outside-pointer` | `{ x, y, button }` — when pass-through mode and main detects interaction that should dismiss non-modal UI (optional if CSS hit-testing is enough) |

**Capability discovery** (M8):

- Extend existing desktop capability / config probe (whatever shell already exposes to web, e.g. get API config or a small `desktop_get_capabilities`) with `overlaySurface: true` on Electron when manager is registered.
- Web: `detectDesktopShell() === "electron"` **and** `overlaySurface` → enable provider. Tauri / none → off.

Do **not** add REST or Atmos Server WS messages.

### Portal bootstrap (host ↔ overlay document)

**Chosen pattern: controlled `window.open` + `createPortal`**

1. Host `FloatingElevationProvider` calls `overlay_bridge_ensure`.
2. Host opens (once per generation):  
   `window.open(overlayUrl, OVERLAY_WINDOW_NAME, features)`  
   where `OVERLAY_WINDOW_NAME` is stable per host (e.g. `atmos-overlay-${hostId}`) so reuse hits the same surface.
3. Main `setWindowOpenHandler` on **each host** webContents:
   - If URL matches overlay entry → create/reuse that host’s overlay `BrowserWindow` with options above; load URL; return `{ action: "allow", overrideBrowserWindowOptions: … }` **or** equivalent attach path that still yields a usable `Window` proxy to the opener.
   - Implementation note: if a pure `WebContentsView` path is later proven to expose a portalable `document` without a child window, manager may switch vehicle **without** changing the web portal API. **v1 vehicle remains child `BrowserWindow`.**
4. Host waits for `load` + `#atmos-overlay-root`.
5. Host sets context value `portalContainer = overlayWindow.document.getElementById("atmos-overlay-root")`.
6. Style parity: on ensure, **mirror critical theme state** onto `overlayWindow.document.documentElement` (`class` light/dark, `data-theme`, CSS variables used by `@workspace/ui`). Prefer copying `document.documentElement.className` + relevant attributes; optional: clone adopted style sheets / link tags if overlay entry does not already include the full CSS bundle.
7. On idle destroy: `overlayWindow.close()` / main destroy; host nulls container and generation counter so next ensure re-opens cleanly.

**Invariant**: Elevated nodes are still **owned by the host React tree** (state, hooks, queries). Only the DOM mount point moves.

### `packages/ui` — portal container hookup

Today portals hardcode default (e.g. `PopoverPrimitive.Portal` without container; `DialogPortal` wraps Radix portal).

**Change** (minimal, web-safe):

1. Add optional React context in UI package **or** accept container only from a thin app-level wrapper — prefer **app-owned context** in `apps/web` to avoid forcing every UI consumer to know desktop:

   **Recommended**: keep primitives dumb; pass container via existing Radix props where available:

   - `PopoverPrimitive.Portal container={…}`
   - `DropdownMenu.Portal container={…}`
   - `Dialog.Portal container={…}`
   - Tooltip / HoverCard / Select / ContextMenu / Sheet / Drawer equivalents

2. Implement a tiny helper used inside each primitive:

```ts
// packages/ui — conceptual
function usePortalContainerProp(explicit?: HTMLElement | null) {
  const fromCtx = React.useContext(PortalContainerContext); // default null
  return explicit ?? fromCtx ?? undefined; // undefined → Radix default (document.body)
}
```

3. `PortalContainerContext` default `null`. **Web apps that never set the provider behave exactly as today (M8).**

4. `apps/web` provides the provider only under desktop elevation.

Touch all floating primitives that use portals and match APP-029 / M2 markers:

- dialog (+ overlay)
- sheet / drawer
- popover
- dropdown-menu / context-menu / select
- tooltip / hover-card
- any `data-atmos-native-surface-overlay` custom surfaces that portal

### `apps/web` — FloatingElevationProvider + policy

**Suggested paths**:

- `apps/web/src/shared/lib/desktop-overlay/`
  - `floating-elevation-provider.tsx`
  - `elevation-policy.ts`
  - `use-elevated-portal-container.ts`
  - `constants.ts`
- Mount provider near existing desktop/app shell providers (e.g. app layout / desktop-only tree), **not** inside preview only — standalone browser windows load the same shell.

#### Capability gate

```ts
// conceptual
const enabled =
  isDesktopRuntime() &&
  desktopCapabilities?.overlaySurface === true;
```

When `!enabled`, provider is pass-through: context container `null`, no IPC.

#### Elevation policy (M2, M3, M9)

| Role | When to elevate (desktop + capability + native preview present on host) |
|------|------------------------------------------------------------------------|
| Dialog / modal / sheet / drawer / `aria-modal` | **Always** while open (covers large regions; live dimmer over preview). |
| Popover / dropdown / context / select / custom marker | Elevate when open **and** geometry intersects any **visible** native preview surface rect on this window (reuse APP-029 rect sources). |
| Tooltip / hover-card | Same as popover (**included**; APP-029 ignore list **removed** for happy path). |
| No native preview attached / visible | **Do not** ensure overlay; use host document. |

**Geometry**: Reuse selectors and visibility helpers from `use-native-preview-occlusion.ts` (extract pure functions to a shared module if needed, e.g. `native-overlay-candidates.ts`) so APP-029 and elevation share one candidate definition.

**Layer registry** (host-side):

- Ref-count elevated roots (`layerId` per open floating root).
- `count > 0` → `overlay_bridge_note_activity` / keep surface alive; pointer mode from policy.
- `count === 0` → `overlay_bridge_release` → idle timer.

#### Portal container selection

```ts
// conceptual
const container =
  enabled && shouldElevateCurrentTree
    ? overlayPortalRoot   // HTMLElement in overlay document
    : null;               // Radix → document.body
```

`shouldElevateCurrentTree` is determined by policy when each floating root opens (modal → true if preview present; non-modal → intersection observation).

#### Pointer policy (M4)

| Mode | When | Behavior |
|------|------|----------|
| **`capture`** | Any elevated **modal** (dialog overlay, sheet that blocks, `aria-modal=true`) | Overlay window receives mouse events. Full host content bounds. Backdrop dims live preview; guest does not receive clicks. |
| **`pass-through`** | Only non-modal layers (menus, tooltips, non-modal popovers) | Prefer **tight bounds** around union of elevated layer rects (+ shadow padding, e.g. 16px) so clicks outside the overlay window hit host/preview. Host still owns dismiss-on-outside via Radix; if click lands on preview, forward dismiss: listen `desktop-overlay:outside-pointer` **or** preview webContents mouse-down → host closes elevated non-modals. |

Tight bounds update on scroll/resize/animation frames while open (throttle rAF).

Modal **must not** use pass-through (guest would be clickable under dimmer).

#### Focus / keyboard (M10)

- When elevating modals/menus, focus moves into overlay window with the portaled content (normal for child window).
- On close: return focus to host trigger (Radix `onCloseAutoFocus`); ensure host `webContents.focus()` if focus was left on destroyed overlay.
- Esc: handled by Radix in the tree (runs in host JS even if DOM is in overlay document) — verify event targeting; if overlay window steals key events, overlay preload forwards keydown to host or rely on child window focus containing the focused node (same React handlers on the fiber tree).
- Ship gate: manual matrix Esc / Tab / typeahead for dialog + menu + tooltip.

#### APP-029 integration (M7)

File: `apps/web/src/features/run-preview/hooks/use-native-preview-occlusion.ts` + `Preview.tsx` `shouldSuspendDesktopPreview`.

**New rule**:

```
isOccluded = geometry says overlapping candidates exist
elevationCovers = every intersecting candidate is currently elevated
  (or elevation mode is healthy and policy would elevate them)

shouldSuspendFromOcclusion = isOccluded && !elevationCovers
```

Also suspend when:

- `overlay ensure` failed / timed out while occluded
- Overlay crashed / `desktop-overlay:destroyed` unexpectedly while layers still open
- Capability false (today’s APP-029 behavior)

**Tooltip change**: include tooltip/hover-card in **fallback** occlusion candidates too (so if elevation fails, hide still unblocks tooltips). Happy path elevates them instead of ignoring.

**Fallback UX**: keep static React fallback in preview placeholder when suspended; no success toasts (M12).

**Transition**: When elevation becomes ready mid-open, switch container host→overlay and clear suspend without flicker if possible (acceptable brief fallback during cold create within budget).

### Constants (normative defaults)

| Constant | Default | Meaning |
|----------|---------|---------|
| `OVERLAY_IDLE_MS` | `30_000` | No elevated layers → destroy surface |
| `OVERLAY_CREATE_BUDGET_MS` | `200` | Ensure not ready → use hide fallback for occluding UI |
| `OVERLAY_BOUNDS_PADDING_PX` | `16` | Pass-through tight bounds padding |
| `OVERLAY_RESTORE_DEBOUNCE_MS` | keep APP-029 `140` | Avoid flicker when falling back |

Tune only with dogfood evidence; keep in one constants module.

---

## Data model

No DB. Runtime types (TypeScript, shared as needed between web and electron via structural typing / small shared package only if duplication hurts):

```ts
type OverlayPointerMode = "pass-through" | "capture";

type OverlayEnsureResult = {
  ok: boolean;
  ready: boolean;
  windowId?: number;
};

type OverlayLayerKind =
  | "dialog"
  | "sheet"
  | "drawer"
  | "popover"
  | "menu"
  | "select"
  | "tooltip"
  | "hover-card"
  | "custom";

type OverlayLayerRegistration = {
  id: string;
  kind: OverlayLayerKind;
  modal: boolean; // forces capture + always-elevate when preview present
};

type DesktopCapabilities = {
  // existing fields…
  overlaySurface?: boolean;
};
```

---

## Transport

**Desktop IPC only** (Electron `atmos:desktop-invoke` + desktop events). Not Atmos Server WebSocket.

### Commands

```ts
// ensure
desktopInvoke("overlay_bridge_ensure", {});
// → { ok: true, ready: true, windowId: number }

desktopInvoke("overlay_bridge_set_pointer_mode", { mode: "capture" | "pass-through" });
desktopInvoke("overlay_bridge_note_activity", {});
desktopInvoke("overlay_bridge_release", {});
desktopInvoke("overlay_bridge_destroy", {});
```

### Events

```ts
desktopListen("desktop-overlay:ready", (p) => { /* … */ });
desktopListen("desktop-overlay:destroyed", (p) => { /* … */ });
// optional:
desktopListen("desktop-overlay:outside-pointer", (p) => { /* dismiss non-modals */ });
```

### REST

None. Justification: local shell concern; no multi-client sync.

---

## Security & permissions

- Overlay window is **same trust level as host shell** (product UI), not guest preview partition (`persist:atmos-preview`).
- Overlay preload must **not** expose full Node or arbitrary desktop invoke if host already has a privileged preload; prefer a minimal bridge.
- Guest preview remains isolated; elevation must not inject host React into preview partition.
- No new tokens; no logging of page content from guest when handling outside-pointer.

---

## PRD traceability

| PRD | TECH mechanism |
|-----|----------------|
| M1 shared engine | One child overlay window per host; multi-layer DOM in one document |
| M2 all classes + tooltips | Policy table + UI portal container wiring for all primitives |
| M3 live preview happy path | Do not set `shouldSuspendFromOcclusion` when `elevationCovers` |
| M4 modal live under dimmer | Modal elevates backdrop into overlay; preview stays shown; pointer `capture` |
| M5 all host windows | Manager keyed by host window; invoke uses sender window |
| M6 lazy + idle cleanup | `ensure` on first need; `OVERLAY_IDLE_MS` destroy |
| M7 hide fallback | APP-029 when `!elevationCovers` / timeout / failure |
| M8 web | Capability + shell gate; default portal unchanged |
| M9 automatic | Shared candidates + portal context; opt-in `data-atmos-native-surface-overlay` |
| M10 focus | Focus in overlay document; return focus host on close; manual gate |
| M11 visual parity | Host React + shared CSS/theme mirror on overlay documentElement |
| M12 no toasts | Silent ensure/destroy/fallback |

---

## Rollout plan

Ordered, mergeable steps:

1. **Electron manager skeleton** — `OverlaySurfaceManager` + `overlay_bridge_ensure/destroy` + idle timer; no web wiring; unit-testable pure helpers for bounds math.
2. **Overlay HTML entry + CSS** — transparent page, `#atmos-overlay-root`, theme class hook; load from desktop build.
3. **window.open handler + portal proof** — dogfood: manually portal a test dialog above preview without hide.
4. **`packages/ui` portal container context** — default null; wire Dialog/Popover/Menu/Tooltip/Sheet/…; web screenshot/smoke unchanged.
5. **`FloatingElevationProvider`** — capability gate, ensure/release, theme sync, layer refcount.
6. **Policy + geometry** — extract shared candidates; modal always / others on intersect; pointer modes + tight bounds.
7. **APP-029 integration** — `elevationCovers` suppresses suspend; tooltips in fallback candidates; keep static fallback UI.
8. **Standalone browser host** — verify second window has its own overlay singleton.
9. **Focus/keyboard matrix** — fix gaps; if a class fails M10, force that class to fallback hide until fixed.
10. **Idle destroy validation** — confirm process teardown; optional N3 debug counters; optional N1 prewarm later.

Feature flag (optional): `desktopOverlaySurface` in desktop config default **on** for Electron dogfood once step 7 is green; keep ability to force APP-029-only via flag for rollback.

---

## Risks & tradeoffs

| Risk | Mitigation |
|------|------------|
| Child `BrowserWindow` focus feels “second window” | Parenting, skipTaskbar, no activate steal on ensure when only tooltips; focus only when modal/menu needs it. |
| `createPortal` cross-window edge cases (events, measure, `position: fixed`) | Overlay bounds = host content box so `fixed` coordinates match; sync resize; test Radix positioning. |
| Cold ensure latency | `OVERLAY_CREATE_BUDGET_MS` + hide fallback; optional N1 prewarm after first preview attach. |
| Pass-through vs tooltip hit-testing | Tight bounds + padding; if unreliable, temporary `capture` for open non-modals (blocks preview clicks under menu only via bounds). |
| Silent permanent fallback | Debug counter elevated vs suspended (N3); dogfood checklist. |
| Style mismatch | Overlay entry ships same CSS; mirror `documentElement` theme on ensure and on theme toggle. |
| Two windows on multi-monitor DPI | Bounds from host `getContentBounds()`; listen display metrics. |

**Tradeoff**: Chose **child BrowserWindow + host portals** over **WebContentsView remount** for rich React children and simpler stacking above preview. Cost: window lifecycle and pointer routing complexity.

**Rollback**: Flag off elevation → pure APP-029 hide path (already shipped). Destroy manager; UI context null.

---

## Dependencies & compatibility

- **Depends on**: APP-029 machinery (occlusion + hide + fallback UI); Electron desktop shell (APP-045); native preview surfaces (`PreviewSurfaceManager`).
- **Supersedes (behavior)**: APP-029 as *primary* stacking strategy; does not delete APP-029.
- **Does not block**: API, mobile, web-only features.
- **Min shell**: Electron desktop with `WebContentsView` preview; no Tauri work.

---

## Open questions

- [ ] Exact desktop static route/filename for overlay entry in prod export (`/desktop-overlay` vs query flag) — decide at impl with current Next desktop export layout.
- [ ] Whether `window.open` + `overrideBrowserWindowOptions` alone is sufficient on all target Electron versions, or main must create the window and bridge a `MessagePort`/`WebContents` id for portal bootstrap — spike in rollout step 3; **API of `FloatingElevationProvider` stays the same**.
- [ ] Outside-click on preview: prefer bounds-only vs explicit `outside-pointer` events from preview webContents — implement bounds-first; add events if dismiss flakes.
- [ ] N1 prewarm: after first `preview_bridge_open` on a host vs hover on menu triggers — defer until cold-open metrics hurt.

---

## Implementation notes (non-normative)

- Reuse patterns from `apps/desktop-electron/src/appshot/capture-animation.ts` (shared overlay window lifecycle) and `PreviewSurfaceManager` (per-host attach, destroy on host close).
- Keep overlay code out of `persist:atmos-preview` partition.
- Do not enumerate feature-level hide flags for new menus once elevation is on; rely on markers + policy.
- Prefer extracting pure geometry helpers for unit tests under `apps/web` (Bun) without Electron.
