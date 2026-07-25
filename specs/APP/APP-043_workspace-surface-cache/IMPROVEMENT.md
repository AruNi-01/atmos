# IMPROVEMENT · APP-043: Workspace Surface Cache — Operational Log

> Living record of dogfood issues, quality gaps, mitigations shipped, and follow-ups after the APP-043 cutover. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) → [PRD](./PRD.md) → [TECH](./TECH.md) → [TEST](./TEST.md)); does not replace them.

**Related code**: `apps/web/src/app-shell/CenterStage*.tsx`, `workspace-surface-switch.ts`, `workspace-surface-policies.ts`, `use-workspace-surface-cache-store.ts`, `use-app-router.ts`, sidebar `WorkspaceItem` / `markWorkspaceVisited`

**Baseline design**: [TECH.md §8 Switch path](./TECH.md), [TECH.md §9.8 Switch performance](./TECH.md)

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After fixing a user-reported bug, reliability issue, quality regression, or deliberate product parity gap. |
| **Entry id** | `IMP-NNN` — zero-padded, monotonic in this file (next: **IMP-010**). |
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

Partial mitigations shipped with [IMP-008](#imp-008--warm-hop-visual-lead-before-url-commit):

1. Warm hops flip center visibility **before** URL commit (`visualActiveContextId`), so route latency no longer gates first paint.
2. Warm frames keep light panels only when they are the frame’s last-active tab (narrower trees → less commit work).
3. URL-synced live props (handlers/refs/parent tab lists) apply only when `contextId === effectiveContextId`, so optimistic paint uses per-context store identity.

Still open (optional next pass):

1. Memoize / isolate per-frame panel trees so inactive frames skip host prop churn.
2. Optional: virtualize or freeze paint more aggressively without unmounting terminal attach.
3. Dev-only marks (not production default) if re-measuring.

### Result

Warm return first paint no longer waits on Next route commit. Residual multi-frame commit under many warm frames may still appear; track separately if dogfood reports lag after IMP-008.

### Code / docs touched

- Documented in [TECH.md §9.8](./TECH.md) perf evidence + [TEST S17 / S27](./TEST.md)
- IMP-008 implementation

### Follow-ups

- [ ] Memo per-frame body / avoid host-wide context that invalidates all frames
- [ ] Re-measure with ≥5 warm frames after IMP-008
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
