# TEST · APP-035: TanStack Query Data Layer

> Test Plan · how we verify consistent, connection-safe server-state behavior across the Atmos web app. References [PRD APP-035](./PRD.md) and [TECH APP-035](./TECH.md).

## Test strategy

TanStack Query semantics are primarily deterministic client behavior, so Bun unit/integration tests are the merge-blocking proof for key scope, deduplication, retained data, mutation rollback, event invalidation, target switching, and reconnect policy. Tests use an isolated QueryClient and mocked existing REST/WS clients; they do not add test-only backend routes.

Playwright provides a thin stateful cross-layer check that the provider, WebSocket transport, and migrated pilot surfaces still work in the built app. Agent Browser is exploratory proof for loading continuity, stale-state clarity, and switch/reconnect UX; it does not replace executable assertions.

- **Bun unit:** QueryClient defaults, key factories, scope transitions, operation classification, and event policy.
- **Bun integration:** concurrent observers, mutation lifecycle, connection switching, reconnect, provider wiring, and feature pilot hooks.
- **Bun component:** `happy-dom` + React `createRoot` / `act` verifies the visible initial-loading, empty, background-refresh, error, retry, and mutation-pending states without adding a second test framework.
- **Playwright E2E:** one stable local/Project journey and one two-target isolation journey; environments unable to provision the latter record it as `not_run`, never as passed.
- **Exploratory agent-browser:** perceived loading flashes, background-refresh indicators, errors, and visible stale-data leaks.
- **Manual-only:** none planned; Desktop/Relay runtime gaps must be recorded rather than claimed as passing.

### Test harness contract

- Cache semantics use an isolated `QueryClient` plus `QueryObserver`, `InfiniteQueryObserver`, or direct `fetchQuery` calls. Tests do not need React mounts merely to prove deduplication, invalidation, or retry.
- Visible-state scenarios use the repository's existing `happy-dom` + `createRoot` + `act` pattern with `QueryClientProvider`; do not introduce React Testing Library solely for this spec.
- Test clients set `retry: false` and `gcTime: 0` unless retry/garbage collection is the behavior under test.
- Mock existing API module functions with deferred promises and call counters. Do not mock private Query internals.
- Connection fixtures define Computer A/B, centralized epoch, Relay auth revision, and Relay session revision.

## Coverage map

Every Must Have has a normal path and an edge/failure path.

| PRD item | Happy-path scenarios | Edge/failure scenarios |
|----------|----------------------|------------------------|
| M1 Explicit server-state boundary | S1, S33 | S2 |
| M2 Consistent cached reads | S3 | S4 |
| M3 Mutation freshness | S5 | S6 |
| M4 WebSocket push integration | S7 | S8 |
| M5 Connection/identity isolation | S9 | S10, S11 |
| M6 Reconnect/retry safety | S12, S32 | S13 |
| M7 Consistent user feedback | S20 | S21, S29 |
| M8 Incremental migration/no regression | S14, S15 | S22, S23, S30, S31 |
| M9 Transport preservation | S2 | S16 |
| M10 Auditable coverage | S1, S14 | S17 |
| M11 Measured rollout | S19 | S28 |
| N1 Cross-app alignment | S18 (optional) | S17 |
| N2 Development diagnostics | Deferred | S16 guards production exposure |

## Execution map

All statuses remain `planned` until `atmos-specs-test-run` implements and executes coverage.

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Bun unit | `bun test` | `bun test apps/web/src/api/query` | migration inventory + classification fixtures | all pilot/domain operations classified; every included query has a key root | planned |
| S2 | Bun unit + static audit | `bun test` | `bun test apps/web/src/api/query/transport-boundary.test.ts` | typed migrated-file list + stream/client-state exclusions | migrated feature modules use API adapters; terminal/Agent streams have no Query wrappers | planned |
| S3 | Bun integration | `bun test` | `bun test apps/web/src/providers/app apps/web/src/features/settings` | isolated QueryClient + deferred WS/REST response + two `QueryObserver`s | one underlying request; both observers receive same result | planned |
| S4 | Bun integration | `bun test` | `bun test apps/web/src/features/settings apps/web/src/providers/app` | successful cached value followed by slow/error refresh | prior value remains visible; fetching/error state observable; retry remains available | planned |
| S5 | Bun integration | `bun test` | `bun test apps/web/src/features/settings apps/web/src/features/usage` | two consumers + successful mutation | initiating control pending; all affected cache consumers converge | planned |
| S6 | Bun integration | `bun test` | `bun test apps/web/src/features/settings` | optimistic value + rejected mutation + later query response | rollback restores authoritative value; error state shown; no stale late overwrite | planned |
| S7 | Bun unit/integration | `bun test` | `bun test apps/web/src/features/usage/lib apps/web/src/providers/app` | complete `usage_overview_updated` payload | one subscription; `setQueryData` updates all consumers without network request | planned |
| S8 | Bun unit/integration | `bun test` | `bun test apps/web/src/providers/app apps/web/src/features/automations` | partial event and output-chunk event | partial event invalidates correct root; stream chunk never replaces snapshot | planned |
| S9 | Bun integration | `bun test` | `bun test apps/web/src/app-shell/bootstrap apps/web/src/api/query` | Computer A/B scopes with distinct Project/Git data | A requests cancelled/removed; B key differs; no A value readable under B | planned |
| S10 | Bun integration | `bun test` | `bun test apps/web/src/features/connection apps/web/src/api/query` | same Relay URL with changed token/secret revision | Relay cache removed; auth revision changes; secrets absent from keys | planned |
| S11 | Bun integration | `bun test` | `bun test apps/web/src/app-shell/bootstrap apps/web/src/api/query` | A request resolves after switch to B | late A response cannot populate or render in B scope | planned |
| S12 | Bun integration | `bun test` | `bun test apps/web/src/providers/app apps/web/src/api/query` | same-target disconnect/reconnect with active and inactive keys | successful data retained; selected active roots invalidate once; epoch unchanged | planned |
| S13 | Bun integration | `bun test` | `bun test apps/web/src/providers/app apps/web/src/api/query` | prolonged disconnected/reconnecting WS and rejected request | query disabled while unusable; retry count bounded; no unhandled rejection/storm | planned |
| S14 | Bun integration | `bun test` | `bun test apps/web/src/features/settings apps/web/src/features/usage apps/web/src/shared/hooks` | compatibility → cutover fixtures | each pilot consumer has one owner; legacy snapshot/cache absent after cleanup | planned |
| S15 | E2E | Playwright | `just test-e2e -- tests/specs/APP-035_tanstack-query-data-layer.e2e.ts` | stateful local app + seeded Project/Workspace | app boots, pilot data renders, route navigation/reload succeeds, no console/page errors | planned |
| S16 | Type/static regression | typecheck/lint | `bun --filter web typecheck` and `bun --filter web lint` | production web build graph | provider/client modules typecheck; no production Devtools import; no raw feature fetch added | planned |
| S17 | Bun unit | `bun test` | `bun test apps/web/src/api/query/api-operation-inventory.test.ts` | typed `apiOperationInventory` + affected module export fixture | every migrated export has class/owner/phase; missing/duplicate/invalid rows fail | planned |
| S18 | Bun unit (optional N1) | `bun test` | `bun test apps/web/src/api/query apps/mobile/src/providers` | equivalent Computer/Relay identities | web/mobile keys follow documented identity principles without sharing secrets | planned |
| S19 | Instrumented E2E/exploratory | Playwright + agent-browser | APP-035 pilot baseline method in Coverage Status | cold navigation, warm revisit, concurrent consumers | before/after request count and loading-transition evidence recorded | planned |
| S20 | Bun component | `bun test` | `bun test apps/web/src/features/settings apps/web/src/features/atmos-computer apps/web/src/app-shell apps/web/src/shared/hooks apps/web/src/providers/app` | happy-dom system/settings/usage components + initial/empty/success fixtures | initial loading, empty, ready, and mutation-pending states are visibly distinct | planned |
| S21 | Bun component | `bun test` | `bun test apps/web/src/features/settings apps/web/src/features/atmos-computer apps/web/src/app-shell apps/web/src/shared/hooks apps/web/src/providers/app` | system/settings/usage cached data + slow/failing refresh | prior data stays visible; refresh/error/retry affordances are accessible; no success toast duplication | planned |
| S22 | E2E | Playwright | `just test-e2e -- tests/specs/APP-035_tanstack-query-data-layer.e2e.ts` | two distinguishable target fixtures | switch shows only target B identity/data; no console/page errors | planned |
| S23 | E2E + Desktop smoke | Playwright / GUI smoke | `just test-e2e -- tests/specs/APP-035_tanstack-query-data-layer.e2e.ts`; Desktop command from repo guide | `e2e/fixtures/query-relay.ts` existing-route stubs + Tauri runtime | existing target resolution and pilot reads work in Relay/Desktop; gaps are explicit | planned |
| S24 | Bun integration | `bun test` | `bun test apps/web/src/features/settings` | settings bootstrap request delayed across successful mutation | late bootstrap response preserves newer mutated section and fills untouched sections | planned |
| S25 | Bun unit/integration | `bun test` | `bun test apps/web/src/providers/app apps/web/src/features/connection` | visibility/online and WS state transitions | focus/online managers update; only WebSocketProvider calls connect; one reconnect invalidation | planned |
| S26 | Bun integration | `bun test` | `bun test apps/web/src/features/connection apps/web/src/api/query` | logout, display-name-only edit, selected-target edit, Relay session token rotation | logout clears; non-identity edit does not bump auth; session rotation changes Computer scope | planned |
| S27 | Bun table test | `bun test` | `bun test apps/web/src/providers/app/server-state-event-bridge.test.ts` | every migrated event policy row | complete events patch; partial events invalidate; streams stay local; one subscription/domain | planned |
| S28 | Instrumented regression | Bun + Playwright | `bun test apps/web/src/api/query/baseline-budget.test.ts`; APP-035 E2E `@baseline` journey | recorded pre-cutover baseline + post-cutover counters/timeline | regression fixture fails on duplicate-count increase, warm empty flash, stale target, or missing evidence | planned |
| S29 | Bun component | `bun test` | `bun test apps/web/src/features/settings apps/web/src/features/atmos-computer apps/web/src/app-shell apps/web/src/shared/hooks apps/web/src/providers/app` | each applicable pilot surface rejects first request with no prior data, then retry succeeds | actionable error and retry render; successful retry reaches ready state | planned |
| S30 | Bun integration | `bun test` | `bun test apps/web/src/app-shell/bootstrap/legacy-server-state-reset.test.ts` | populated Git/wiki/local-service/review/GitHub/welcome/diagnostic legacy caches | target transition clears every registered legacy snapshot but preserves excluded client/runtime state | planned |
| S31 | Bun source contract | `bun test` | `bun test apps/web/src/api/query/ownership-cutover.test.ts` | typed inventory status + migrated consumer import graph | compatibility/cutover consumers read exactly one owner; no Query↔legacy snapshot mirroring | planned |
| S32 | Bun integration | `bun test` | `bun test apps/web/src/api/query apps/web/src/shared/hooks apps/web/src/features/atmos-computer` | runtime-ready local/Relay HTTP target while main WS is connecting/disconnected | REST system query runs once; equivalent WS query remains disabled | planned |
| S33 | Bun source contract | `bun test` | `bun test apps/web/src/api/query/websocket-query-coverage.test.ts` | typed WS action inventory + migrated consumer import graph | every included WS snapshot read has a key/options owner and no direct feature/store request path | planned |

## Scenarios

### S1 — Every migrated operation has an explicit class

- **Level:** Bun unit / inventory validation
- **Given:** the committed migration inventory and the exported operations in a domain entering implementation.
- **When:** inventory validation runs.
- **Then:** each operation is classified as query, mutation, event, stream, client state, deferred, or excluded; every Query-owned resource names a root key and legacy owner.
- **Signals:** no missing operation ids, duplicate ownership, or unclassified entries.

### S2 — Streams and commands remain outside Query

- **Level:** Bun unit + static audit
- **Given:** the typed migrated-file list plus exclusions for terminal PTY, Agent Chat socket, automation output, LLM/Git chunks, connection bootstrap, and OS-open operations.
- **When:** `transport-boundary.test.ts` scans imports and operation classifications for the migrated modules.
- **Then:** feature query functions use existing API adapters, no stream is represented as a query snapshot, and no migrated module bypasses the transport boundary.
- **Signals:** zero prohibited direct transport imports/calls and passing exclusion classifications. The PR diff separately confirms APP-035 adds no backend route/action.

### S3 — Concurrent equivalent reads deduplicate

- **Level:** Bun integration
- **Given:** two `QueryObserver`s using the same Computer scope and resource key while the mocked request is unresolved.
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
- **Given:** cached Relay control-plane and Computer HTTP data for one URL, auth revision, and Relay session revision.
- **When:** access token, Relay secret, identity-bearing Relay URL, gateway base, or session token changes.
- **Then:** the appropriate auth/session revision increments, old roots are cleared, and no credential value appears in a query key or log.
- **Signals:** revision/key changes, removed cache roots, serialized keys contain no fixture secret/token.

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

- **Level:** Bun unit
- **Given:** a migrated API module gains, removes, or renames an exported operation.
- **When:** `api-operation-inventory.test.ts` compares the affected module fixture with the typed inventory and validates every row.
- **Then:** the check fails until the operation has a unique id, classification, legacy/target owner, phase/status, key root for queries, and invalidation source or explicit exclusion.
- **Signals:** deterministic missing-entry failure followed by pass after inventory update.

### S18 — Web/mobile identity conventions align

- **Level:** Bun unit (optional N1)
- **Given:** equivalent Relay URL, auth revision, and selected Computer identities.
- **When:** web and mobile key-scope fixtures are compared.
- **Then:** both isolate Relay auth and Computer identity using documented principles, without requiring identical arrays or a shared runtime package.
- **Signals:** convention assertions pass; keys contain no secrets.

### S19 — Representative UX baseline improves

- **Level:** Instrumented E2E + exploratory
- **Given:** system diagnostics, settings bootstrap, and usage overview measured before cutover, followed by each later domain's chosen representative journey.
- **When:** cold load, warm revisit, concurrent mount, mutation, and reconnect are exercised.
- **Then:** evidence records fewer duplicate requests and no warm-refresh empty flash without introducing stale-target rendering.
- **Signals:** request counters, loading-state timeline, screenshot/video notes, console/network observations.

### S20 — Pilot surfaces expose distinct normal states

- **Level:** Bun component
- **Given:** representative system diagnostics, settings, and usage components mounted in `happy-dom` under an isolated Query provider.
- **When:** fixtures drive initial loading, successful empty result, successful populated result, and mutation pending for each applicable surface.
- **Then:** every pilot domain has stable accessible signals for its supported states; pending disables or annotates only the initiating control.
- **Signals:** accessible labels/text and control disabled/pending state; no full-surface empty state during mutation.

### S21 — Refresh failure remains actionable without losing data

- **Level:** Bun component
- **Given:** populated system diagnostics, settings, and usage surfaces whose background refresh is delayed and then rejected.
- **When:** refresh begins and fails.
- **Then:** prior data remains visible, a local refresh indicator is distinguishable, an accessible retry action appears, and no duplicate success toast is emitted.
- **Signals:** retained content, refresh/error/retry DOM signals, toast call count.

### S22 — Two-target E2E prevents visible data leakage

- **Level:** E2E (Playwright)
- **Given:** two fixture targets with unique Computer and Project names.
- **When:** the user loads Computer A, switches to Computer B, and opens a migrated surface.
- **Then:** only B's identity and data are visible after switch; A's names never reappear during B loading or refresh.
- **Signals:** accessible Computer/Project labels, captured console/page errors, target fixture request log.

### S23 — Runtime compatibility is verified

- **Level:** E2E plus Desktop GUI smoke
- **Given:** local browser/static server, `e2e/fixtures/query-relay.ts` stubbing existing Relay/gateway routes, and a Tauri runtime build.
- **When:** each runtime opens a pilot query surface and performs one refresh.
- **Then:** existing REST/WS target resolution succeeds and the same user states render.
- **Signals:** pilot data/refresh state, runtime target log, no auth/console/page error. If a runtime is unavailable, Coverage Status names it `not_run` and APP-035 cannot claim that runtime verified.

### S24 — Settings bootstrap cannot overwrite a newer mutation

- **Level:** Bun integration
- **Given:** an unresolved settings bootstrap read and a newer successful function-settings mutation.
- **When:** the old bootstrap response resolves afterward.
- **Then:** the mutated settings section keeps the newer value while untouched sections populate from bootstrap.
- **Signals:** final section values, query update ordering, no rollback/error.

### S25 — Focus and online bridges do not duplicate reconnect work

- **Level:** Bun unit/integration
- **Given:** `QueryFocusBridge`, `WebSocketProvider`, and mocked visibility/online/WS transitions.
- **When:** the document becomes visible and browser network returns.
- **Then:** focus/online managers update, only WebSocketProvider invokes `connect()`, and the connected transition invalidates each registered root once.
- **Signals:** manager states, connect call count, reconnect invalidation call count.

### S26 — Identity changes and non-identity edits have different cache effects

- **Level:** Bun integration
- **Given:** populated Relay and Computer caches.
- **When:** logout occurs, then separate fixtures exercise display-name edit, selected-target change, and Relay session token rotation.
- **Then:** logout clears all server snapshots; display-name edit does not change auth/session revision; target change bumps epoch; session rotation bumps session revision and makes the old Computer root inaccessible.
- **Signals:** revision values and cache roots after each transition; serialized keys contain no credentials.

### S27 — Every migrated event follows one cache policy

- **Level:** Bun table test
- **Given:** the migrated event policy registry and multiple mounted consumers.
- **When:** each complete, partial, and streaming event fixture is dispatched.
- **Then:** complete snapshots patch, partial signals invalidate, streams update only their workflow owner, and consumer count does not change subscription count.
- **Signals:** `setQueryData`/`invalidateQueries`/stream-buffer calls and one listener per domain.

### S28 — A cutover cannot regress its recorded baseline

- **Level:** Bun budget test + instrumented Playwright
- **Given:** the pre-cutover evidence record for a representative domain journey.
- **When:** the same cold load, warm revisit, concurrent mount, mutation, and target/reconnect path runs after cutover.
- **Then:** the cutover fails verification if same-key duplicate requests increase, a warm refresh renders an empty surface, stale-target data appears, or required evidence is missing.
- **Signals:** deterministic request counters and state timeline in `baseline-budget.test.ts`, plus the matching APP-035 `@baseline` E2E record.

### S29 — First-load failure provides actionable recovery

- **Level:** Bun component
- **Given:** each applicable system diagnostics, settings, and usage surface has no cached data and its first request rejects.
- **When:** each error renders and the user activates retry after its fixture becomes healthy.
- **Then:** every applicable surface replaces initial loading with an accessible actionable error, retry issues one request, and the surface reaches ready state.
- **Signals:** per-domain error text/role, retry control, request count, and final ready content.

### S30 — Compatibility reset clears unmigrated server snapshots

- **Level:** Bun integration
- **Given:** populated legacy Git, wiki, local-service, review, GitHub, welcome, and local-diagnostic caches plus retained terminal/client state.
- **When:** `prepareConnectionTargetChange()` invokes `legacy-server-state-reset`.
- **Then:** every registered server snapshot/cache is empty before the new target renders, while excluded terminal runtime and client preferences remain intact.
- **Signals:** per-owner reset assertions, preserved excluded-state fixtures, no old identity in render fixture.

### S31 — Compatibility consumers never read two snapshot owners

- **Level:** Bun source contract
- **Given:** typed inventory statuses and the source files registered as consumers for a domain in compatibility or cutover.
- **When:** `ownership-cutover.test.ts` scans their imports/declared owners.
- **Then:** each consumer depends on either its legacy owner or Query options/hooks, never both; no code mirrors Query data into a legacy snapshot store.
- **Signals:** one owner per consumer and zero prohibited cross-owner imports/sync adapters.

### S32 — REST system reads do not wait for the main WebSocket

- **Level:** Bun integration
- **Given:** a resolvable local HTTP runtime or complete Relay gateway session while the main WebSocket is `connecting` or `disconnected`.
- **When:** a REST-backed system query and a WS-backed settings query evaluate their enablement.
- **Then:** the system query runs once through the existing REST client while the WS query remains disabled until `connected`.
- **Signals:** REST request count `1`, WS request count `0`, and distinct `restComputerQueryEnabled` / `wsComputerQueryEnabled` results.

### S33 — Every included WebSocket snapshot read is Query-owned

- **Level:** Bun source contract
- **Given:** the typed inventory of WebSocket actions and the consumer import graph for a domain marked `cutover` or `cleaned`.
- **When:** `websocket-query-coverage.test.ts` classifies all idempotent request/response reads and scans their consumers.
- **Then:** every included WS snapshot read names a query key/options owner, React consumers use its query hook, imperative consumers use the same options through QueryClient, and no feature/store keeps a parallel direct request/cache path.
- **Signals:** zero unowned WS reads, zero prohibited direct `wsRequest`/`send` consumers, and an explicit rationale for every deferred read.

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

- [ ] Every M1–M11 row has passing happy-path and edge/failure coverage at its declared level.
- [ ] S3 proves exact concurrent-request deduplication.
- [ ] S33 proves every included WebSocket request/response snapshot read is Query-owned after domain cutover.
- [ ] S5–S8 prove mutation and event freshness without duplicate cache ownership.
- [ ] S9–S13, S25–S26, and S32 prove target/auth/session isolation, transport-specific readiness, and bounded reconnect behavior.
- [ ] S20–S21 and S29 prove all M7 user-visible states, including first-load failure/retry, with executable component assertions.
- [ ] S24 proves settings bootstrap stale-response parity before `settingsBootstrapCache` removal.
- [ ] S27 covers every event enabled in `ServerStateEventBridge`.
- [ ] S30 proves legacy compatibility resets; S31 prevents dual-read/dual-cache consumers.
- [ ] All domains marked `cleaned` pass S14 and have no legacy snapshot cache.
- [ ] Stateful APP-035 Playwright coverage, two-target isolation, existing E2E smoke, and required Desktop/Relay checks pass before the corresponding runtime/domain is marked verified.
- [ ] S19 records before/after evidence for every user-visible domain cutover.
- [ ] S28 fails any cutover that regresses the recorded deduplication, warm-refresh, or target-isolation baseline.
- [ ] `bun --filter web typecheck`, scoped web Bun tests, and affected lint checks pass.
- [ ] No new backend route/action, persistent query cache, production Devtools, or Query wrapper around an excluded stream exists.
- [ ] Agent-browser exploratory results are recorded for each user-visible domain cutover.
- [ ] `atmos-specs-test-run` updates Coverage Status with exact commands, artifacts, and remaining gaps.

## Manual verification steps

Desktop/Tauri GUI smoke is manual until a committed Tauri automation harness exists:

1. Start the Desktop app through the repository-supported command.
2. Open one migrated pilot surface, trigger refresh, and confirm initial/ready/background/error states use the same semantics as browser mode.
3. Record the runtime target and any console/API failure in Coverage Status.

If the Tauri runtime or two-Computer Relay fixture is unavailable, record the scenario as `not_run` with the concrete environment limitation; do not substitute an unrecorded pass.

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
