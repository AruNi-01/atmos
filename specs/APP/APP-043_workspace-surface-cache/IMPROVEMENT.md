# IMPROVEMENT · APP-043: Workspace Surface Cache — Operational Log

> Living record of dogfood issues, quality gaps, mitigations shipped, and follow-ups after the APP-043 cutover. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) → [PRD](./PRD.md) → [TECH](./TECH.md) → [TEST](./TEST.md)); does not replace them.

**Related code**: `apps/web/src/app-shell/CenterStage*.tsx`, `workspace-surface-switch.ts`, `workspace-surface-policies.ts`, `use-workspace-surface-cache-store.ts`, `use-app-router.ts`, sidebar `WorkspaceItem` / `markWorkspaceVisited`

**Baseline design**: [TECH.md §8 Switch path](./TECH.md), [TECH.md §9.8 Switch performance](./TECH.md)

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After fixing a user-reported bug, reliability issue, quality regression, or deliberate product parity gap. |
| **Entry id** | `IMP-NNN` — zero-padded, monotonic in this file (next: **IMP-016**). |
| **Status** | `open` → `mitigated` → `closed` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH sections; link to TECH/PRD and paste only deltas. |

---

## Index

| Id | Title | Status | Date |
|----|-------|--------|------|
| [IMP-001](#imp-001--setstate-during-render-on-projectworkspace-entry) | setState during render on Project/Workspace entry | closed | 2026-07-24 |
| [IMP-002](#imp-002--terminal-disconnect-on-warm-leave-gap) | Terminal disconnect on warm leave gap | closed | 2026-07-24 |
| [IMP-003](#imp-003--sidebar-click-blocked-by-wsc-promote-on-nav-path) | Sidebar click blocked by WSC promote on nav path | closed | 2026-07-25 |
| [IMP-004](#imp-004--double-raf-afterpaint-promote-added--1s-switch-latency) | Double-rAF afterPaint promote added ~1s switch latency | closed | 2026-07-25 |
| [IMP-005](#imp-005--dynamic-terminal-title--centerstagepanels-thrash) | Dynamic terminal title → CenterStagePanels thrash | closed | 2026-07-25 |
| [IMP-006](#imp-006--hoverbootstrapmarkvisited-storm-during-rapid-hopping) | Hover / bootstrap / markVisited storm during rapid hopping | closed | 2026-07-25 |
| [IMP-007](#imp-007--residual-multi-frame-react-commit-spikes) | Residual multi-frame React commit spikes | mitigated | 2026-07-25 |
| [IMP-008](#imp-008--warm-hop-visual-lead-before-url-commit) | Warm hop visual lead before URL commit | closed | 2026-07-26 |
| [IMP-009](#imp-009--rapid-hop-visual--promote-coalescing) | Rapid hop visual + promote coalescing | closed | 2026-07-26 |
| [IMP-010](#imp-010--shell-only-hide--dom-visual-flip) | Shell-only hide + DOM visual flip | mitigated | 2026-07-26 |
| [IMP-011](#imp-011--per-frame-memo-isolation) | Per-frame memo isolation | mitigated | 2026-07-26 |
| [IMP-012](#imp-012--keep-sidebar-input-interruptible-during-switch) | Keep sidebar input interruptible during switch | mitigated | 2026-07-26 |
| [IMP-013](#imp-013--defer-center-rebind-so-sidebar-stays-interactive) | Defer center rebind so sidebar stays interactive | mitigated | 2026-07-26 |
| [IMP-014](#imp-014--pause-hidden-terminal-fit--resizeobserver) | Pause hidden terminal fit / ResizeObserver | mitigated | 2026-07-26 |
| [IMP-015](#imp-015--keep-center-tab-chrome-mounted-across-hops) | Keep center tab chrome mounted across hops | mitigated | 2026-08-16 |

---

## IMP-001 · setState during render on Project/Workspace entry

| Field | Value |
|-------|--------|
| **Date** | 2026-07-24 |
| **Status** | closed |
| **Reported by** | user |
| **Severity** | crash |

### Problem

Entering a Project or Workspace broke the center stage with React “Cannot update a component while rendering a different component” (render-phase WSC / store writes).

### Root cause

WSC `setActive` / `touch` (or equivalent promote) ran during render or inside a path that synchronously re-rendered `CenterStage` while another component was still rendering (sidebar / router).

### Solution

- Promote only in `useEffect` after URL / `effectiveContextId` commits (post-paint).
- Navigation path must not write WSC (see IMP-003 / TECH §8.1).

### Result

Project/Workspace entry no longer throws; promote is effect-driven.

### Code / docs touched

- `apps/web/src/app-shell/center-stage-support.tsx`
- `apps/web/src/app-shell/CenterStage.tsx` / `CenterStagePanels.tsx`
- [TECH.md §8.2](./TECH.md)

### Follow-ups

- None (superseded by atomic `switchContext` + sticky leave).

---

## IMP-002 · Terminal disconnect on warm leave gap

| Field | Value |
|-------|--------|
| **Date** | 2026-07-24 |
| **Status** | closed |
| **Reported by** | user |
| **Severity** | reliability |

### Problem

Switching away from a workspace felt non-seamless: terminal disconnected / remounted instead of keep-alive. Goal is Cursor/session-style warm return with live buffer continuity.

### Root cause

Between URL change (`effectiveContextId` updates) and WSC promote (`switchContext`), the leaving frame was no longer in `active ∪ warm`, so React unmounted Terminal → PTY frontend detach.

### Solution

- **Sticky leave:** `pushStickyLeavingContext` / `pruneStickyLeavingContexts` / `resolveContextIdsToRender` keep the left context mounted until it appears in `warm[]`.
- Atomic `switchContext(next)` (single store notify: active + leave→warm) instead of split `setActive` + `touch` races.
- TECH: freeze still uses `detachWorkspaceFrontend` (identity retained); sticky is only for the promote gap, not a new tier.

### Result

Warm leave no longer tears down Terminal DOM during the promote gap; return keeps buffer when still warm.

### Code / docs touched

- `apps/web/src/app-shell/workspace-surface-policies.ts`
- `apps/web/src/app-shell/CenterStagePanels.tsx`
- `apps/web/src/features/workspace/store/use-workspace-surface-cache-store.ts` (`switchContext`)
- [TECH.md §8.3](./TECH.md), unit coverage in policies + store tests

### Follow-ups

- [ ] Optional E2E assert: frame DOM node id for A remains present while B is active (partially covered by existing Playwright warm-hidden checks).

---

## IMP-003 · Sidebar click blocked by WSC promote on nav path

| Field | Value |
|-------|--------|
| **Date** | 2026-07-25 |
| **Status** | closed |
| **Reported by** | user |
| **Severity** | performance |

### Problem

Clicking a workspace/project row felt blocked (~1s+): pointer feedback delayed, hop unresponsive, especially with several warm frames already mounted.

### Root cause

`useAppRouter` / click path called WSC `setActive`/`touch` (or heavy rebind) **before** `router.push`, forcing a synchronous multi-frame `CenterStage` re-render on the main thread and blocking the click handler return.

### Solution

- **Nav stays cheap:** `prepareWorkspaceContextNavigation` injects last-tab into href only (pure string); **no** WSC writes on click.
- Promote only after URL commits (CenterStage effect → `switchContext`).
- Non-chrome rebind (git context, file tree) deferred after paint / rAF, not on click.

### Result

Click → `router.push` returns quickly; measured after-paint wait from promote-on-nav removed (see IMP-004 evidence table).

### Code / docs touched

- `apps/web/src/app-shell/workspace-surface-switch.ts`
- `apps/web/src/shared/hooks/use-app-router.ts`
- [TECH.md §8.1](./TECH.md), [TEST S24](./TEST.md)

### Follow-ups

- None for nav path; residual lag is commit-bound (IMP-007).

---

## IMP-004 · Double-rAF afterPaint promote added ~1s switch latency

| Field | Value |
|-------|--------|
| **Date** | 2026-07-25 |
| **Status** | closed |
| **Reported by** | internal (debug marks) + user |
| **Severity** | performance |

### Problem

Even after moving promote off the click path, switch settle often stayed 0.5–1.6s. Temporary `wsc-switch` logs showed large “after-paint wait” before `switchContext`.

### Root cause

Promote was scheduled via **double-rAF / afterPaint** helper, waiting for an extra paint cycle under multi-frame load (p50 ~475ms, max ~1.1s just for the wait).

### Solution

- Call `switchContext` **synchronously inside the CenterStage `useEffect`** that already runs after paint for `effectiveContextId` change.
- Do **not** reintroduce double-rAF promote for WSC.
- Keep `scheduleAfterPaint` / idle only for non-critical work (snapshots, secondary rebind).

### Result

After-paint wait eliminated in dogfood marks. Typical switch settle p50 ~90ms; residual spikes from React commit (IMP-007). Temporary debug logger removed after measurement.

### Code / docs touched

- `apps/web/src/app-shell/center-stage-support.tsx`
- `apps/web/src/app-shell/workspace-surface-switch.ts`
- [TECH.md §9.8](./TECH.md)

### Follow-ups

- None (do not re-add double-rAF promote).

---

## IMP-005 · Dynamic terminal title → CenterStagePanels thrash

| Field | Value |
|-------|--------|
| **Date** | 2026-07-25 |
| **Status** | closed |
| **Reported by** | user + internal |
| **Severity** | performance |

### Problem

Shell / agent dynamic titles caused full-CPU feel and laggy hops even when the user was not switching layout: CenterStage / multi-frame host re-rendered on every title tick.

### Root cause

`CenterStagePanels` (or host) subscribed to full `workspacePanes` (or equivalent pane objects). Title string changes are high-frequency and are not structural mount inputs.

### Solution

- Subscribe only to a **structural fingerprint** (`terminalPaneStructureKey`: scope → sorted pane ids).
- Dynamic title updates stay local to terminal chrome; do not invalidate multi-frame host props.

### Result

Title churn no longer forces multi-frame host re-render; major reduction in background CPU during agent runs.

### Code / docs touched

- `apps/web/src/app-shell/CenterStagePanels.tsx`
- [TECH.md §9.8](./TECH.md), [TEST S25](./TEST.md)

### Follow-ups

- [ ] Guard any new host-level terminal subscriptions the same way (structure only).

---

## IMP-006 · Hover / bootstrap / markVisited storm during rapid hopping

| Field | Value |
|-------|--------|
| **Date** | 2026-07-25 |
| **Status** | closed |
| **Reported by** | user |
| **Severity** | performance |

### Problem

During rapid multi-workspace hopping (and sidebar hover), main thread stayed busy: bootstrap refetch thrash, mark-visited network, hover prefetch, and row re-renders stacked on top of frame work.

### Root cause

- Hover prime debounce too aggressive for rapid pointer travel (or not cancelled cleanly).
- `markWorkspaceVisited` ran eagerly and could `cancelQueries` / broad bootstrap invalidation.
- Sidebar rows re-rendered when parent handlers / active state identity changed every hop.

### Solution

- Prefetch debounce ~450ms; leave/click **cancels** pending prime (TECH §9.6).
- `markVisited` debounced (~750ms); patch bootstrap only for the touched workspace; **do not** `cancelQueries` on every visit.
- Sidebar: pass `isActive` from parent; memo rows; click closes info popover and does **not** open on focus alone.
- Warm frames: `hidden` + `contentVisibility: "hidden"` to skip layout/paint.
- `displayContextId = useDeferredValue(effectiveContextId)` so rapid hops can skip intermediate multi-frame commits while sticky tracks live URL.

### Result

Dogfood: “much better,” still occasional lag under load (IMP-007). No warm-cap reduction required for this mitigation set.

### Code / docs touched

- `apps/web/src/features/project/store/project-store-label-actions.ts`
- `apps/web/src/app-shell/sidebar/WorkspaceItem.tsx` (+ related sidebar)
- `apps/web/src/app-shell/CenterStagePanels.tsx`
- [TECH.md §9.6 / §9.8](./TECH.md), [TEST S26](./TEST.md)

### Follow-ups

- See IMP-007 for residual commit cost.

---

## IMP-007 · Residual multi-frame React commit spikes

| Field | Value |
|-------|--------|
| **Date** | 2026-07-25 |
| **Status** | open |
| **Reported by** | user |
| **Severity** | performance |

### Problem

After IMP-003–006, navigation prepare is cheap and after-paint promote wait is gone, but dogfood still reports **a little lag** on some hops. Debug marks showed residual **~200–450ms** multi-frame React commit spikes under several warm frames (not nav-path store work).

### Root cause

Cost scales with number of mounted warm frames + terminal/editor subtrees still in React commit even when `hidden` / `content-visibility: hidden`. Not fixed by further delaying `switchContext`. Lowering warm caps would reduce cost but is product-undesirable (explicit non-goal for this pass).

### Solution

Partial mitigations shipped with [IMP-008](#imp-008--warm-hop-visual-lead-before-url-commit), [IMP-010](#imp-010--shell-only-hide--dom-visual-flip), and [IMP-011](#imp-011--per-frame-memo-isolation):

1. Warm hops flip center visibility **before** URL commit (`visualActiveContextId`), so route latency no longer gates first paint.
2. Warm frames keep light panels only when they are the frame’s last-active tab (narrower trees → less commit work).
3. URL-synced live props (handlers/refs/parent tab lists) apply only when `contextId === effectiveContextId`, so optimistic paint uses per-context store identity.
4. Shell-only hide + DOM visual flip (IMP-010).
5. Per-frame `React.memo` isolation so warm siblings skip host commit (IMP-011).

### Result

Warm return first paint no longer waits on Next route commit. Multi-frame host re-renders no longer walk every warm tree on every hop (IMP-011). Residual cost may remain for the leave/enter pair + URL-synced active frame.

### Code / docs touched

- Documented in [TECH.md §9.8](./TECH.md) perf evidence + [TEST S17 / S27](./TEST.md)
- IMP-008 / IMP-010 / IMP-011 implementation

### Follow-ups

- [x] Memo per-frame body / avoid host-wide context that invalidates all frames → [IMP-011](#imp-011--per-frame-memo-isolation)
- [ ] Re-measure with ≥5 warm frames after IMP-011
- [ ] Do **not** lower default `maxWarmWorkspaces` solely to hide commit cost without product sign-off

---

## IMP-008 · Warm hop visual lead before URL commit

| Field | Value |
|-------|--------|
| **Date** | 2026-07-26 |
| **Status** | closed |
| **Reported by** | user |
| **Severity** | performance |

### Problem

APP-043 kept warm DOM, but switching Workspace/Project still felt like a short load: center paint waited for URL → `effectiveContextId` → `switchContext` even when the target frame was already mounted.

### Root cause

Active paint identity was URL-first. Nav intentionally avoided full WSC promote on click (IMP-003), so warm hops still paid route commit latency before visibility flipped. `useDeferredValue` on the display id could further delay the visible frame.

### Solution

- Add `visualActiveContextId` + `beginVisualSwitch` (visibility only; no warm/budget work).
- Nav path: `prepareAndPrimeWorkspaceNavigation` injects last tab **and**, when the target is already mounted (Active ∪ Warm), primes visual paint immediately.
- Cold targets: do not prime empty frames; clear a stale visual lead back to committed active.
- Full `switchContext` still runs after URL commit (identity truth + warm membership).
- Center frames: `displayContextId` may lead URL for mounted targets; live parent props only when URL-synced (`contextId === effectiveContextId`).
- No new workspace-index hotkeys (product uses those chords for terminals).

### Result

Warm A→B→A style hops paint the retained center surface as soon as navigation is requested, without waiting for route promote. Cold first-open still mounts after URL as before.

### Code / docs touched

- `apps/web/src/features/workspace/store/use-workspace-surface-cache-store.ts`
- `apps/web/src/app-shell/workspace-surface-switch.ts`
- `apps/web/src/shared/hooks/use-app-router.ts`
- `apps/web/src/app-shell/CenterStagePanels.tsx`
- [TECH.md §9.8](./TECH.md)
- unit tests: workspace-surface-switch + workspace-surface-cache-store

### Follow-ups

- [ ] Optional memo isolation for remaining multi-frame commit cost (IMP-007)

---

## IMP-009 · Rapid hop visual + promote coalescing

| Field | Value |
|-------|--------|
| **Date** | 2026-07-26 |
| **Status** | closed |
| **Reported by** | user |
| **Severity** | performance |

### Problem

After IMP-008, **slow** Workspace/Project hops felt instant, but **rapid** hopping still stuttered: each click flushed a full multi-frame center commit, and intermediate URL promotes stacked on the main thread.

### Root cause

Visual lead and URL promote were correct per hop, but not rate-limited. N hops in ~N×50ms produced ~N multi-frame React commits (and N `switchContext` paths) even though only the final context is user-visible.

### Solution

- **Visual scheduler:** quiet gap (`VISUAL_SWITCH_QUIET_MS` ≈ 140ms) → flush immediately (preserves slow-hop feel). Faster hops → trailing coalesce (`VISUAL_SWITCH_COALESCE_MS` ≈ 32ms) so only the latest target paints.
- **Promote scheduler:** same quiet/coalesce shape for URL-driven `switchContext`. Intermediate leaves are `touch`ed into warm so A→B→C rapid still retains B’s frame identity without a full promote per hop.
- Cold nav still cancels pending visual lead and snaps to committed active.

### Result

Rapid multi-workspace hopping should no longer stack intermediate center commits; slow single hops remain immediate.

### Code / docs touched

- `apps/web/src/app-shell/workspace-surface-switch.ts` (`scheduleVisualActiveSwitch`, `schedulePromoteWorkspaceSurfaceSwitch`)
- `apps/web/src/app-shell/center-stage-support.tsx`
- unit tests for coalesce behavior
- [TECH.md §9.8](./TECH.md)

### Follow-ups

- [ ] Memo per-frame body if residual jank remains with ≥5 warm frames under slow hops

---

## IMP-010 · Shell-only hide + DOM visual flip

| Field | Value |
|-------|--------|
| **Date** | 2026-07-26 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | performance |

### Problem

After IMP-008/009, sidebar clicks still felt laggy: a short delay before the center “background” really switched, even for warm A→B→A hops. Peer multi-workspace hosts feel instant by keeping visited surfaces mounted and only toggling shell visibility.

### Root cause

1. **Inner panels gated on `isActiveFrame`:** Warm frames hid *all* panels (`isFramePanelVisible` required active + matching tab). Unhiding the outer shell alone revealed an empty frame until React flipped `isActiveContext` and re-rendered every panel tree.
2. **Paint waited on React commit:** `beginVisualSwitch` only updated store state; multi-frame `CenterStagePanels` commit could still lag the first paint under load.
3. **Sidebar highlight waited on URL:** row `isActive` used `effectiveContextId` / URL ids only.

### Solution

1. **`isFramePanelVisible` = last-tab match only** — outer `[data-workspace-frame]` is the sole Active/Warm paint gate; last-tab panels stay layout-ready inside Warm shells.
2. **`applyWorkspaceFrameVisualDom`** — on visual lead / promote, synchronously flip `hidden` / `data-tier` / `content-visibility` on mounted frames before React commits.
3. **Sidebar optimistic selection** — row highlight follows `visualActiveContextId` (paint selection); git/file-tree rebind still uses URL identity.

### Result

Warm hops should paint the retained center surface and sidebar selection on the click path without waiting for multi-frame React work or route commit. Cold first-open still mounts after URL as before.

### Code / docs touched

- `apps/web/src/app-shell/workspace-surface-policies.ts` (`isFramePanelVisible`)
- `apps/web/src/app-shell/workspace-surface-switch.ts` (`applyWorkspaceFrameVisualDom`)
- `apps/web/src/app-shell/CenterStagePanels.tsx`
- `apps/web/src/app-shell/LeftSidebar.tsx`
- unit tests: policies + switch

### Follow-ups

- [x] Memo per-frame body → [IMP-011](#imp-011--per-frame-memo-isolation)
- [x] Optimistic tab-bar chrome for warm hops → [IMP-015](#imp-015--keep-center-tab-chrome-mounted-across-hops)

---

## IMP-011 · Per-frame memo isolation

| Field | Value |
|-------|--------|
| **Date** | 2026-07-26 |
| **Status** | mitigated |
| **Reported by** | product (multi-workspace dogfood) |
| **Severity** | performance |

### Problem

Multi-workspace use keeps many Warm frames mounted. Host `CenterStagePanels` re-render (visual hop, URL commit, open-files on active) previously walked **every** frame’s terminal/editor/browser trees even when only two frames changed paint identity.

### Root cause

Frame bodies lived inline in the host `.map()`. Parent props (handlers, active openFiles, tab lists) were recreated or updated for the URL-synced frame and bubbled into every sibling.

### Solution

1. Extract `WorkspaceCenterFrame` (`workspace-center-frame.tsx`) with custom `React.memo` equality.
2. Warm / non-URL-synced frames only re-render when paint identity or mount keys for **that** context change (`isActiveContext`, `isUrlSyncedActive`, `mountPlanKeys`, `mountedTabIds`).
3. Warm frames read their own tab/file/github/browser identity from per-context stores; host passes live URL props only when `isUrlSyncedActive`.
4. Unit-test the equality helper so host chrome churn does not invalidate warm siblings.

### Result

On a hop with N warm frames, React should re-render O(1)–O(2) frames (leave + enter, then URL-sync on the target) instead of O(N) heavy trees. Complements IMP-010 DOM shell flip.

### Code / docs touched

- `apps/web/src/app-shell/workspace-center-frame.tsx`
- `apps/web/src/app-shell/CenterStagePanels.tsx`
- `apps/web/src/app-shell/__tests__/workspace-center-frame.test.ts`
- [TECH.md §9.8](./TECH.md)

### Follow-ups

- [ ] Re-measure with ≥5 warm frames in dogfood

---

## IMP-012 · Keep sidebar input interruptible during switch

| Field | Value |
|-------|--------|
| **Date** | 2026-07-26 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | performance / UX |

### Problem

During workspace hops, the left sidebar sometimes stopped accepting hover/click until center “finished rendering,” feeling frozen. Multi-workspace dogfood made this common.

### Root cause

Hop path still scheduled **urgent main-thread React work** that competed with pointer events:

1. `visualActiveContextId` subscribers (`CenterStagePanels` host + entire `LeftSidebar`) re-rendered on every click paint lead.
2. `switchContext` / promote → microtask `enforceMountBudgets` → second mountPlan commit immediately after.
3. Idle snapshot pass called `setSurfaceSnapshot` **per context** (N store notifies + N mountPlan recomputes).

Even with memo frames, the host/list work could occupy the main thread long enough that sidebar input felt dead.

### Solution

1. **DOM-only hop paint for center + sidebar row** (`applyWorkspaceFrameVisualDom` + `applyWorkspaceSidebarSelectionDom`); do not subscribe host/list to `visualActiveContextId`.
2. **Non-urgent store writes** via `scheduleNonUrgent` (`startTransition`) for visual/promote state.
3. **Idle `enforceMountBudgets`** on switch (no microtask).
4. **`setSurfaceSnapshots` batch** — one notify + one mountPlan recompute after idle snapshot build.
5. Sidebar React `isActive` follows **URL only**; optimistic highlight is DOM.

### Result

Click → DOM paint of retained center + row highlight should not require waiting for multi-frame React/tab restore. Subsequent clicks/hover should remain interruptible while URL/promote settle.

### Code / docs touched

- `workspace-surface-switch.ts` (`scheduleNonUrgent`, sidebar DOM)
- `CenterStagePanels.tsx` (no visual subscription; batch snapshots)
- `use-workspace-surface-cache-store.ts` (`setSurfaceSnapshots`, idle budgets)
- `LeftSidebar.tsx` / `WorkspaceContent.tsx` (`data-ws-row`)

### Follow-ups

- [x] Defer center rebind → [IMP-013](#imp-013--defer-center-rebind-so-sidebar-stays-interactive)

---

## IMP-013 · Defer center rebind so sidebar stays interactive

| Field | Value |
|-------|--------|
| **Date** | 2026-07-26 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | performance / UX |

### Problem

After IMP-012, dogfood still saw left sidebar freeze during hops: no hover, no scroll, no click until center/right “finished loading.” Pointer felt dead for the whole long task.

### Root cause

`RightSidebar` already used `useDeferredValue` for context rebind, but **`CenterStage` did not**. URL commit forced an urgent multi-thousand-line center re-render (tab bar, open files, URL-synced frame attach, terminal prime, tab restore) that occupied the main thread. Sibling left sidebar event handling and paint waited on that long task.

### Solution

1. **`useDeferredValue` on CenterStage context ids** (mirror RightSidebar): heavy selectors/UI follow deferred; promote/sticky use **live** URL.
2. **`paintContextId` (live) vs `effectiveContextId` (deferred)** in `CenterStagePanels`: shell visibility tracks live; URL-synced props attach only when deferred catches paint.
3. **primeWorkspace / setWorkspaceId / tab restore** only after `isCenterContextSettled`, with idle/after-paint.
4. **CSS contain** on left panel (`contain: layout paint`) to limit layout thrash bleed.

### Result

Hop path: DOM shell paint + sidebar URL highlight stay urgent; expensive center URL-sync becomes concurrent/deferred and should yield to sidebar pointer work.

### Code / docs touched

- `CenterStage.tsx`, `CenterStagePanels.tsx`, `PanelLayout.tsx`

### Follow-ups

- [x] Pause hidden terminal fit → [IMP-014](#imp-014--pause-hidden-terminal-fit--resizeobserver)

---

## IMP-014 · Pause hidden terminal fit / ResizeObserver

| Field | Value |
|-------|--------|
| **Date** | 2026-07-26 |
| **Status** | mitigated |
| **Reported by** | user (Safari Timeline: 6 warm terminal workspaces) |
| **Severity** | performance |

### Problem

Hopping among ~6 terminal workspaces pegged main-thread CPU (~90%+). Timeline showed thousands of `recalculate-styles` / `forced-layout` and tens of thousands of paints per hop burst — even with idle terminals (no agents).

### Root cause

Warm frames keep xterm mounted. Each Terminal attaches a **ResizeObserver** and may call **fit** (which reads layout). Workspace hop toggles `hidden` on frames → RO/layout invalidation across **all** hidden grids → forced synchronous layout thrash.

### Solution

1. `isSurfaceActive` on `TerminalGrid` → mosaic panes → `Terminal.surfaceActive`.
2. When `surfaceActive === false`: **disconnect ResizeObserver**, skip fit/measure paths (no `getBoundingClientRect`).
3. When becoming true: re-observe + **one** post-paint fit + resize notify.
4. Host passes `isSurfaceActive` only for the active frame + visible tab (project-wiki / code-review included).

### Result

Hidden warm terminals should no longer participate in hop-time layout storms. Active terminal still fits once on reveal.

### Code / docs touched

- `Terminal.tsx`, `TerminalGrid.tsx`, mosaic pane windows, `workspace-center-frame.tsx`, `terminal-grid-utils.ts`, `types`

### Follow-ups

- [ ] Re-measure Safari Timeline with 6 idle terminal workspaces

---

## IMP-015 · Keep center tab chrome mounted across hops

| Field | Value |
|-------|--------|
| **Date** | 2026-08-16 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | UX |

### Problem

Workspace/Project hops already opacity-hide retained **frames**, but the center tab strip was a single URL/deferred bar. Every hop remounted the strip, so tabs disappeared and re-displayed instead of hiding in place.

### Root cause

Tab chrome lived outside the per-context frame stack and rebound when `effectiveContextId` (deferred) caught up. IMP-010 called this out as a follow-up.

### Solution

1. Mount one tab strip per Active ∪ Warm (plus sticky-leave) context.
2. Hide inactive strips with the same `data-tier` opacity + inert stack as frames (`[data-workspace-tabbar]`).
3. `applyWorkspaceFrameVisualDom` flips tab chrome in the same click-path DOM write as frames.

### Result

Warm A→B→A hops should reveal the already-mounted destination tabs instead of remounting the strip.

### Code / docs touched

- `apps/web/src/app-shell/workspace-center-tab-bars.tsx`
- `apps/web/src/app-shell/CenterStage.tsx`
- `apps/web/src/app-shell/workspace-surface-switch.ts`
- `apps/web/src/app/globals.css`

### Follow-ups

- [ ] Dogfood rapid hops with ≥3 warm workspaces that have different tab sets
