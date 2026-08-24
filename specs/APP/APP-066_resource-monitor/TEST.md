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

> Filled after implementation by `atmos-specs-test-run`. Include exact automated tests, commands, agent-browser prompts/results, and remaining macOS/Linux/Windows gaps.
