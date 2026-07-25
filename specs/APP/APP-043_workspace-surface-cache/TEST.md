# TEST · APP-043: Workspace Surface Cache

> Test Plan · verify seamless Workspace/Project surface caching under budgets. References PRD APP-043 and TECH APP-043.

## Test strategy

- **Bun unit tests** for pure cache store logic: LRU warm cap, protection, budget demotion, TTL sweep, computer clear, invariants (active ∉ warm).
- **Bun unit/integration tests** for surface policy helpers (editor mount set, eviction order).
- **Component-level tests** where cheap: frame host mounts only active∪warm; hidden inactive frames remain in DOM.
- **Playwright E2E** for critical switch journeys (warm return continuity, over-cap freeze) under `e2e/tests/specs/`.
- **agent-browser** exploratory checks for perceived blank-stage and layout/fit issues.
- **Manual** performance stopwatch checks for the PRD budgets (hard to assert 100ms stably in CI).

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 Warm multi-context center | S1, S2 |
| M2 Three-tier lifecycle | S3, S4, S10, S21 |
| M3 Surface-specific keep policy | S5, S6, S7, S22 |
| M4 Budgets | S4, S6, S7, S8 |
| M5 Non-blocking switch | S9, S18 |
| M6 Warm continuity | S1, S2, S5 |
| M6b Frozen identity | S21 |
| M7 Protection rules | S8 |
| M8 Visibility restore | S11 |
| M9 Prefetch | S12 |
| M10 Settings | S13 |
| M11 Single model cutover | S14 |
| M12 Isolation | S15, S23 |
| Multi-frame URL / focus / agent targeting | S18, S19, S20 |
| N1 Pin (if shipped) | S16 |
| Performance budgets | S17 (manual + optional marks) |
| Switch-path perf (nav cheap / sticky / structure / hop thrash) | S24, S25, S26, S27 |
| Post-ship ops log | [IMPROVEMENT.md](./IMPROVEMENT.md) IMP-001–007 |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | E2E | Playwright | `just test-e2e -- tests/specs/APP-043_workspace-surface-cache.e2e.ts` | 2 workspaces with terminal output | Frame A `hidden` while B active; return A buffer unchanged | planned |
| S2 | E2E | Playwright | same | warm file tab context | return restores file tab without full reload flash | planned |
| S3 | Bun unit | `bun test` | workspace surface cache store tests | fake timers | tier transitions active↔warm↔frozen | planned |
| S4 | Bun unit | `bun test` | cache store over maxWarm | N+1 contexts | oldest frozen; warm length ≤ cap | planned |
| S5 | Bun unit | `bun test` | editor mount policy | 20 open files | mounted ≤ per-ws cap | planned |
| S6 | Bun unit | `bun test` | global editor/browser caps | multi-context fixtures | demount order | planned |
| S7 | Bun unit | `bun test` | terminal pane global cap | multi-pane fixtures | excess demoted | planned |
| S8 | Bun unit | `bun test` | protect dirty/agent | mixed protect flags | unprotected frozen first | planned |
| S9 | Bun/component | `bun test` | restore helper | last tab + not ready terminal | chrome tab set without wait | planned |
| S10 | Bun unit | `bun test` | TTL sweep | mocked now | expired warm frozen | planned |
| S11 | E2E or manual | Playwright/manual | fit on show | warm terminal | no zero-size terminal after return | planned |
| S12 | Bun/component | `bun test` | hover prefetch debounce | mock primeWorkspace | called once after debounce | planned |
| S13 | Bun unit | `bun test` | settings apply | set maxWarm=2 | next touch respects 2 | planned |
| S14 | Bun/grep gate | `bun test` + repo check | no APP-034 store/settings/inventory ownership | codebase | zero `useTerminalCacheStore`; no live `terminal.max_cached_*` reads; inventory not owned by APP-034 | planned |
| S15 | Bun unit | `bun test` | clearAll on instance change | warm set non-empty | empty after clear | planned |
| S16 | Bun unit | `bun test` | pin | if N1 shipped | pinned survives LRU | planned |
| S17 | Manual | stopwatch / marks | dogfood script | local desktop | meets PRD ms targets | planned |
| S18 | Bun unit | `bun test` | frameActiveTab / URL contract | active vs warm fixtures | warm panels ignore global URL tab; activate pushes last tab once | planned |
| S19 | Bun/component | `bun test` | focus / hotkeys active-only | two frames | hidden frame does not receive focus or tab hotkey side effects | planned |
| S20 | Bun/unit | `bun test` | agent-fix / pending run targets active only | pending for A while B active | applied only to B or queued for active id per TECH | planned |
| S21 | Bun unit | `bun test` | freeze uses detach not full evict | tabs/layouts/persisted present after freeze | strip identity retained; no `evictWorkspaceRuntime` on freeze | planned |
| S22 | Bun unit | `bun test` | light panel narrow mount | warm frame last tab terminal | overview/wiki not all mounted | planned |
| S23 | Bun unit | `bun test` | clearAll wired with computer scope | mock connection switch helper | WSC clear + no cross-instance frame ids | planned |
| S24 | Bun unit | `bun test` | `workspace-surface-switch` + store `switchContext` | prepared href + atomic leave→warm | nav injects last tab only; switchContext single update; sticky ids keep leave until warm | covered |
| S25 | Bun unit / code gate | `bun test` + review | structural pane key / no full panes in host | title change fixtures if present | host does not depend on dynamic title strings | partial |
| S26 | Bun unit / manual | `bun test` + dogfood | prefetch debounce + markVisited | rapid hop / hover | prime cancelled on leave; markVisited debounced without broad cancelQueries | partial |
| S27 | Manual | stopwatch / marks | multi-frame hop under load | ≥4 warm frames local desktop | nav prepare cheap; residual commit spikes documented in IMPROVEMENT IMP-007 | dogfood |

## Scenarios

### S1 — Warm terminal return continuity

- **Level:** E2E
- **Given:** Workspace A has a terminal with distinctive output; user switches to Workspace B (A becomes warm).
- **When:** User switches back to A within warm TTL and under warm cap.
- **Then:** A’s terminal DOM was retained while hidden; output and scroll match pre-switch; no full reload empty state.
- **Signals:** DOM node for frame A still present while B active (`hidden`); buffer text stable; switch measure optional.

### S2 — Warm file tab return

- **Level:** E2E
- **Given:** Workspace A has an open file as active center tab; switch to B and back.
- **When:** Return to A.
- **Then:** Same file tab is active; editor content continuity for warm-mounted editor; no whole-stage blocking loader.
- **Signals:** tab value, editor visible, no setup-blocking shell.

### S3 — Tier transitions

- **Level:** Unit
- **Given:** empty cache.
- **When:** activate A; activate B; freeze A.
- **Then:** active=B; A not in warm; freeze tears down frame mount set membership; A’s terminal **tab meta** still present (detach, not full wipe).
- **Signals:** store snapshots; `workspaceTerminalTabs[A]` defined.

### S4 — Warm cap LRU

- **Level:** Unit
- **Given:** `maxWarmWorkspaces = 3`.
- **When:** visit A,B,C,D,E in order (always leaving previous).
- **Then:** at most 3 warm entries; oldest unprotected among non-active are frozen first.
- **Signals:** `warm.map(w => w.contextId)` length and order.

### S5 — Per-workspace editor mount cap

- **Level:** Unit
- **Given:** one context with 20 open files, cap 5.
- **When:** policy computes mount set with active file P.
- **Then:** mounted paths size ≤ 5 and includes P.
- **Signals:** policy output set.

### S6 — Global browser cap

- **Level:** Unit
- **Given:** three warm contexts each with a browser tab, `maxGlobalBrowsers = 2`.
- **When:** coordinator runs.
- **Then:** at most 2 browser surfaces remain mount-eligible.
- **Signals:** mount plan.

### S7 — Global terminal pane cap

- **Level:** Unit
- **Given:** panes across contexts exceed `maxGlobalTerminalPanes`.
- **When:** budget enforcement runs.
- **Then:** excess demoted per TECH eviction order; active context panes preferred.
- **Signals:** mount plan / freeze calls.

### S8 — Protection

- **Level:** Unit
- **Given:** warm A dirty editor; warm B clean idle; over warm cap.
- **When:** touch forces eviction.
- **Then:** B frozen before A.
- **Signals:** freeze order / remaining warm ids.

### S9 — Non-blocking restore

- **Level:** Unit/component
- **Given:** last tab for context is a terminal id not yet in hydrated tab list.
- **When:** context becomes active.
- **Then:** restore does not await hydrate promise; sets best-known chrome state immediately; does not clear sibling warm frames.
- **Signals:** no gate on `isTerminalWorkspaceReady` in restore critical path (assert helper behavior).

### S10 — TTL sweep

- **Level:** Unit
- **Given:** warm entry older than `warmTtlMs`.
- **When:** `sweepExpired`.
- **Then:** entry frozen/removed; active untouched.
- **Signals:** store after sweep.

### S11 — Visibility fit

- **Level:** E2E or manual
- **Given:** warm terminal hidden.
- **When:** context reactivated.
- **Then:** terminal fills container (non-zero cols/rows / no clipped stub).
- **Signals:** layout assertion or manual screenshot.

### S12 — Prefetch on hover

- **Level:** Unit/component
- **Given:** sidebar row for workspace X.
- **When:** pointer enter for debounce window.
- **Then:** `primeWorkspace(X)` invoked; X not forced into warm solely by hover.
- **Signals:** mock call counts; warm list unchanged.

### S13 — Settings drive budgets

- **Level:** Unit
- **Given:** runtime sets `maxWarmWorkspaces` to 2.
- **When:** third context would enter warm.
- **Then:** cap 2 enforced.
- **Signals:** store length.

### S14 — APP-034 cutover

- **Level:** Repo gate + unit
- **Given:** delivery complete.
- **When:** search production `apps/web` sources and settings/inventory.
- **Then:** no imports of `use-terminal-cache-store` / `useTerminalCacheStore`; no runtime reads of `terminal.max_cached_workspaces` / `max_cached_terminal_panels_per_workspace`; Settings UI uses `workspace_surface.*`; `api-operation-inventory` (and similar) no longer list APP-034 terminal DOM cache as a live owner.
- **Signals:** grep/test gate.

### S15 — Computer isolation

- **Level:** Unit
- **Given:** warm contexts under instance A.
- **When:** `clearAll` (instance switch).
- **Then:** warm empty; active null or reset; no frame ids retained in cache store; full terminal wipe path may run here (unlike freeze).
- **Signals:** store snapshot.

### S18 — Multi-frame tab vs URL ownership

- **Level:** Unit
- **Given:** Active B with URL tab=`terminal`; Warm A has `lastCenterTab=file/X`.
- **When:** policy/frame resolves panel visibility for A and B.
- **Then:** A’s visible panel plan uses `file/X`, not URL `terminal`; B uses URL; activating A issues one URL push to `file/X`.
- **Signals:** pure resolver outputs + push call count.

### S19 — Focus and hotkeys stay on Active frame

- **Level:** Unit/component
- **Given:** frames A (warm/hidden) and B (active).
- **When:** global center-tab hotkey or focus query runs.
- **Then:** only B’s handlers run; A does not steal focus or change A’s URL.
- **Signals:** handler mocks / focus target.

### S20 — Agent landing targets Active only

- **Level:** Unit
- **Given:** pending agent-fix or workspace agent run while user is on context B.
- **When:** landing applies.
- **Then:** terminal/command targets `activeContextId` (B), not a warm frame.
- **Signals:** create/run calls with context id.

### S21 — Freeze preserves terminal identity (Option A)

- **Level:** Unit
- **Given:** context A with multiple terminal tabs + layouts + persisted layout cache.
- **When:** `freeze(A)`.
- **Then:** frame unmounted; `detachWorkspaceFrontend` semantics applied; `workspaceTerminalTabs` / layouts / `persistedTerminalLayouts` for A retained; full `evictWorkspaceRuntime` **not** invoked.
- **Signals:** store before/after; mock call assertions.

### S22 — Light panels not all warm-mounted

- **Level:** Unit
- **Given:** warm context whose `lastCenterTab` is a terminal; overview/wiki were never last tab.
- **When:** `computeMountPlan` runs.
- **Then:** light keys for overview/wiki absent (or only session-opened light LRU); terminal mount may remain.
- **Signals:** mountPlan keys.

### S23 — clearAll on named computer-switch chain

- **Level:** Unit
- **Given:** integration helper that runs on `activeInstanceId` change.
- **When:** instance switches A→B.
- **Then:** WSC `clearAll` runs in that chain (alongside query scope reset expectations).
- **Signals:** mock/spy on clearAll.

### S16 — Pin (only if N1 ships)

- **Level:** Unit
- **Given:** pinned warm context and LRU pressure.
- **When:** eviction runs.
- **Then:** pinned retained until absolute hard-cap last resort.
- **Signals:** freeze list excludes pin.

### S17 — Performance budgets (manual)

- **Level:** Manual
- **Given:** local Desktop/web with two warm workspaces prepared.
- **When:** switch A→B→A ten times.
- **Then:** subjective/mark-based times meet PRD success metrics for warm paths.
- **Signals:** `wsc-switch-*` marks or stopwatch notes in Coverage Status.

### S24 — Navigation path never promotes WSC; sticky leave + switchContext

- **Level:** Unit
- **Given:** helpers `prepareWorkspaceContextNavigation`, sticky leave helpers, and WSC store with active A.
- **When:** prepare href for B without `?tab=`; then `switchContext("b")`; resolve render set with sticky leaving A before warm owns A.
- **Then:**
  - prepared href injects last center tab for B when missing; no store mutation in prepare;
  - `switchContext` moves A→warm and sets active=B in **one** store notification;
  - `resolveContextIdsToRender` includes sticky leaving id until prune after warm membership.
- **Signals:** unit assertions in `workspace-surface-switch.test.ts`, `workspace-surface-policies.test.ts`, `workspace-surface-cache-store.test.ts`.
- **Regression of:** [IMP-001](./IMPROVEMENT.md#imp-001--setstate-during-render-on-projectworkspace-entry), [IMP-002](./IMPROVEMENT.md#imp-002--terminal-disconnect-on-warm-leave-gap), [IMP-003](./IMPROVEMENT.md#imp-003--sidebar-click-blocked-by-wsc-promote-on-nav-path).

### S25 — Terminal structure fingerprint, not full panes / title

- **Level:** Unit / code gate
- **Given:** multi-frame host (`CenterStagePanels`) mounts warm frames.
- **When:** terminal dynamic title (or non-structural pane field) updates for a warm or active pane.
- **Then:** host mount plan / frame list does not recompute solely from title; subscription is structural (scope → sorted pane ids).
- **Signals:** `terminalPaneStructureKey` (or equivalent) used in host; no host-level `workspacePanes` full-object subscribe for layout; optional unit on structure key stability when only title changes.
- **Regression of:** [IMP-005](./IMPROVEMENT.md#imp-005--dynamic-terminal-title--centerstagepanels-thrash).

### S26 — Rapid hop: prefetch cancel + debounced markVisited

- **Level:** Unit + dogfood
- **Given:** sidebar hover prime wired; markVisited on activate.
- **When:** pointer enters several rows quickly then leaves; user hops A→B→C within <1s.
- **Then:** pending prime for non-clicked rows is cancelled; markVisited does not fire once per hop immediately; bootstrap is not broadly invalidated via `cancelQueries` on every visit.
- **Signals:** unit for `createWorkspacePrimePrefetch` cancel; markVisited debounce behavior in store/actions; dogfood CPU during hop.
- **Regression of:** [IMP-006](./IMPROVEMENT.md#imp-006--hoverbootstrapmarkvisited-storm-during-rapid-hopping).

### S27 — Switch settle under multi-warm load (manual / marks)

- **Level:** Manual
- **Given:** local desktop, ≥4 warm workspaces with terminals, no temporary `wsc-switch` logger required for routine dogfood.
- **When:** hop slowly then rapidly among warm contexts.
- **Then:**
  - click is not blocked by multi-frame re-render (nav path cheap);
  - leaving terminal does not disconnect solely due to promote gap (sticky);
  - typical warm hop feels session-like; residual lag under load is multi-frame **commit** cost, not afterPaint wait (see IMP-007).
- **Signals:** subjective; optional temporary marks only when investigating; notes in Coverage Status / IMPROVEMENT.
- **Related:** [IMP-004](./IMPROVEMENT.md#imp-004--double-raf-afterpaint-promote-added--1s-switch-latency), [IMP-007](./IMPROVEMENT.md#imp-007--residual-multi-frame-react-commit-spikes).

## Performance & load budgets

- Warm terminal return ≤ 100ms interactive (dogfood; not a flaky CI hard fail unless marks harness is stable).
- Warm file return ≤ 150ms chrome interactive.
- Frozen first paint ≤ 150ms for tab identity.
- Store `switchContext` / `touch` body (no subscriber work) ≤ 4ms typical.
- Click → `router.push` return ≤ 5ms typical (must not run multi-frame re-render / WSC promote).
- CenterStagePanels commit (≤5 warm frames, steady) ≤ 50ms p50 local; residual 200–450ms spikes under load tracked as [IMP-007](./IMPROVEMENT.md#imp-007--residual-multi-frame-react-commit-spikes) (open).

## Regression checklist

- [ ] Active frame still syncs `?tab=` / wiki page URL params correctly.
- [ ] Warm frames never apply global URL tab to panel visibility.
- [ ] Switching context does not steal focus into a hidden frame.
- [ ] Agent-fix / pending terminal commands still target the active context only.
- [ ] Dirty file close confirmations still work per context.
- [ ] project-wiki / code-review surfaces survive warm hide and restore per frame (not host singleton).
- [ ] Freeze does not empty terminal tab strip identity; computer switch may full-wipe.
- [ ] Canvas terminal pin flows unaffected (or explicitly retested if they share terminal store).
- [ ] Setup-blocking workspace progress still replaces center when required.
- [ ] No cross-workspace terminal pane id collisions in refs maps.
- [ ] APP-035 query caches still isolate by computer after surface clearAll.
- [ ] Settings copy describes warm vs global caps; old APP-034 keys unused.
- [ ] Navigation / `useAppRouter` never writes WSC before `router.push` (S24 / IMP-003).
- [ ] Sticky leave keeps leaving frame mounted until warm owns it (S24 / IMP-002).
- [ ] `switchContext` used for hop promote (not render-phase setState; not double-rAF afterPaint) (IMP-001, IMP-004).
- [ ] Center multi-frame host does not subscribe to full `workspacePanes` / dynamic titles (S25 / IMP-005).
- [ ] Hover prime cancelled on leave/click; markVisited debounced without broad query cancel (S26 / IMP-006).
- [ ] Warm frames use `hidden` + content-visibility skip paint where applicable.

## Exploratory agent-browser checks

Load Agent Browser skill / `agent-browser skills get core --full` before running.

1. Open two workspaces; type unique terminal output in A; switch to B and back — confirm no blank stage and output persists.
2. Open many file tabs in one workspace; switch away and back — tab strip complete; active file correct.
3. Open more workspaces than warm cap; confirm older context still opens cleanly (frozen path) without crash.
4. Narrow viewport: tab bar + frame show/hide no layout overflow; no console errors on rapid switches.
5. Trigger a slow hydrate (throttle network if possible): chrome still appears; no infinite loading shell.
6. Rapid hop with ≥4 warm terminals: click stays responsive; no disconnect on leave solely from promote gap; note residual lag under IMP-007 if any.

## Acceptance criteria

- [ ] All Must Have items M1–M12 (including M6b frozen identity) have passing scenarios at the declared level (S17 manual noted in Coverage Status).
- [ ] APP-034 production code path removed including inventory/settings references (S14).
- [ ] Unit tests cover LRU, protect, TTL, clearAll, editor policy, mountPlan coordinator, freeze=detach (S21), frame/URL contract (S18).
- [ ] Multi-frame regressions covered: focus/hotkeys (S19), agent targeting (S20), light mount (S22), computer clearAll (S23).
- [ ] Switch-path perf regressions covered or dogfood-noted: S24–S27 + [IMPROVEMENT](./IMPROVEMENT.md) IMP-001–007.
- [ ] At least one Playwright warm-return journey automated or explicitly waived with reason + manual proof.
- [ ] Settings expose warm/budget controls and they affect runtime caps; copy reflects new semantics.
- [ ] `just typecheck` / scoped `bun test` for touched packages pass.
- [ ] No new REST endpoints.
- [ ] Coverage Status updated after test-run.

## Manual verification steps

1. Start web or desktop workbench with ≥3 workspaces.
2. In W1: run `echo W1-UNIQUE`, open a file, note scroll.
3. Switch W1→W2→W3→W1 rapidly; confirm W1 terminal uniqueness and file tab restore without full reload feel.
4. Open workspaces beyond warm cap; confirm memory stays reasonable (Task Manager) and oldest reopens via reattach.
5. Change warm cap in Settings to 2; repeat hop; confirm only 2 stay warm (optional dev diagnostics if N3 present).
6. Switch Atmos Computer target if available; confirm no previous computer frames flash content.

## Non-coverage

- Backend PTY lifetime under OS kill (covered elsewhere).
- Mobile workbench.
- Exact CI assertion of 100ms on shared runners (environment variance).
- Canvas multi-workspace frame host.

## Coverage Status

Updated during APP-043 implementation + switch-path perf dogfood (2026-07-24 → 2026-07-25).

| Scenario group | Status | Evidence |
|----------------|--------|----------|
| S3–S8, S10, S13, S18, S21–S22 (policies) | ✅ | `bun test` `apps/web/src/app-shell/__tests__/workspace-surface-policies.test.ts` |
| S1 / S21 detach / freeze identity | ✅ | `bun test` detach + store tests; **Playwright** `e2e/tests/specs/APP-043_workspace-surface-cache.e2e.ts` (warm A hidden while B active, reverse) |
| S4, S8, S10, S13, S15 store | ✅ | `bun test` `workspace-surface-cache-store.test.ts` (includes `switchContext` atomic leave→warm) |
| S9 non-blocking restore | ✅ | `planTerminalLastTabRestore` unit + `CenterStage.tsx` uses it |
| S12 hover prefetch | ✅ | `createWorkspacePrimePrefetch` unit + `WorkspaceItem` hover wire |
| S14 cutover | ✅ | bun gate walks `apps/web/src` — no `useTerminalCacheStore` / `max_cached_*` |
| S19 / S20 active-only targeting | ✅ | `shouldAcceptFrameInput` / `resolveActiveOnlyContextId` unit |
| S23 computer clearAll | ✅ | `clearWorkspaceSurfaceCacheOnTargetChange` unit + `prepareConnectionTargetChange` calls it |
| S24 nav + sticky + switchContext | ✅ | `workspace-surface-switch.test.ts` + policies sticky helpers + store `switchContext` unit; shipped code enforces no WSC on nav path |
| S25 structural pane key | ⚠ partial | shipped in `CenterStagePanels` (`terminalPaneStructureKey`); dedicated “title-only change does not remount host” unit not yet isolated |
| S26 prefetch cancel + markVisited debounce | ⚠ partial | prefetch unit + shipped debounce/patch behavior; full hop storm not automated |
| S17 / S27 perf budgets under load | ⚠ dogfood | 2026-07-25: afterPaint wait eliminated; settle p50 ~90ms; residual 200–450ms commit spikes → [IMP-007](./IMPROVEMENT.md#imp-007--residual-multi-frame-react-commit-spikes) open |
| S16 pin | ⚠ N1 not shipped | n/a |

### Ops log cross-links

| IMP | Status | Maps to scenarios |
|-----|--------|-------------------|
| IMP-001 render-phase setState | closed | S24 |
| IMP-002 sticky leave disconnect | closed | S1, S24 |
| IMP-003 nav-path WSC block | closed | S24 |
| IMP-004 double-rAF afterPaint | closed | S27 / TECH §9.8 |
| IMP-005 title thrash | closed | S25 |
| IMP-006 hover/bootstrap storm | closed | S12, S26 |
| IMP-007 residual commit spikes | open | S17, S27 |

### Commands

```bash
# Unit
cd apps/web && bun test \
  src/features/terminal/store/__tests__/detach-workspace-frontend.test.ts \
  src/app-shell/__tests__/workspace-surface-policies.test.ts \
  src/app-shell/__tests__/workspace-surface-switch.test.ts \
  src/app-shell/__tests__/workspace-surface-restore-prefetch.test.ts \
  src/features/workspace/store/__tests__/workspace-surface-cache-store.test.ts \
  src/features/terminal/lib/__tests__/terminal-session-live.test.ts

# E2E (requires current web static export when UI changes)
cd e2e && bunx playwright test tests/specs/APP-043_workspace-surface-cache.e2e.ts --project=chromium
```
