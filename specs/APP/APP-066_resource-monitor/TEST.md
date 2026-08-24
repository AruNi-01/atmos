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

_Last run: 2026-08-24 · Grok 4.6 · `atmos-specs-test-run` (status recalibrated to Then signals). Covered: S1, S3, S4, S6, S8, S10, S12. Partial: S2, S5, S7, S9, S11, S13. Targeted Rust/Bun/E2E green. Root `just typecheck` still fails two unrelated packages._

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

### Test-run files changed

- `apps/api/src/api/ws/manager.rs` (#[cfg(test)] two-conn `send_to`)
- `apps/api/src/api/ws/subscription.rs` (#[cfg(test)] two-conn abort isolation)
- `e2e/tests/specs/APP-066_resource-monitor.e2e.ts` (new)
- this Coverage Status block only

No production, PRD, TECH, BRAINSTORM, or PROGRESS edits. No commit/push.
