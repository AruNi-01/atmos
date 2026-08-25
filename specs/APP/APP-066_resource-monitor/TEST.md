# TEST · APP-066: Resource Monitor

> Test Plan · how we verify live Computer, Atmos, Project, Workspace, session, and local Desktop resource visibility. References PRD APP-066 and TECH APP-066.

## Test strategy

- **Rust unit/integration** proves process normalization, exclusive attribution, terminal-root capture, cache/coalescing, and subscription cleanup.
- **Bun tests** prove wire contracts, Computer-scoped Query isolation, Electron grouping, local-only shell gating, settings, and UI state logic.
- **End-to-end / agent-browser** checks the user-visible Footer and popover against a running local Server and Desktop because real OS CPU/RSS values are unsuitable for fixed assertions.
- **Manual-only** checks compare approximate values with Activity Monitor/Task Manager and exercise a real Relay Computer.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2 |
| M2 | S3, S4, S5, S6 |
| M3 | S10, S11 |
| M4 | S8, S12 |
| M5 | S7, S9 |
| M6 | S2, S6, S13 |
| M7 | S11, S13 |
| M8 | S14, S15 |
| M9 | S16 |
| M10 | S17, S18 |
| M11 | S19, S20 |
| M12 | S21, S22 |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Rust integration | `cargo test` | `cargo test -p core-engine resource_metrics` | current process + host sampler | valid totals; logical CPUs > 0; primed timestamp | planned |
| S2 | Rust unit | `cargo test` | `cargo test -p core-engine resource_metrics` | synthetic process samples | normalized CPU; exited/missing processes skipped | planned |
| S3 | Rust unit | `cargo test` | `cargo test -p core-service resource_monitor` | synthetic parent/child graph with nested roots | each process claimed once; deepest root wins | planned |
| S4 | Rust integration | `cargo test` | `cargo test -p core-service terminal` | simple portable PTY fixture | non-zero simple root PID captured internally | planned |
| S5 | Rust unit/integration | `cargo test` | `cargo test -p core-engine tmux` and service attribution tests | duplicate handles for one tmux window | one pane query result and one process claim | planned |
| S6 | Rust unit | `cargo test` | `cargo test -p core-service resource_monitor` | project context, workspace context, unresolved context | correct hierarchy; unresolved usage remains visible | planned |
| S7 | WS/API-level | `cargo test` | `cargo test -p api resource_monitor` | fake/counting monitor service and two connection IDs | immediate snapshot; scoped events; idempotent unsubscribe | planned |
| S8 | Bun test | `bun test` | Query key and connection-isolation suites | local scope and two relay revisions | old snapshot never appears under new scope | planned |
| S9 | WS/API-level | `cargo test` | API disconnect lifecycle test | subscribed connection closed without unsubscribe | subscription task removed; no further sends | planned |
| S10 | Bun test | `bun test` | Electron metrics collector tests | synthetic Browser/Tab/GPU/Utility metrics | byte conversion, CPU normalization, groups, no PIDs | planned |
| S11 | Bun test + E2E | `bun test`, Playwright | resource-monitor feature tests; `e2e/tests/specs/APP-066_resource-monitor.e2e.ts` if fixture supports metrics | Electron-local and hosted/relay modes | shell shown only for local Electron; Footer opens popover | planned |
| S12 | Bun test | `bun test` | resource-monitor API lifecycle tests | scope changes while popover is open | unsubscribe targets captured old scope; new scope subscribes once | planned |
| S13 | Bun test + agent-browser | `bun test`, `agent-browser` | UI states and exploratory checks | loading, stale, unsupported, partial, many Workspaces | actionable localized states; scrollable hierarchy; no layout overlap | planned |
| S14 | Bun test + E2E | `bun test`, Playwright | terminal pane locate helpers and APP-066 E2E | one host with default and extra Center Spaces | exact host/Space/tab/pane route; session row is actionable | planned |
| S15 | Bun test + E2E | `bun test`, Playwright | locate signal store/CSS and pane integration | repeated locate requests and reduced-motion mode | only target panel receives a finite blue pulse; agent attention is unchanged | planned |
| S16 | Bun test + E2E | `bun test`, Playwright | history/sort helpers and APP-066 popover | 61 snapshots across two Computer scopes | 60-point isolated history; useful chart; stable Name/CPU/Memory sorting | planned |
| S17 | Rust unit/integration | `cargo test` | `cargo test -p core-service resource_monitor` | Project-direct and Workspace session/cwd process graph | exclusive process leaves; parent memory/count reconciliation; no duplicate owner rows | planned |
| S18 | Rust/Bun test + E2E | `cargo test`, `bun test`, Playwright | Local Services cache join + hierarchy rendering | attributed listeners with matching/mismatching process identities | process basenames and cached ports under correct scope/session; no PID/path/command leak; no listener scan from hot path | planned |
| S19 | Rust/Bun test | `cargo test`, `bun test` | Host detail sampling/DTO/validator | per-core samples and macOS/Linux/Windows memory fixtures | core count and range; explicit accounting; used/available and swap invariants; cached nullable | planned |
| S20 | Bun test + E2E | `bun test`, Playwright | collapsible Host/Atmos and detail popovers | repeated snapshots, reduced-motion, narrow viewport | default-collapsed summaries; sticky sort; rounded hover; animated bars/chart; CPU/memory details remain inside parent monitor | planned |
| S21 | Bun/UI test + E2E | `bun test`, Playwright | shared Dither Funnel/Growth and feature thresholds | low/mid/high values and reduced-motion | full-length shallow track; compact fixed 0–100 Growth; success/warning/destructive pressure tones; morph/snap behavior | planned |
| S22 | Rust/Bun test + E2E | `cargo test`, `bun test`, Playwright | primary-disk sampler and default-collapsed Disk UI | root/system drive, APFS Data, removable, disk-image, pseudo, duplicate fixtures | exactly one primary system disk; used/available invariant; 2.5s cache; collapsed/expanded summary | planned |

## Scenarios

### S1 — Host sampler returns a useful snapshot

- **Level**: Rust integration
- **Given**: a supported host with the Atmos Server process running.
- **When**: the resource engine collects its first snapshot.
- **Then**: host total memory and logical CPU count are positive, CPU counters are primed, and collection returns a timestamp rather than an uninitialized placeholder.
- **Signals**: `ResourceHostSample`, non-empty process list, no panic.

### S2 — Process values are normalized and resilient

- **Level**: Rust unit
- **Given**: process samples spanning multiple logical cores and one process that exits during refresh.
- **When**: the engine normalizes the sample.
- **Then**: group CPU uses total-host 0–100 semantics, memory uses bytes, and the exited process is omitted without failing the host sample.
- **Signals**: deterministic normalized values and collection-health status.

### S3 — Exclusive attribution prevents double counting

- **Level**: Rust unit
- **Given**: a Server process tree containing a terminal root and a nested Workspace root.
- **When**: attribution assigns processes.
- **Then**: every `(pid, start_time)` has one owner, the deepest valid root wins, and Server/shared totals exclude Workspace-owned descendants.
- **Signals**: assignment map cardinality equals unique claimed process count; aggregate sums match the assignment map.

### S4 — Simple PTY captures its workload root

- **Level**: Rust integration
- **Given**: a simple terminal session created through `TerminalService`.
- **When**: the PTY child starts and the service lists resource roots.
- **Then**: the matching internal root has a non-zero `simple_root_pid`; public `SessionDetail` still exposes no PID.
- **Signals**: `TerminalResourceRoot.simple_root_pid`; unchanged serialized session detail.

### S5 — Tmux pane roots are batched and deduplicated

- **Level**: Rust unit/integration
- **Given**: two attached handles referencing the same tmux session/window and one distinct window.
- **When**: pane roots are joined to terminal roots.
- **Then**: one batched pane-list operation supplies both windows and the duplicate handle cannot claim its subtree twice.
- **Signals**: parsed pane map and unique ownership keys.

### S6 — Project, Workspace, and unresolved contexts remain honest

- **Level**: Rust unit
- **Given**: one Project-level session, one Workspace-level session, and one stale context GUID.
- **When**: a snapshot is aggregated.
- **Then**: Project direct usage and Workspace usage appear in their correct rows, totals are exclusive, and the stale context contributes to `unattributed` with `partial` status.
- **Signals**: hierarchy IDs, usage totals, `attribution_status`.

### S7 — Live updates are connection-scoped

- **Level**: WS/API-level
- **Given**: two connected clients and only one resource subscription.
- **When**: an interactive sample completes.
- **Then**: the subscriber receives one full `resource_monitor_updated` event, the other connection receives none, and subscribe returns an immediate snapshot.
- **Signals**: `WsManager::send_to` target IDs; no `broadcast` invocation.

### S8 — Computer switching isolates cache data

- **Level**: Bun test
- **Given**: a local snapshot and a Relay Computer with a different connection epoch/revision.
- **When**: the active Computer changes.
- **Then**: the Resource Monitor query key changes and the local snapshot is not rendered while the Relay query is loading.
- **Signals**: distinct Query keys and empty/new scoped cache state.

### S9 — Closing the surface stops interactive work

- **Level**: WS/API-level
- **Given**: an open popover with an active subscription.
- **When**: the user closes the popover, unmounts it, or the WS connection disconnects.
- **Then**: the subscription task is removed and no later interactive event is sent to that connection.
- **Signals**: subscription map empty and counting sampler/send count stable after cleanup.

### S10 — Electron metrics are grouped without leaking process identity

- **Level**: Bun test
- **Given**: synthetic Electron metrics for Browser, Tab, GPU, Utility, and an unknown process type.
- **When**: the Desktop collector creates a snapshot.
- **Then**: every process enters the expected group, working-set KB becomes bytes, CPU is normalized by logical CPUs, and the result contains no PID or creation time.
- **Signals**: group totals and serialized payload keys.

### S11 — Shell metrics appear only for local Electron

- **Level**: Bun test + E2E where available
- **Given**: the same UI running as local Electron, hosted web, and Electron connected to a Relay Computer.
- **When**: the Resource Monitor opens.
- **Then**: the Desktop shell section appears only in local Electron; Server hierarchy remains available in all supported Computer modes.
- **Signals**: section visibility and absence of shell IPC calls in hosted/Relay modes.

### S12 — Scope change cleans up the old subscription

- **Level**: Bun test
- **Given**: an open local Resource Monitor and an impending switch to a Relay Computer.
- **When**: the Computer scope changes.
- **Then**: unsubscribe is sent with the captured local scope before one subscription is established for the Relay scope.
- **Signals**: ordered mocked `wsRequestForComputerScope` calls.

### S13 — UI communicates partial and unavailable states

- **Level**: Bun test + exploratory agent-browser
- **Given**: loading, disconnected, stale, unsupported, partial-attribution, empty Project, and many-Workspace snapshots.
- **When**: each state is rendered in light and dark themes.
- **Then**: localized sentence-case copy explains the state, unattributed usage remains visible, and the hierarchy scrolls without covering Footer controls.
- **Signals**: visible text, semantic state markers, no console error or clipped popover.

### S14 — Terminal row navigates across Center Spaces

- **Level**: Bun test + E2E
- **Given**: an attributed terminal session whose live pane belongs to a non-active Center Space and a non-default Terminal tab.
- **When**: the user selects that session row in Resource Monitor.
- **Then**: Atmos closes the popover, activates the owning Project/Workspace, Center Space, and Terminal tab, focuses the exact pane, and does not restore focus to the Footer trigger.
- **Signals**: route host/tab/tmux parameters, active Center Space, active pane, focused terminal element.

### S15 — Located panel receives a blue one-shot pulse

- **Level**: Bun test + E2E
- **Given**: a terminal pane that may already have green/amber agent-attention state.
- **When**: Resource Monitor navigation reaches the pane.
- **Then**: a separate semantic-info blue border pulse plays once and clears generation-safely; agent-attention state and filters are unchanged. Reduced-motion mode uses a brief non-animated blue border.
- **Signals**: terminal locate store generation, pane locate data/class, finite cleanup, unchanged attention store.

### S16 — Host trend and sortable hierarchy remain Computer-scoped

- **Level**: Bun test + E2E
- **Given**: repeated snapshots for one Computer followed by a scope switch.
- **When**: the popover is opened and sorting changes between Name, CPU, and Memory.
- **Then**: the Host chart contains at most 60 existing snapshot points, never mixes Computers, creates no extra subscription, and the hierarchy uses stable sorting with aligned CPU/memory columns.
- **Signals**: history ring contents, subscription count, sort output, visible chart/table controls.

### S17 — Project and Workspace totals expose exclusive process leaves

- **Level**: Rust unit/integration
- **Given**: one Project-direct terminal, one Project-direct cwd process, one Workspace terminal subtree, and one Workspace cwd process.
- **When**: Resource Monitor builds the hierarchy.
- **Then**: Project resources appear before Workspaces; session processes appear only inside their owning session; cwd processes appear only in the matching `other_processes`; memory and process count reconcile with the enclosing exclusive buckets.
- **Signals**: unique process membership, `direct_usage`, `other_usage`, Workspace usage, process-group usage.

### S18 — Cached Local Services ports annotate only matching attributed processes

- **Level**: Rust/Bun test + E2E
- **Given**: a cached all-projects Local Services snapshot containing attributed listeners, one stale PID/name mismatch, and one unrelated listener.
- **When**: the next Resource Monitor snapshot and hierarchy render.
- **Then**: matching attributed process rows show sorted local ports; stale/unrelated listeners do not attach; snapshot JSON contains no PID, command, absolute cwd, executable path, username, or environment; Resource Monitor performs no listener scan or HTTP probe.
- **Signals**: process rows/port chips, cache-only call count, serialized payload keys, Project resources/Workspace sections.

### S19 — Host detail metrics preserve explicit platform semantics

- **Level**: Rust/Bun test
- **Given**: a host sample with per-core CPU, RAM, cache/free information, and swap.
- **When**: the snapshot is serialized and validated.
- **Then**: each logical core is present once at 0–100%; headline used/total matches nested memory; used plus available equals total; swap used plus free equals total; cached may be unavailable; accounting identifies the platform formula.
- **Signals**: `cores`, nested memory DTO, accounting enum, invariant tests.

### S20 — Collapsed summaries and detail popovers remain smooth and usable

- **Level**: Bun test + E2E
- **Given**: a connected Resource Monitor receiving 2.5-second updates.
- **When**: the user expands Host/Atmos, changes sort, and opens CPU or memory details.
- **Then**: Host and Atmos start collapsed with right-aligned summaries; no adjacent separator lines appear; all interactive rows have inset rounded hover; sticky CPU/Memory headers sort; bars/chart ease between samples; reduced-motion disables metric animation; CPU detail shows every core and memory detail shows btop-style independent meters without closing the parent monitor.
- **Signals**: collapsed state, hover classes, sticky header, transform/chart animation settings, detail popover DOM/focus, 390px overflow.

### S21 — Resource pressure uses one animated Dither language

- **Level**: Bun/UI test + E2E
- **Given**: Host, core, memory, and history values crossing low, medium, and high thresholds.
- **When**: snapshots update.
- **Then**: every resource chart/meter uses the shared Token Usage Dither engine; meters retain a shallow full-length track; pressure colors resolve to success below 60%, warning at 60–79%, and destructive at 80%+; Host history uses compact Dither Area Growth fixed to 0–100; reduced-motion snaps without shimmer/morph.
- **Signals**: shared Dither props/domain, feature threshold tests, absence of Recharts/CSS width bars, stable data attributes.

### S22 — Disk capacity lists useful local volumes

- **Level**: Rust/Bun test + E2E
- **Given**: a primary root/system drive plus APFS Data, mounted disk images, removable, duplicate, zero-capacity, pseudo, tmpfs/overlay, hidden-system, and network mounts.
- **When**: Resource Monitor samples and opens Disk.
- **Then**: exactly one primary system disk appears; duplicate APFS/Data views, `/Volumes/*` images, removable and pseudo/network mounts are absent; total/used/available and percentage are consistent; Disk defaults collapsed and expands without running Disk Analyzer or collecting I/O.
- **Signals**: disk filter/cache tests, snapshot DTO/validator, Disk trigger/rows, no analyzer/IO calls, 390px layout.

## Performance & load budgets

- Interactive sampling interval is 2.5 seconds and never below 2 seconds.
- Idle Footer requests occur no more than once per 15 seconds per visible client.
- Hidden Footer with no active subscriber performs no resource sampling.
- Concurrent snapshot requests inside 500 ms share one collection.
- One collection performs at most one process refresh and one tmux pane-list command.
- A 100-session snapshot serializes below 256 KiB.
- Intermediate update loss is recoverable because every event is a complete snapshot.

## Regression checklist

- [ ] Local Services process stopping still uses the unchanged `ProcessSnapshot`.
- [ ] Simple PTY exit/resize/write behavior remains intact after retaining child PID.
- [ ] Tmux control-client lifecycle remains independent from pane PID discovery.
- [ ] Relay receives no global resource broadcast.
- [ ] Disconnect cleanup cannot abort another connection's subscription.
- [ ] Computer switching cannot display stale metrics from the prior scope.
- [ ] Desktop shell IPC is never called in hosted web or Relay mode.
- [ ] No PID, command line, path, username, or environment value crosses the wire.
- [ ] English labels are not forced to all caps except the `CPU` acronym.
- [ ] Both `en` and `zh` message files contain equivalent resource-monitor keys.

## Exploratory agent-browser checks

The test-run agent must load the installed Agent Browser skill before these checks.

1. Start API and web, enable the Resource Monitor Footer item, and open/close the popover repeatedly.
2. Run a CPU-heavy command in one attributed Workspace and confirm that Workspace becomes the dominant CPU row while the UI stays responsive.
3. Switch between local and Relay Computer scopes with the popover open; verify loading/stale labels and no old-host values.
4. Test light and dark themes with zero Projects, one Project, and enough Workspaces to require scrolling.
5. Trigger an unsupported/partial fixture if the runtime cannot naturally reproduce it; verify copy and recovery.
6. Inspect console and WS traffic for repeated subscriptions, failed cleanup, REST calls, or global update storms.

## Acceptance criteria

- [ ] All Must Have items have at least one passing scenario.
- [ ] Rust sampler, attribution, and terminal-root tests pass.
- [ ] WS subscription and disconnect cleanup are connection-scoped.
- [ ] api-types action/event extract and contract checks pass.
- [ ] Web Query isolation and Desktop-local gating tests pass.
- [ ] Electron collector and router smoke tests pass.
- [ ] No new REST endpoint, database migration, or crate exists.
- [ ] Scoped lint, typecheck, and existing tests pass.
- [ ] Agent-browser or equivalent manual UI smoke is recorded.
- [ ] Coverage Status records exact commands and remaining platform gaps.

## Manual verification steps

1. On macOS, compare host/Atmos memory directionally with Activity Monitor; exact equality is not expected because RSS and host-used memory differ.
2. Run one CPU-heavy process in a simple PTY and one in tmux; verify each appears under the expected context.
3. Connect to a real Relay Computer and confirm local Electron metrics are not merged into the remote hierarchy.
4. On Windows, verify host totals and graceful partial/unsupported attribution even when tmux is absent.

## Non-coverage

- Billing-grade process accounting, daemon re-parenting across every shell/runtime, and shared-memory proportional set size.
- Long-term history, alerts, enforcement, disk/network/GPU utilization, and mobile UI.
- Deterministic numeric comparison with external OS monitors; platform sampling windows differ.

## Coverage Status

_Last run: 2026-08-25 · Grok 4.6 + coordinator verification. Covered: S1, S3, S4, S6, S8, S10, S12, S14–S22. Partial: S2, S5, S7, S9, S11, S13. Targeted Rust/Bun/E2E green._

### Scenario status

- S1 — ✅ covered by `crates/core-engine/src/resource_metrics/mod.rs::first_sample_is_primed_and_satisfies_invariants` and `second_sample_reuses_primed_counters`. Behavioral host snapshot (positive totals, logical CPUs > 0, primed timestamp, current PID present).
- S2 — ◐ partial. CPU 0–100 / bytes / `pid > 0` covered by `normalize_process_cpu_uses_total_host_capacity` and first-sample invariants. Then also requires an exit-during-refresh omit without failing the host sample; there is no process-exit injection, so that race is a gap.
- S3 — ✅ covered by `crates/core-service/src/service/resource_monitor/attribution_tests.rs::exclusive_nested_deepest_and_server_excludes_workspace`.
- S4 — ✅ covered by `crates/core-service/src/service/terminal.rs::simple_pty_captures_nonzero_root_pid_without_session_detail_leak` and `terminal/types.rs::resource_root_keeps_pid_and_session_detail_does_not`.
- S5 — ◐ partial. Parser + exclusive claim covered by `duplicate_tmux_roots_claim_once`, `tmux::session::parse_pane_processes_*`, and `list_pane_processes_returns_tmux_error_or_empty_when_server_is_absent`. Then also requires one batched pane-list supplying both windows; no live `tmux list-panes -a` against a real server is asserted.
- S6 — ✅ covered by `project_workspace_and_unresolved_contexts` (plus cwd-boundary / missing-root / GUID-preference extras in the same file).
- S7 — ◐ partial. Connection isolation of `send_to` is proven by `apps/api/src/api/ws/manager.rs::send_to_does_not_deliver_to_a_second_connection`. Then also requires two live subscribed connections, one `resource_monitor_updated`, none on the other, and subscribe returning an immediate snapshot; there is no `WsMessageService` two-client subscribe/snapshot integration.
- S8 — ✅ covered by `apps/web/src/features/resource-monitor/lib/resource-monitor-query-events.test.ts` (scoped `setQueryData`, no reuse across instance/epoch/revision, nested payload reject). Query-options / API source-string tests remain structural support only.
- S9 — ◐ partial. Registry abort/unsubscribe/disconnect and `resource_monitor_abort_one_connection_leaves_the_other` prove map cleanup. Then also requires the subscription task gone and later interactive send count stable after popover close / unmount / WS disconnect; `WsMessageService::abort_resource_monitor_subscription` / `on_disconnect` and post-cleanup send counts are not exercised.
- S10 — ✅ covered by `apps/desktop-electron/src/metrics/desktop-shell-metrics.test.ts` (groups, KB→bytes, CPU normalize, no PID/name keys).
- S11 — ◐ partial. Hosted Footer + Host/Atmos and Desktop heading count 0 are in `e2e/tests/specs/APP-066_resource-monitor.e2e.ts`; Electron+local vs hosted/relay IPC gating is in `desktop-shell-metrics.test.ts`. Then also requires the Desktop shell section visible only in local Electron and Server hierarchy in all supported Computer modes; Electron-local render and Relay UI were not e2e'd.
- S12 — ✅ covered by `apps/web/src/features/resource-monitor/lib/resource-monitor-subscription.test.ts` (captured-scope unsubscribe, scope-change order, remount, disconnect skip).
- S13 — ◐ partial. State mapping / banners / stale-vs-partial are behavioral in `resource-monitor-ui-state.test.ts` and `resource-monitor-clock.test.ts`. Footer/popover Host+Atmos, close, and 390px no horizontal overflow are in the APP-066 e2e. Light/dark, many-Workspace scroll covering Footer, and unsupported/partial visual fixtures were not exercised in a browser.
- S14 — ✅ covered by default/extra/custom-tab/simple-PTY locator and navigation tests plus the real default-Space Playwright session-click journey. The production `useAppRouter.pushWorkspaceDeepLink` path preserves explicit cross-host tab/tmux parameters.
- S15 — ✅ covered by generation/timer/pane-match tests and Playwright observation of the target pane's finite `data-resource-locate-ring`; the same E2E verifies no synthetic agent-attention class is introduced.
- S16 — ✅ covered by 60-point scope-isolated history tests, stable hierarchy sort tests, scoped subscription tests, and Playwright Host metrics/sort/chart-or-collecting assertions on Chromium and mobile Chromium.
- S17 — ✅ covered by exclusive nested-session/Project-direct/Workspace-cwd process-leaf tests and memory/process-count reconciliation assertions in `attribution_tests.rs`.
- S18 — ✅ covered by fail-closed Local Services port-join/cache/privacy tests, recursive Web validator/process hierarchy tests, and a real Chromium E2E that starts an HTTP listener in a live terminal, force-refreshes Local Services, verifies the process/port row and expanded 390px layout, then deletes the Workspace and confirms the port closes.
- S19 — ✅ covered by 15 engine tests plus service/API/api-types serialization tests for per-core range/index, macOS/Linux/Windows/fallback accounting, headline/nested equality, used/available and swap invariants, and nullable cached memory.
- S20 — ✅ covered by motion/reduced-motion, collapse/default, focus/Escape, and validator tests plus Chromium/mobile E2E for default-collapsed Host/Atmos summaries, Host details, CPU/Memory popovers, sticky sort, and 390px layout.
- S21 — ✅ covered by shared Dither fixed-domain/morph tests and Resource Monitor threshold/theme/structure tests. Web source and E2E confirm Host history and meters use Dither and no Recharts/CSS width bar remains.
- S22 — ✅ covered by disk filter/dedup/sort/cap/cache/invariant Rust tests, strict DTO/validator tests, default-collapsed Disk UI tests, and Playwright expansion when local volumes are available.

### Structural-only (not treated as scenario proof)

- `resource-monitor-api.test.ts`, `use-resource-monitor.structural.test.ts`, `resource-monitor-event-bridge.structural.test.ts`, Footer/popover/source-string settings tests, API interval/ticker/serialize unit checks.

### Commands

```bash
cargo test -p api send_to_does_not_deliver -- --nocapture
cargo test -p api resource_monitor -- --nocapture
cargo test -p core-engine resource_metrics -- --nocapture
cargo test -p core-engine parse_pane_processes -- --nocapture
cargo test -p core-engine list_pane_processes -- --nocapture
cargo test -p core-service resource_monitor -- --nocapture
cargo test -p core-service simple_pty_captures -- --nocapture
cargo test -p core-service resource_root_keeps_pid -- --nocapture
# all green

bun test apps/web/src/features/resource-monitor \
  apps/web/src/api/ws/resource-monitor-api.test.ts \
  apps/web/src/providers/app/__tests__/resource-monitor-event-bridge.structural.test.ts \
  apps/web/src/features/settings/store/layout-settings-store.resource-monitor.test.ts \
  apps/web/src/features/settings/components/__tests__/layout-settings-resource-monitor.test.ts \
  apps/desktop-electron/src/metrics/desktop-shell-metrics.test.ts \
  packages/api-types/src/ws/actions.test.ts \
  packages/api-types/src/ws/events.test.ts
# 64 pass / 0 fail

cargo clippy -p api --tests -- -D warnings
# green

bun run --cwd e2e lint
# green

bun run --cwd e2e install:browsers
# installed playwright chromium v1234 (was missing headless-shell-1234)

E2E_REUSE_SERVER=1 bun run --cwd e2e test tests/specs/APP-066_resource-monitor.e2e.ts
# 2 passed (chromium + mobile-chromium), 7.5s

just typecheck
# web/e2e/desktop-electron/api-types green
# unrelated fail: packages/ui DrawerContentBare TS2883 (DialogContentProps portability)
# unrelated fail: packages/relay src/server-hub.ts TS2741 missing PT_DESIGN_ROOM on ServerHubEnv

just test
# APP-066 targeted tests remain green; the full run failed on unrelated existing/environment-sensitive suites:
# desktop macOS icon Python assertions, the real browser-cookie helper payload,
# Bun @workspace/ui alias resolution, stale PT Design source-string assertions,
# and vendor serve-sim native lipo architecture checks.
```

`just test-e2e -- tests/specs/APP-066_resource-monitor.e2e.ts` forwarded an extra `--` and launched the full Playwright suite against the missing v1234 browser; after `install:browsers`, the targeted file command above is the passing run. `just test` was run afterward and failed only on the unrelated suites listed above. `just test-e2e-smoke` was not re-run.

### Exploratory agent-browser

- CLI: `agent-browser 0.26.0` present. Local web `http://localhost:3030/` and API `:30303` were already listening.
- Session `app066` opened `/` (Welcome / Local Atmos Computer). Connect (`@e9`) did not enter the workbench; page stayed on the Connect gate after retry. No Footer/popover observations were taken.
- Result: **not_run** for TEST.md checks 1–6. Reason: agent-browser could not pass the Connect gate on the live Welcome page (no `atmos_onboarding_done` seed / `connectLocalComputer` helper). Playwright e2e already covers Footer open/close/Host/Atmos/overflow on the same local API+web. CPU-heavy Workspace, Relay switch, light/dark, and WS-storm inspection remain manual.

### Remaining gaps

- S2: no exit-during-refresh injection (why partial).
- S5: no live batched `tmux list-panes -a` (why partial).
- S7: no two-live-WS subscribe + immediate snapshot + scoped `resource_monitor_updated` (why partial; `send_to` isolation only).
- S9: no `WsMessageService` on_disconnect / post-cleanup send-count (why partial; registry only).
- S11: no Electron-local Desktop render or Relay UI e2e (why partial; hosted Footer + IPC gate only).
- S13: no light/dark, many-Workspace scroll, or unsupported/partial visual browser pass.
- Agent-browser / Activity Monitor / real Relay Computer remain manual (TEST.md Manual verification).
- Windows host sampling not executed in this run (macOS).
- Root typecheck still red on `packages/ui` `DrawerContentBare` and `packages/relay` `PT_DESIGN_ROOM` — unrelated to APP-066.
- Root `just test` remains red on unrelated desktop icon/cookie, Bun alias, PT Design structural, and vendor native-architecture checks.

### Follow-up verification · 2026-08-25

- macOS Host memory now follows btop's Mach `(active + wired) × page_size` formula. `cargo test -p core-engine resource_metrics` covers the page formula, overflow/error fallback, host bounds, and unchanged process RSS; 9 tests passed.
- Resource Monitor session rows now join live terminal titles by `session_id`. `bun test apps/web/src/features/resource-monitor` covers numeric tmux fallback, dynamic title, agent + OSC title, custom title priority, and missing-live-title behavior; 50 tests passed.
- `cargo clippy -p core-engine --all-targets -- -D warnings`, Web typecheck, and changed-feature lint passed.
- Activity Monitor + Raycast redesign: `bun test` ran 138 resource/navigation/workspace tests with 0 failures; Web typecheck and changed-file lint passed.
- `E2E_REUSE_SERVER=1 bun run --cwd e2e test tests/specs/APP-066_resource-monitor.e2e.ts` passed 4 tests: Host/sort/chart layout plus a real default-Space terminal locate/focus/blue-pulse journey on Chromium and mobile Chromium. Each test-created Workspace is deleted and verified absent in `finally`.
- Extra Center Space and custom Terminal tab routing are deterministic Bun coverage; the committed E2E intentionally does not manufacture those UI layouts.
- M10 process detail: `cargo test -p core-service resource_monitor` (30), `cargo test -p core-service local_services` (22), `@atmos/api-types` (17), and Resource Monitor Web tests (118) passed.
- S18 Playwright passed on Chromium; the live-listener case is intentionally skipped on mobile Chromium while the existing Host and Terminal locate journeys still run there.
- M11 Host details: `cargo test -p core-engine resource_metrics` (15), `cargo test -p core-service resource_monitor` (34), API (17), api-types (18), and Resource Monitor Web tests (126) passed.
- S20 Playwright passed on Chromium and mobile Chromium; the parent Resource Monitor remains open while CPU/Memory detail popovers open and close.
- Dither/Disk verification: shared UI (28), engine (26), service (36), API (17), api-types (19), and Resource Monitor Web (142) tests passed; APP-066 Playwright remained green.

### Test-run files changed

- `apps/api/src/api/ws/manager.rs` (#[cfg(test)] two-conn `send_to`)
- `apps/api/src/api/ws/subscription.rs` (#[cfg(test)] two-conn abort isolation)
- `e2e/tests/specs/APP-066_resource-monitor.e2e.ts` (new)
- this Coverage Status block only

No production, PRD, TECH, BRAINSTORM, or PROGRESS edits. No commit/push.
