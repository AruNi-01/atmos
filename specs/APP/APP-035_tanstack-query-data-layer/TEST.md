# TEST · APP-035: TanStack Query Data Layer

> Test Plan · how we verify consistent, connection-safe server-state behavior across the Atmos web app. References [PRD APP-035](./PRD.md) and [TECH APP-035](./TECH.md).

## Test strategy

TanStack Query semantics are primarily deterministic client behavior, so Bun unit/integration tests are the merge-blocking proof for key scope, deduplication, retained data, mutation rollback, event invalidation, target switching, and reconnect policy. Tests use an isolated QueryClient and mocked existing REST/WS clients; they do not add test-only backend routes.

Playwright provides a thin stateful cross-layer check that the provider, WebSocket transport, and migrated pilot surfaces still work in the built app. Agent Browser is exploratory proof for loading continuity, stale-state clarity, and switch/reconnect UX; it does not replace executable assertions.

- **Bun unit:** QueryClient defaults, key factories, scope transitions, operation classification, and event policy.
- **Bun integration:** concurrent consumers, mutation lifecycle, connection switching, reconnect, provider wiring, and feature pilot hooks.
- **Playwright E2E:** one stable local/Project journey plus a target-switch journey when the fixture can provide two distinguishable Computers.
- **Exploratory agent-browser:** perceived loading flashes, background-refresh indicators, errors, and visible stale-data leaks.
- **Manual-only:** none planned; Desktop/Relay runtime gaps must be recorded rather than claimed as passing.

## Coverage map

Every Must Have has a normal path and an edge/failure path.

| PRD item | Happy-path scenarios | Edge/failure scenarios |
|----------|----------------------|------------------------|
| M1 Explicit server-state boundary | S1 | S2 |
| M2 Consistent cached reads | S3 | S4 |
| M3 Mutation freshness | S5 | S6 |
| M4 WebSocket push integration | S7 | S8 |
| M5 Connection/identity isolation | S9 | S10, S11 |
| M6 Reconnect/retry safety | S12 | S13 |
| M7 Consistent user feedback | S4, S5 | S6, S13 |
| M8 Incremental migration/no regression | S14 | S15 |
| M9 Transport preservation | S2, S16 | S15 |
| M10 Auditable coverage | S1, S14 | S17 |
| N1 Cross-app alignment | S18 (optional) | S17 |
| N2 Development diagnostics | Deferred pending review | S16 guards production exposure |
| N3 Measured baselines | S19 (optional) | Not merge-blocking until baseline tooling exists |

## Execution map

All statuses remain `planned` until `atmos-specs-test-run` implements and executes coverage.

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Bun unit | `bun test` | `bun test apps/web/src/api/query` | migration inventory + classification fixtures | all pilot/domain operations classified; every included query has a key root | planned |
| S2 | Bun unit + static audit | `bun test`, `rg` | `bun test apps/web/src/api/query` plus scoped source audit | stream/client-state exclusion list | terminal/Agent streams have no Query wrappers; no new transport duplicate | planned |
| S3 | Bun integration | `bun test` | `bun test apps/web/src/providers/app apps/web/src/features/settings` | isolated QueryClient + deferred WS/REST response + two consumers | one underlying request; both consumers receive same result | planned |
| S4 | Bun integration | `bun test` | `bun test apps/web/src/features/settings apps/web/src/providers/app` | successful cached value followed by slow/error refresh | prior value remains visible; fetching/error state observable; retry remains available | planned |
| S5 | Bun integration | `bun test` | `bun test apps/web/src/features/settings apps/web/src/features/usage` | two consumers + successful mutation | initiating control pending; all affected cache consumers converge | planned |
| S6 | Bun integration | `bun test` | `bun test apps/web/src/features/settings` | optimistic value + rejected mutation + later query response | rollback restores authoritative value; error state shown; no stale late overwrite | planned |
| S7 | Bun unit/integration | `bun test` | `bun test apps/web/src/features/usage` | complete `usage_overview_updated` payload | one subscription; `setQueryData` updates all consumers without network request | planned |
| S8 | Bun unit/integration | `bun test` | `bun test apps/web/src/providers/app apps/web/src/features/automations` | partial event and output-chunk event | partial event invalidates correct root; stream chunk never replaces snapshot | planned |
| S9 | Bun integration | `bun test` | `bun test apps/web/src/app-shell/bootstrap apps/web/src/api/query` | Computer A/B scopes with distinct Project/Git data | A requests cancelled/removed; B key differs; no A value readable under B | planned |
| S10 | Bun integration | `bun test` | `bun test apps/web/src/features/connection apps/web/src/api/query` | same Relay URL with changed token/secret revision | Relay cache removed; auth revision changes; secrets absent from keys | planned |
| S11 | Bun integration | `bun test` | `bun test apps/web/src/app-shell/bootstrap apps/web/src/api/query` | A request resolves after switch to B | late A response cannot populate or render in B scope | planned |
| S12 | Bun integration | `bun test` | `bun test apps/web/src/providers/app apps/web/src/api/query` | same-target disconnect/reconnect with active and inactive keys | successful data retained; selected active roots invalidate once; epoch unchanged | planned |
| S13 | Bun integration | `bun test` | `bun test apps/web/src/providers/app apps/web/src/api/query` | prolonged disconnected/reconnecting WS and rejected request | query disabled while unusable; retry count bounded; no unhandled rejection/storm | planned |
| S14 | Bun integration | `bun test` | scoped pilot domain suites | compatibility → cutover fixtures | each consumer has one owner; legacy snapshot/cache absent after cleanup | planned |
| S15 | E2E | Playwright | `just test-e2e -- tests/specs/APP-035_tanstack-query-data-layer.e2e.ts` | stateful local app + seeded Project/Workspace | app boots, pilot data renders, route navigation/reload succeeds, no console/page errors | planned |
| S16 | Type/static regression | typecheck/lint | `bun --filter web typecheck` and `bun --filter web lint` | production web build graph | provider/client modules typecheck; no production Devtools import; no raw feature fetch added | planned |
| S17 | Spec review | script/audit | `python3` inventory validation implemented by test-run | TECH migration matrix and source export inventory | every migrated export has class/owner/status; unknown/missing rows fail validation | planned |
| S18 | Bun unit (optional N1) | `bun test` | `bun test apps/web/src/api/query apps/mobile/src/providers` | equivalent Computer/Relay identities | web/mobile keys follow documented identity principles without sharing secrets | planned |
| S19 | Instrumented E2E/exploratory (optional N3) | Playwright + agent-browser | representative pilot journeys | cold navigation, warm revisit, concurrent consumers | before/after request count and loading-transition evidence recorded | planned |

## Scenarios

### S1 — Every migrated operation has an explicit class

- **Level:** Bun unit / inventory validation
- **Given:** the committed migration inventory and the exported operations in a domain entering implementation.
- **When:** inventory validation runs.
- **Then:** each operation is classified as query, mutation, event, stream, client state, deferred, or excluded; every Query-owned resource names a root key and legacy owner.
- **Signals:** no missing operation ids, duplicate ownership, or unclassified entries.

### S2 — Streams and commands remain outside Query

- **Level:** Bun unit + static audit
- **Given:** terminal PTY, Agent Chat socket, automation output, LLM/Git chunk events, connection bootstrap, and OS-open operations.
- **When:** the APP-035 wrappers and hooks are audited.
- **Then:** no stream is represented as a query snapshot, and no duplicate REST/WS route exists solely for Query.
- **Signals:** exclusion assertions pass; source diff contains no new backend endpoint/action for this spec.

### S3 — Concurrent equivalent reads deduplicate

- **Level:** Bun integration
- **Given:** two mounted consumers using the same Computer scope and resource key while the mocked request is unresolved.
- **When:** both request the resource concurrently.
- **Then:** the transport adapter runs exactly once and both consumers receive the same successful snapshot.
- **Signals:** request call count `1`, identical settled data, no duplicate loading lifecycle.

### S4 — Background refresh retains useful data

- **Level:** Bun integration
- **Given:** a successful cached pilot snapshot.
- **When:** it becomes stale and a slow refresh begins, then either succeeds or fails.
- **Then:** the previous snapshot remains available; background-fetch state is distinct from initial loading; failure with prior data exposes retry without replacing the surface with an empty state.
- **Signals:** data remains non-null during fetch/failure, `isFetching` changes, retry invokes one new request.

### S5 — Successful mutation refreshes every affected consumer

- **Level:** Bun integration
- **Given:** two consumers of a settings/usage resource and a mutation that changes it.
- **When:** the mutation succeeds.
- **Then:** the initiating control reports pending then settled, and both consumers converge through authoritative `setQueryData` or targeted invalidation without manual refresh.
- **Signals:** mutation state sequence, affected key list, final values in both consumers.

### S6 — Failed optimistic mutation rolls back safely

- **Level:** Bun integration
- **Given:** an authoritative snapshot and a deterministic optimistic mutation.
- **When:** the request fails after the optimistic value is shown.
- **Then:** the prior snapshot is restored, the initiating surface exposes a recoverable error, and a late pre-mutation response cannot overwrite newer authoritative state.
- **Signals:** rollback value, error state, mutation/request version ordering.

### S7 — Complete WebSocket event patches cache

- **Level:** Bun unit/integration
- **Given:** one domain event subscription and a complete authoritative usage payload.
- **When:** `usage_overview_updated` arrives.
- **Then:** the matching cache is patched once and all subscribers render the event value without an extra fetch.
- **Signals:** one registered listener, one `setQueryData`, zero additional transport calls.

### S8 — Partial and streaming events cannot corrupt snapshots

- **Level:** Bun unit/integration
- **Given:** a partial freshness event and an `automation_run_output` or generation chunk.
- **When:** each event arrives.
- **Then:** the partial event invalidates only the intended resource root; the chunk updates its stream/progress owner and never replaces Query snapshot data.
- **Signals:** exact invalidated keys, unchanged snapshot for chunk events, local stream buffer update.

### S9 — Target switch isolates Computer data

- **Level:** Bun integration
- **Given:** cached Project, Git, and system data for Computer A.
- **When:** the active target changes to Computer B.
- **Then:** Computer queries are cancelled and removed before B renders; the centralized epoch increments; B requests use a distinct scope.
- **Signals:** cancelled query list, empty old Computer root, changed key/epoch, B-only rendered fixture.

### S10 — Credential change isolates Relay data

- **Level:** Bun integration
- **Given:** cached Relay data for one URL and authentication revision.
- **When:** access token, Relay secret, or identity-bearing Relay URL changes.
- **Then:** auth revision increments, Relay and Computer snapshots are cleared as designed, and no credential value appears in a query key or log.
- **Signals:** revision/key changes, removed cache roots, serialized keys contain no fixture secret.

### S11 — Late response from the previous target is ignored

- **Level:** Bun integration
- **Given:** Computer A has an unresolved query and the app switches to Computer B.
- **When:** A's response resolves after B becomes active.
- **Then:** A's result cannot populate B's key or appear in a B consumer.
- **Signals:** B cache/render remains B-only; old request completion creates no active data.

### S12 — Same-target reconnect refreshes once without clearing

- **Level:** Bun integration
- **Given:** successful cached values, active/inactive queries, and a transient disconnect from the same Computer.
- **When:** the WebSocket returns to `connected`.
- **Then:** connection epoch remains stable, cached data stays visible, reconnect-sensitive active roots invalidate once, and inactive roots do not all refetch immediately.
- **Signals:** unchanged epoch/data, invalidation count, bounded request counts per active key.

### S13 — Prolonged disconnect has bounded retries

- **Level:** Bun integration
- **Given:** the WebSocket reports `disconnected` or `reconnecting`.
- **When:** a migrated component mounts and the reconnect attempts fail.
- **Then:** its WS query remains disabled until usable, no independent Query retry loop fights the socket reconnect loop, and the UI exposes a recoverable disconnected/stale state.
- **Signals:** zero request calls while disabled, retry count at or below configured bound, no unhandled rejection.

### S14 — Domain cutover has one server-state owner

- **Level:** Bun integration / source audit
- **Given:** a domain marked `cutover` or `cleaned` in the migration matrix.
- **When:** its consumers, stores, caches, polling timers, and event subscriptions are inspected and tested.
- **Then:** Query is the only snapshot owner; any remaining Zustand state is client/orchestration state; one shared event subscription drives invalidation.
- **Signals:** no duplicated snapshot fields/cache map, no duplicate transport calls, legacy parity tests moved to the new owner.

### S15 — Migrated app boots and navigates end to end

- **Level:** E2E (Playwright)
- **Given:** the stateful E2E server, a connected local Computer, and a seeded Project/Workspace.
- **When:** the user opens the app, visits a migrated pilot surface, navigates to a Project context, leaves, returns, and reloads.
- **Then:** data renders through the existing transport, navigation does not crash, and no console/page error is captured.
- **Signals:** accessible pilot content, stable Project route, fixture identity, clean console/page-error collector.

### S16 — Production graph remains clean

- **Level:** Type/static regression
- **Given:** the completed foundation or domain cutover.
- **When:** web typecheck/lint and a scoped source audit run.
- **Then:** provider boundaries compile, feature code uses API clients rather than new raw fetch calls, no production Query Devtools ship, and no test-only API exists.
- **Signals:** zero command errors and zero prohibited imports/routes in changed files.

### S17 — Inventory drift is detected

- **Level:** Spec/source validation
- **Given:** a migrated API module gains, removes, or renames an exported operation.
- **When:** the inventory validation runs.
- **Then:** the check fails until the operation has a classification, owner, phase, and invalidation policy or explicit exclusion.
- **Signals:** deterministic missing-entry failure followed by pass after inventory update.

### S18 — Web/mobile identity conventions align

- **Level:** Bun unit (optional N1)
- **Given:** equivalent Relay URL, auth revision, and selected Computer identities.
- **When:** web and mobile key-scope fixtures are compared.
- **Then:** both isolate Relay auth and Computer identity using documented principles, without requiring identical arrays or a shared runtime package.
- **Signals:** convention assertions pass; keys contain no secrets.

### S19 — Representative UX baseline improves

- **Level:** Instrumented E2E + exploratory (optional N3)
- **Given:** the agreed pilot journeys measured before and after cutover.
- **When:** cold load, warm revisit, concurrent mount, mutation, and reconnect are exercised.
- **Then:** evidence records fewer duplicate requests and no warm-refresh empty flash without introducing stale-target rendering.
- **Signals:** request counters, loading-state timeline, screenshot/video notes, console/network observations.

## Performance & load budgets

- Two or more concurrent consumers of one key issue exactly one underlying request.
- A target switch exposes zero snapshots from the old Computer after the switch lifecycle begins.
- A same-target reconnect issues at most one immediate refetch per active invalidated key.
- Queries issue zero WebSocket requests while connection state is not `connected`.
- Event subscription count is one per migrated domain, not one per consumer.
- Mutation retries are zero unless a domain documents an explicit exception.
- No absolute network latency target is set by this frontend migration; request duration depends on existing server operations.

## Regression checklist

- [ ] Local browser, Desktop static app, and Relay modes still resolve their existing REST/WS targets.
- [ ] `wsRequest` and main WebSocket reconnect behavior remain WebSocket-first.
- [ ] Terminal PTY and Agent Chat sockets are unchanged.
- [ ] APP-034 terminal LRU/TTL and mounted-runtime behavior remain unchanged.
- [ ] Editor dirty buffers, navigation, and per-instance UI preferences survive domain migrations.
- [ ] Project/Workspace setup and delete progress still render and notify correctly.
- [ ] Settings mutation race behavior is preserved before removing `settingsBootstrapCache`.
- [ ] Git refresh cannot display results from another Computer or repository.
- [ ] Query keys and logs contain no credentials or sensitive payloads.
- [ ] No direct feature `fetch` or duplicate backend endpoint is added.
- [ ] Existing E2E smoke remains green.

## Exploratory agent-browser checks

The test-run agent must load the installed Agent Browser instructions or run `agent-browser skills get core --full` before these checks. Record evidence in `Coverage Status`; convert stable regressions into the smallest Playwright test.

1. From a fresh load, open each pilot surface and distinguish initial loading, empty, and error states.
2. Revisit a recently loaded pilot surface and confirm previous data remains visible during background refresh without a full empty flash.
3. Trigger a successful and a failed pilot mutation; confirm pending and recovery feedback is local, understandable, and not duplicated by unnecessary success toasts.
4. Disconnect and reconnect the active Computer; confirm cached data remains visibly stale/refreshing as appropriate and converges after reconnect.
5. Switch between two Computers with distinguishable Project names; confirm no old-target Project, Git, settings, usage, or diagnostics appear under the new target.
6. Watch console and network/WS activity for repeated requests, event-listener duplication, unhandled rejections, and retry loops.

## Acceptance criteria

- [ ] Every M1–M10 row has passing happy-path and edge/failure coverage at its declared level.
- [ ] S3 proves exact concurrent-request deduplication.
- [ ] S5–S8 prove mutation and event freshness without duplicate cache ownership.
- [ ] S9–S13 prove target/auth isolation and bounded reconnect behavior.
- [ ] All domains marked `cleaned` pass S14 and have no legacy snapshot cache.
- [ ] Stateful APP-035 Playwright coverage and existing E2E smoke pass for implemented pilot surfaces.
- [ ] `bun --filter web typecheck`, scoped web Bun tests, and affected lint checks pass.
- [ ] No new backend route/action, persistent query cache, production Devtools, or Query wrapper around an excluded stream exists.
- [ ] Agent-browser exploratory results are recorded for each user-visible domain cutover.
- [ ] `atmos-specs-test-run` updates Coverage Status with exact commands, artifacts, and remaining gaps.

## Manual verification steps

None are required by design. If two-Computer Relay or Tauri fixtures cannot be automated in the available environment, record those scenarios as `not_run` with the concrete environment limitation; do not substitute an unrecorded manual claim.

## Non-coverage

- Backend business logic and protocol correctness, because APP-035 introduces no backend behavior.
- Network latency or server performance improvements; Query can deduplicate and schedule requests but does not make an individual operation faster.
- Full E2E coverage for every migrated operation; deterministic cache semantics remain Bun-level.
- Persistent/offline query cache, which is explicitly out of scope.
- Mobile UI behavior changes; N1 checks conventions only.
- Query Devtools behavior until N2 is approved.
- Deferred domains before their implementation phase begins.

## Coverage Status

> Filled after implementation by `atmos-specs-test-run`. Include exact Bun/typecheck/lint/E2E commands, scenario status, agent-browser prompts/results and artifacts, plus every environment or deferred-domain gap.
