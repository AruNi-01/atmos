# TEST · APP-052: Desktop Overlay Surface

> Test Plan · verify shared desktop overlay elevation above native preview, APP-029 hide fallback, web non-impact, lazy idle cleanup, and E2E journeys. References PRD APP-052 and TECH APP-052.

## Test strategy

- **Bun unit tests** for pure policy/geometry: elevation trigger (modal vs intersect), `elevationCovers` vs APP-029 suspend, candidate selectors (including tooltips), rect intersection, tight-bounds padding, idle timer math. No Electron required.
- **Bun unit tests** for desktop bridge/capability gating (shell none vs electron + `overlaySurface`).
- **Electron/main unit tests** (Bun or Node with mocks) for `OverlaySurfaceManager` lifecycle: ensure once per host, idle destroy, destroy on host close, pointer mode, bounds sync helpers — mock `BrowserWindow` / timers.
- **Playwright E2E (web harness, CI-primary)** under `e2e/tests/specs/` for **M8 web non-impact**: dialogs/popovers/tooltips still work in Chromium; no desktop overlay IPC; iframe preview not suspended by APP-052 logic.
- **Playwright E2E (desktop shell)** under `e2e/tests/specs/` for elevation happy path and fallback. The committed harness today is **web-only Chromium** (`e2e/playwright.config.ts`). **APP-052 test-run must add an Electron Playwright project** (or documented `just test-e2e-desktop` entry) that launches `apps/desktop-electron` and reuses `fixtures/test.ts` patterns where possible. Until that project exists, desktop stacking scenarios stay `planned` with harness gap called out — they are still **required for merge of full APP-052**, not optional nice-to-haves.
- **agent-browser**: exploratory on **web** routes only (desktop-native stacking is not Agent Browser’s target).
- **Manual**: multi-monitor DPI, focus edge cases, idle memory in Activity Monitor, first-open after destroy latency feel.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 Shared engine (one surface / host) | S4, S5, S20 |
| M2 Full floating class coverage + tooltips | S6, S7, S8, S9, S10, S21 |
| M3 Live preview happy path | S6, S7, S8, S11 |
| M4 Modal live under dimmer + block guest | S11, S12 |
| M5 All host windows (main + standalone) | S13, S14 |
| M6 Lazy create + idle cleanup | S4, S15, S16 |
| M7 Hide fallback (APP-029) | S17, S18, S22 |
| M8 Web non-impact | S1, S2, S3 |
| M9 Automatic / centralized participation | S9, S21 |
| M10 Focus / keyboard parity | S19 |
| M11 Visual parity | S11, S23 (manual / exploratory) |
| M12 No success toasts | S6, S11, S17 |
| N1 Prewarm (if shipped) | S24 (deferred unless implemented) |
| N3 Debug counters (if shipped) | S25 (deferred unless implemented) |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | E2E | Playwright | `just test-e2e -- tests/specs/APP-052_desktop-overlay-surface.web.e2e.ts` | seeded workspace; Chromium web | dialog open/close; no `overlay_bridge_*` | planned |
| S2 | E2E | Playwright | same file | popover/dropdown over main chrome | menu interactive; console clean of overlay errors | planned |
| S3 | E2E | Playwright | same file | iframe or web preview if available | preview not blanked by APP-029 desktop path | planned |
| S4 | Unit | `bun test` | OverlaySurfaceManager / pure lifecycle helpers | fake timers; mock window factory | single ensure; second ensure reuses; idle destroy once | planned |
| S5 | Unit | `bun test` | host-key / per-window map | two host ids | two independent surfaces; destroy one leaves other | planned |
| S6 | E2E desktop | Playwright Electron | `just test-e2e -- tests/specs/APP-052_desktop-overlay-surface.desktop.e2e.ts` (or `just test-e2e-desktop`) | Electron + native preview open in sidebar | dialog above guest; guest still updating (live); **not** paused fallback | planned |
| S7 | E2E desktop | Playwright Electron | same | toolbar dropdown intersecting preview | menu visible/clickable; preview **not** hidden | planned |
| S8 | E2E desktop | Playwright Electron | same | control near preview with tooltip | tooltip readable above guest | planned |
| S9 | Unit | `bun test` | elevation-policy + candidates | synthetic DOM rects (happy-dom) | modal→elevate; popover intersect→elevate; no preview→no elevate | planned |
| S10 | Unit | `bun test` | candidates include tooltip/hover-card | tooltip node intersecting surface | candidate listed; APP-029 ignore removed for fallback path | planned |
| S11 | E2E desktop | Playwright Electron | desktop e2e file | modal with dimmer over preview | dimmer+dialog on top; live guest under dimmer; guest not clickable | planned |
| S12 | Unit / desktop E2E | `bun test` + Electron | pointer mode policy | modal open vs menu open | `capture` vs `pass-through` / tight bounds | planned |
| S13 | E2E desktop | Playwright Electron | desktop e2e file | standalone browser host window | overlay ensure on that window; stacking works | planned |
| S14 | Unit | `bun test` | manager keyed by host id from invoke sender | two mock hosts | ensure(A) does not attach to B | planned |
| S15 | Unit | `bun test` | idle timer `OVERLAY_IDLE_MS` | fake timers; release layers | destroy after idle; not before | planned |
| S16 | E2E desktop or Manual | Electron | open menu, close, wait idle+ | Activity Monitor / debug counter | overlay process/window gone after idle | planned |
| S17 | E2E desktop | Playwright Electron | desktop e2e file | force ensure fail / budget timeout (test hook or flag) | APP-029 hide + fallback UI; restore on close | planned |
| S18 | Unit | `bun test` | `shouldSuspendFromOcclusion` | occluded + elevationCovers true/false | suspend only when `!elevationCovers` | planned |
| S19 | E2E desktop | Playwright Electron | desktop e2e file | dialog open over preview | Esc closes; Tab cycles; focus returns to trigger | planned |
| S20 | Unit / desktop | `bun test` + Electron | two concurrent layers | dialog + nested menu | still one overlay window | planned |
| S21 | Unit | `bun test` | `data-atmos-native-surface-overlay` opt-in | custom marker rect | elevates / occludes like stock roles | planned |
| S22 | Unit | `bun test` | cold create budget | ensure pending > budget + occluded | suspend true until ready then false when covered | planned |
| S23 | Manual / agent-browser (web theme only) | manual + agent-browser | theme toggle with elevated dialog on desktop | dark/light | elevated chrome matches host theme | planned |
| S24 | Unit | `bun test` | prewarm (if N1) | preview_bridge_open then first menu | optional; skip if not shipped | planned |
| S25 | Unit | `bun test` | counters (if N3) | elevate vs fallback calls | optional; skip if not shipped | planned |

### E2E harness requirements (desktop)

Deliver with APP-052 test-run (or a blocking prerequisite PR):

1. Playwright config project (e.g. `electron`) **or** `just test-e2e-desktop` that:
   - Builds/starts Electron desktop against local API + desktop web export (or dev URL documented in `e2e/README.md`).
   - Exposes a way to open a workspace with **desktop-native preview** (fixture URL that forces native transport).
   - Allows installing a short-lived test hook only in test builds if needed: e.g. force overlay ensure fail for S17 — must not ship enabled in production.
2. Spec files:
   - `e2e/tests/specs/APP-052_desktop-overlay-surface.web.e2e.ts` — Chromium project (existing).
   - `e2e/tests/specs/APP-052_desktop-overlay-surface.desktop.e2e.ts` — Electron project only (`test.skip` when not electron).
3. Commands documented in Coverage Status after implementation, e.g.:
   - `just test-e2e -- tests/specs/APP-052_desktop-overlay-surface.web.e2e.ts`
   - `just test-e2e-desktop -- tests/specs/APP-052_desktop-overlay-surface.desktop.e2e.ts`  
     (exact recipe TBD by test-run; name must land in `e2e/README.md`).

If Electron launch is too flaky for CI initially: web E2E + Bun units **must** still pass in CI; desktop E2E may run `nightly` / manual job — but **S6, S7, S8, S11, S17, S19 remain acceptance criteria** for declaring APP-052 done (can be proven on dogfood machine with the same Playwright file headed).

## Scenarios

### S1 — Web: dialog unaffected

- **Level**: E2E (Playwright web)
- **Given**: Chromium web app (shell `none`); user on a normal workbench route with any dialog entry point available in smoke fixtures.
- **When**: User opens and closes a standard app dialog.
- **Then**: Dialog is visible, interactive, dismisses via Esc or close; no desktop overlay bridge calls; no desktop-only error toasts.
- **Signals**: `getByRole('dialog')` visible; network/console without `overlay_bridge_*` failures; page usable after close.

### S2 — Web: popover / menu unaffected

- **Level**: E2E (Playwright web)
- **Given**: Web shell; a toolbar or menu that opens a dropdown/popover.
- **When**: User opens the menu and chooses a non-destructive item or dismisses.
- **Then**: Menu behaves as today; no blank regions forced by native-preview occlusion path.
- **Signals**: menu content role visible; click works; no `preview paused` fallback copy from desktop-native path.

### S3 — Web: preview path not forced into desktop hide

- **Level**: E2E (Playwright web)
- **Given**: Web preview (iframe) if the fixture can open browser/preview tab; otherwise assert pure web has no `desktop-native` suspend UI.
- **When**: User opens a popover that would have triggered APP-029 on desktop.
- **Then**: Iframe/web preview is not replaced by APP-029 “paused” native fallback chrome.
- **Signals**: no desktop-native occlusion fallback copy; iframe still present if opened.

### S4 — Singleton ensure + reuse

- **Level**: Unit
- **Given**: Mock host window A; manager empty.
- **When**: `ensure(A)` twice quickly; then register zero layers and advance timers past idle.
- **Then**: Factory creates **one** overlay surface; second ensure reuses; after idle, surface destroyed; third ensure creates again.
- **Signals**: create count === 2 across full sequence; destroy count === 1 after first idle.

### S5 — Per-host isolation

- **Level**: Unit
- **Given**: Hosts A and B.
- **When**: ensure(A), ensure(B); destroy(A).
- **Then**: B’s surface remains; A’s is gone.
- **Signals**: map size and host ids.

### S6 — Desktop: dialog over live native preview

- **Level**: E2E (Playwright Electron)
- **Given**: Electron desktop; workspace with **desktop-native** preview visible in sidebar (or in-shell browser); preview shows a page with a changing signal if possible (time, animation, or known title).
- **When**: User opens an app dialog that covers the preview region.
- **Then**: Dialog (and dimmer if any) is fully visible and clickable **above** the guest; native preview is **not** replaced by the static paused fallback; guest remains live (still updating or still showing live document, not the APP-029 placeholder).
- **Signals**: dialog role on top; absence of occlusion fallback copy in preview chrome; preview webContents still loaded (not hidden for occlusion); no success toast.

### S7 — Desktop: dropdown/popover over preview without hide

- **Level**: E2E (Playwright Electron)
- **Given**: Native preview visible; toolbar control whose menu intersects preview bounds.
- **When**: User opens the menu.
- **Then**: Menu items visible/clickable; preview stays live (not APP-029 hide).
- **Signals**: menu role; preview not in paused fallback; optional: `elevationCovers` true / suspend false via test hook.

### S8 — Desktop: tooltip over preview

- **Level**: E2E (Playwright Electron)
- **Given**: Control adjacent to preview with a tooltip/hover-card.
- **When**: User hovers long enough to show tooltip over the guest area.
- **Then**: Tooltip text is readable (not under native view); preview not suspended solely for the tooltip.
- **Signals**: tooltip role/name visible; no paused fallback.

### S9 — Elevation policy matrix

- **Level**: Unit
- **Given**: Synthetic surface rect + overlay rects; flags for previewPresent / modal / intersect.
- **When**: `shouldElevate(kind, ctx)` evaluated for dialog, sheet, popover, menu, tooltip, custom.
- **Then**:
  - No preview → all false.
  - Preview + modal kinds → true.
  - Preview + non-modal + intersect → true.
  - Preview + non-modal + no intersect → false.
- **Signals**: table-driven expects.

### S10 — Tooltip is a fallback occlusion candidate

- **Level**: Unit
- **Given**: Visible tooltip intersecting surface (happy-dom + mocked getBoundingClientRect).
- **When**: `readNativePreviewOcclusionSnapshot` (or successor) runs.
- **Then**: Tooltip contributes to occlusion candidates (APP-029 no longer ignores tooltips for fallback).
- **Signals**: `isOccluded === true` with only tooltip present.

### S11 — Modal live under dimmer; guest not interactive

- **Level**: E2E (Playwright Electron)
- **Given**: Native preview showing a clickable element (or known hit target).
- **When**: Modal dialog open with dimming backdrop over preview.
- **Then**: Backdrop and dialog stack above guest; guest content still visible under dimmer (live); clicks hit modal/backdrop, **not** guest navigation.
- **Signals**: dialog open; click on dimmer region does not change preview URL; optional pointer mode `capture`.

### S12 — Pointer mode selection

- **Level**: Unit (+ optional desktop assert)
- **Given**: Layer registry with modal vs only tooltip.
- **When**: Policy computes pointer mode.
- **Then**: Any modal → `capture`; only non-modal → `pass-through` (tight bounds path).
- **Signals**: mode enum; bounds padding applied in pure bounds helper.

### S13 — Standalone browser host

- **Level**: E2E (Playwright Electron)
- **Given**: Detached/standalone browser window hosting native preview + chrome overlays.
- **When**: User opens dialog/menu over that window’s preview.
- **Then**: Elevation works in **that** window (not only main); preview stays live on happy path.
- **Signals**: overlay ready on standalone; dialog visible; main window not required focused.

### S14 — Ensure uses invoking host

- **Level**: Unit
- **Given**: Mock IPC sender bound to host B while main is A.
- **When**: `overlay_bridge_ensure` runs.
- **Then**: Surface attached/created for B only.
- **Signals**: manager state host id.

### S15 — Idle destroy timing

- **Level**: Unit
- **Given**: `OVERLAY_IDLE_MS` constant; surface ensured; layers released at t=0.
- **When**: Advance fake timers to `IDLE - 1` then `IDLE + 1`.
- **Then**: Not destroyed before idle; destroyed after.
- **Signals**: destroy spy call count/time.

### S16 — Idle frees resources (desktop)

- **Level**: E2E desktop or Manual
- **Given**: Overlay created by opening then closing a menu over preview.
- **When**: Wait longer than idle with no elevated UI.
- **Then**: Overlay window is closed/destroyed; later menu recreates lazily.
- **Signals**: child window count; or debug event `desktop-overlay:destroyed`; second open still works.

### S17 — Ensure failure → APP-029 hide fallback

- **Level**: E2E (Playwright Electron)
- **Given**: Test-only hook forces `overlay_bridge_ensure` failure or never-ready past create budget; native preview visible.
- **When**: User opens a dialog overlapping preview.
- **Then**: Dialog remains usable; preview uses APP-029 hide + static fallback; closing dialog restores native preview; no success toast.
- **Signals**: fallback copy/state visible while open; preview restored after close; dialog clickable.

### S18 — Suspend only when elevation does not cover

- **Level**: Unit
- **Given**: `isOccluded` true.
- **When**: `elevationCovers` true vs false.
- **Then**: `shouldSuspendFromOcclusion` is false vs true respectively; other existing suspend reasons still force suspend.
- **Signals**: pure boolean helper tests.

### S19 — Focus and keyboard

- **Level**: E2E (Playwright Electron)
- **Given**: Dialog elevated over preview.
- **When**: User presses Esc; re-open and Tab through controls.
- **Then**: Esc dismisses dialog; focus order works inside dialog; after close, trigger or host regains usable focus (no dead focus island).
- **Signals**: dialog closed; keyboard reaches a known control; optional active element checks.

### S20 — One engine for concurrent layers

- **Level**: Unit (+ optional desktop)
- **Given**: Dialog open and nested dropdown open.
- **When**: Both elevated.
- **Then**: Still a single overlay surface instance for that host.
- **Signals**: create count remains 1; both layers in overlay document if observable.

### S21 — Custom opt-in marker

- **Level**: Unit
- **Given**: Element with `data-atmos-native-surface-overlay` intersecting surface.
- **When**: Policy/occlusion runs.
- **Then**: Treated as elevatable/occluding candidate.
- **Signals**: candidate list includes element.

### S22 — Cold create budget then recover

- **Level**: Unit
- **Given**: ensure pending longer than `OVERLAY_CREATE_BUDGET_MS` while occluded; then ready + elevationCovers.
- **When**: Time advances through budget then ready.
- **Then**: Suspend true during budget miss; suspend false once elevation covers; no stuck suspend.
- **Signals**: state machine / helper timeline.

### S23 — Theme parity

- **Level**: Manual (desktop) / agent-browser only for web theme unrelated
- **Given**: Desktop dark theme; elevated dialog open.
- **When**: Observe dialog chrome; toggle theme if possible while open.
- **Then**: Elevated UI matches host theme tokens (no unstyled white flash as steady state).
- **Signals**: visual parity dogfood; no merge-blocking automated pixel diff required in v1.

### S24 — Prewarm (N1, only if shipped)

- **Level**: Unit
- **Given**: N1 implemented.
- **When**: Preview attaches then first elevate.
- **Then**: Create cost reduced or ensure already warm without defeating idle destroy.
- **Signals**: create timing or prewarm flag.

### S25 — Debug counters (N3, only if shipped)

- **Level**: Unit
- **Given**: N3 implemented.
- **When**: Elevate success vs fallback path.
- **Then**: Counters increment appropriately.
- **Signals**: counter values in test API.

## Performance & load budgets

- **Cold ensure** (lazy create after idle): product-acceptable if ≤ `OVERLAY_CREATE_BUDGET_MS` (200ms default) to ready in dogfood on reference laptop; if slower, fallback hide must engage rather than frozen chrome.
- **Idle destroy**: within one idle period after last layer close; no permanent extra Chromium content process for overlay when idle > 2× idle constant.
- **Geometry recompute**: rAF-throttled; opening a menu over preview must not drop main UI to multi-second jank (qualitative dogfood).

## Regression checklist

- [ ] Pure web: no `overlay_bridge_*` traffic; portals still use document body.
- [ ] APP-029 still restores preview after fallback hide (no stuck hidden guest).
- [ ] Tooltips no longer permanently ignored for fallback occlusion.
- [ ] Closing host window destroys that host’s overlay (no orphan BrowserWindow).
- [ ] Standalone browser window does not steal main window’s overlay singleton.
- [ ] Nested menu over dialog still one overlay engine.
- [ ] Theme toggle does not leave elevated UI on stale theme class.
- [ ] No success toasts for ensure/destroy/hide/restore.
- [ ] Feature flag / capability off → behaves like APP-029-only desktop.
- [ ] Preview partition (`persist:atmos-preview`) never loads overlay shell URL.

## Exploratory agent-browser checks

Use **web** only (load Agent Browser skill or `agent-browser skills get core --full` first). Desktop stacking is out of scope for agent-browser.

1. Open local web app, open dialog and popover/menu from primary chrome; confirm no desktop error copy and no broken portal.
2. Narrow viewport: dialog still usable; no clipped primary actions.
3. Toggle theme on web; floating UI still coherent.
4. Watch console for unexpected errors when opening/closing floating UI rapidly.

## Acceptance criteria

Merge-blocking for declaring APP-052 complete:

- [ ] All Must Have PRD items M1–M12 map to at least one scenario with status covered (unit and/or E2E and/or documented manual with evidence).
- [ ] **Web E2E file** `e2e/tests/specs/APP-052_desktop-overlay-surface.web.e2e.ts` exists and passes via `just test-e2e` (S1–S3 intent).
- [ ] **Desktop E2E file** `e2e/tests/specs/APP-052_desktop-overlay-surface.desktop.e2e.ts` exists; S6, S7, S8, S11, S17, S19 pass on Electron harness or recorded headed dogfood run with command + date in Coverage Status.
- [ ] Bun unit suite covers S4, S5, S9, S10, S15, S18, S21, S22 (and S12 policy).
- [ ] Fallback path S17 proven (hook or equivalent).
- [ ] Idle destroy S15 (unit) and S16 (desktop or manual evidence).
- [ ] No new REST/WS protocol surface.
- [ ] `just lint` / scoped typecheck / `bun test` for touched packages pass; web e2e green in CI.
- [ ] Coverage Status updated by test-run with exact commands.

## Manual verification steps

Automation cannot fully replace these on every machine:

1. **Memory**: Open Atmos Electron, force overlay create (menu over preview), close UI, wait `> OVERLAY_IDLE_MS`, confirm overlay child window/process is gone (Activity Monitor / `ps`).
2. **Multi-monitor / DPI**: Move host across displays; open elevated dialog; confirm bounds track content area.
3. **Standalone browser**: Detach preview/browser window; open settings dialog / menus over its guest; confirm live stacking.
4. **Focus soak**: Rapid open/close dialogs and menus for 2 minutes; no stuck focus or unclickable chrome.
5. **Fallback dogfood**: Disable capability or break ensure once; confirm APP-029 hide still usable.

## Non-coverage

- Pixel-perfect shadow clipping / hole-punch of guest under rounded corners.
- Tauri shell parity.
- Mobile.
- Load testing thousands of concurrent elevated layers.
- True guest screenshot under modal (live view only).
- Out-of-window-bounds popovers (N4) unless free with vehicle.
- Full visual regression screenshot suite for every Radix primitive.

## Coverage Status

_Not started — planning stage. `atmos-specs-test-run` fills after implementation._

| Scenario | Result | Evidence |
|----------|--------|----------|
| S1–S25 | planned | — |
