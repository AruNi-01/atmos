# TEST · APP-063: Token Usage Computer scope

> Test Plan · prove page-local Computer select, unique-device All computers, and client merge of **final overviews**. References PRD APP-063 and TECH APP-063.

## Test strategy

Deterministic rules live in **Bun tests**: unique-device grouping, overview merge (sum tokens, union dates, no double-count), query-key isolation, Relay list/`client_sessions` semantics. Rust covers `app_device_id()` stability. Do **not** E2E a live multi-Computer Relay fan-out — too much fixture for the same merge contract. Playwright is optional/smoke only if a stubbed Token Usage route exists; otherwise agent-browser checks select placement and miss copy. Merge is of **finished `TokenUsageOverviewResponse` objects**, not tokscale files.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 Local-first | S1, S22 |
| M2 Select left of Share | S2 |
| M3 Select options / labels | S2, S6, S20, S21 |
| M4 Page-local scope | S19 |
| M5 Current Computer, no extra hop | S3, S23 |
| M6 Other Computer via Relay; no remote cookies | S4, S5, S18 |
| M7 All computers unique machines + unregistered local | S7, S8, S9 |
| M8 Physical-machine uniqueness | S6, S8, S11, S14, S24 |
| M9 Partial All computers | S12, S13 |
| M10 Other Computer unreachable | S5 |
| M11 Share follows displayed overview | S17 |
| M12 Selector visibility | S1, S2, S22 |
| N1–N3 | Deferred — not in this pass |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Bun | `bun test` | unique-computers + page source | signed out / 1 device | no select | planned |
| S2 | Bun | `bun test` | unique-computers + TokenUsagePage source | 2 unique devices, signed in | All computers first; select before Share | planned |
| S3 | Bun | `bun test` | fetch-remote helper / unique-computers | current `server_id` | no `createClientSession` for current | planned |
| S4 | Bun | `bun test` | fetch-remote | other `server_id` | `try_cookies: false`; session for that id | planned |
| S5 | Bun | `bun test` | fetch-remote / page query | side session throws | error; current overview not swapped in | planned |
| S6 | Bun | `bun test` | unique-computers | two rows, same `app_device_id` | one option | planned |
| S7 | Bun | `bun test` | unique-computers | local not on list | `local:` device appended, current | planned |
| S8 | Bun | `bun test` | unique-computers | local id matches list `app_device_id`, different `server_id` | no extra local | planned |
| S9 | Bun | `bun test` | merge-token-usage-overviews | two overviews, overlapping + unique days | tokens sum; `active_days` = distinct dates | planned |
| S10 | Bun | `bun test` | merge | one cost null | merged `total_cost_usd` null | planned |
| S11 | Bun | `bun test` | unique-computers + merge callers | same device two `server_id`s | one fetch target | planned |
| S12 | Bun | `bun test` | merge + missed labels | one success, one miss | totals from success; miss name present | planned |
| S13 | Bun | `bun test` | All computers aggregator | all fetches fail | error; no empty-zero overview | planned |
| S14 | Bun | `bun test` `packages/relay` | GET `/v1/computers` | D1 row with `app_device_id` | JSON field present | planned |
| S15 | Bun | `bun test` `packages/relay` | POST client_sessions twice | same user+server | no DELETE of live sibling; two rows until cap | planned |
| S16 | Bun | `bun test` `packages/relay` | 9th session | 8 existing | oldest dropped | planned |
| S17 | Bun | `bun test` | TokenUsagePage / share props | merged overview on screen | Share gets merged totals | planned |
| S18 | Bun | `bun test` | TokenUsagePage source | other / all scope | cookie banner gated on current | planned |
| S19 | Bun | `bun test` | unique-computers / page | change usage select | `selectedServerId` unchanged (no workbench connect call) | planned |
| S20 | Bun | `bun test` | unique-computers | revoked row | omitted | planned |
| S21 | Bun | `bun test` | unique-computers | two groups, same display_name | suffix with `server_id` prefix | planned |
| S22 | Bun | `bun test` | unique-computers | signed in, 1 unique | select hidden | planned |
| S23 | Bun | `bun test` | query-keys | current filters | existing `computer.tokenUsageOverview` shape | planned |
| S24 | Rust | `cargo test` | `runtime-manager` device id | machine id fixture | stable 64 hex; runtime-info field documented | planned |

## Scenarios

### S1 — Signed out: no Computer select

- **Level**: Bun
- **Given**: No Hub device credential, or computers list empty.
- **When**: Token Usage builds unique devices.
- **Then**: Select is not shown. Overview still comes from the workbench `/ws`.
- **Signals**: `shouldShowComputerSelect` false; page still renders Share.

### S2 — Two unique machines: select left of Share

- **Level**: Bun
- **Given**: Signed in; two unique devices.
- **When**: Token Usage toolbar renders.
- **Then**: Select is visible; first option is All computers; Share remains. Source order is select then Share.
- **Signals**: i18n `computerScope.allComputers`; `toolbarEnd` contains select before share popover.

### S3 — Current Computer does not open a side session

- **Level**: Bun
- **Given**: Current device has `serverId` equal to workbench Computer.
- **When**: Scope is current (default).
- **Then**: Overview uses `tokenUsageApi.getOverview` / main `/ws`. `createClientSession` is not called for that `server_id`.
- **Signals**: fetch-remote helper not invoked for current key.

### S4 — Other Computer: live scan, no cookies

- **Level**: Bun
- **Given**: Another unique device with `serverId`.
- **When**: Side fetch runs.
- **Then**: `createClientSession(serverId)` then `token_usage_overview_get` with `refresh: true`, `try_cookies: false`. Session disconnected after.
- **Signals**: request payload flags; disconnect in `finally`.

### S5 — Other Computer unreachable

- **Level**: Bun
- **Given**: Side session connect or request fails.
- **When**: That Computer is selected.
- **Then**: Error for this view. Cached **current** overview is not displayed as if it were the other machine.
- **Signals**: scoped query error; current query data unused for the view.

### S6 — Same `app_device_id` collapses to one option

- **Level**: Bun
- **Given**: Two active rows, identical 64-hex `app_device_id`, different `server_id`.
- **When**: Unique devices computed.
- **Then**: Length 1. Representative prefers `online`, then `last_seen_at`, then `created_at`.
- **Signals**: single `DeviceKey` `app:…`.

### S7 — Unregistered local is in scope

- **Level**: Bun
- **Given**: Loopback Computer with `app_device_id` / `localServerId` that matches **no** list row.
- **When**: Unique devices computed.
- **Then**: Extra `local:…` device, `isCurrent: true`.
- **Signals**: `unique.length` includes local; `serverId` null.

### S8 — Local re-register matches by device id

- **Level**: Bun
- **Given**: List row `app_device_id=X` `server_id=old`; local `app_device_id=X` `localServerId=new`.
- **When**: Unique devices computed.
- **Then**: One group; `isCurrent: true`; no second `local:` row.
- **Signals**: length 1.

### S9 — Merge final overviews: tokens sum, active days union

- **Level**: Bun
- **Given**: Overview A: 100 tokens, days `2026-01-01`, `2026-01-02`, `active_days: 2`. Overview B: 50 tokens, days `2026-01-02`, `2026-01-03`, `active_days: 2`.
- **When**: `mergeTokenUsageOverviews([A, B])`.
- **Then**: `total_tokens === 150`; merged `by_day` has 3 dates; `active_days === 3` (not 4).
- **Signals**: merge helper return value.

### S10 — Merge cost: any null → null

- **Level**: Bun
- **Given**: A has `total_cost_usd: 1.5`; B has `null`.
- **When**: Merge.
- **Then**: Merged `summary.total_cost_usd` is `null`.
- **Signals**: merge helper.

### S11 — Duplicate device is one All computers target

- **Level**: Bun
- **Given**: Same as S6.
- **When**: All computers target list built.
- **Then**: One representative `serverId` (or current `/ws` if that group is current). Not two side fetches.
- **Signals**: targets length 1.

### S12 — Partial All computers

- **Level**: Bun
- **Given**: Device Laptop succeeds; device VPS fails.
- **When**: All computers aggregation finishes.
- **Then**: Charts use Laptop overview; VPS display name is in the miss list / banner. Page is not a hard fail.
- **Signals**: merge of successes; `missedLabels` contains VPS.

### S13 — All computers with zero successes

- **Level**: Bun
- **Given**: Every unique device fetch fails.
- **When**: Aggregation finishes.
- **Then**: Error (none reached). Do not show a zeroed fake overview.
- **Signals**: throw or error result; no `total_tokens: 0` empty success.

### S14 — Computer list returns `app_device_id`

- **Level**: Bun (`packages/relay`)
- **Given**: Authenticated device; D1 computers row has `app_device_id`.
- **When**: `GET /v1/computers`.
- **Then**: Each computer JSON includes `app_device_id` (string or null).
- **Signals**: response body.

### S15 — New client session does not kick siblings

- **Level**: Bun (`packages/relay`)
- **Given**: Existing `client_sessions` row for user+server.
- **When**: `POST /v1/computers/:id/client_sessions` again.
- **Then**: No `DELETE FROM client_sessions WHERE server_id = ? AND user_id = ?` that wipes the live sibling. Previous token remains until cap/expiry.
- **Signals**: SQL calls; row count 2.

### S16 — Session cap 8

- **Level**: Bun (`packages/relay`)
- **Given**: 8 sessions for the same user+server.
- **When**: 9th POST.
- **Then**: Oldest `created_at` removed; 8 remain including the new one.
- **Signals**: delete-oldest SQL or equivalent.

### S17 — Share uses displayed overview

- **Level**: Bun
- **Given**: Displayed overview is a merge with `total_tokens: 150`.
- **When**: Share popover props are built.
- **Then**: `totalTokens` / `overview` are the merged object, not the workbench-only cache.
- **Signals**: page wiring / helper that maps displayed overview to share props.

### S18 — Cookie banner only on current

- **Level**: Bun
- **Given**: Token Usage page source / consent gate.
- **When**: Scope is other Computer or All computers.
- **Then**: Cookie banner is not shown; `setBrowserCookieConsent` is not used for remote fetches.
- **Signals**: `try_cookies: false`; banner `items` omitted or gated.

### S19 — Usage select does not switch workbench Computer

- **Level**: Bun
- **Given**: Workbench `selectedServerId = A`.
- **When**: Usage scope set to Computer B or All computers.
- **Then**: No `createHostedRemoteSession(A→B)` / connection-mode change from Token Usage.
- **Signals**: Token Usage fetch module does not call workbench connect helpers.

### S20 — Revoked rows dropped

- **Level**: Bun
- **Given**: One revoked, one active, different devices.
- **When**: Unique devices computed.
- **Then**: Only the active row.
- **Signals**: length 1.

### S21 — Colliding labels get a suffix

- **Level**: Bun
- **Given**: Two groups, both `display_name: "Studio"`.
- **When**: Labels assigned.
- **Then**: Labels differ; each contains a `server_id` 8-char prefix.
- **Signals**: `label` strings.

### S22 — One unique machine hides select

- **Level**: Bun
- **Given**: Signed in; only one unique device (list + local collapse to one).
- **When**: Visibility computed.
- **Then**: Select hidden.
- **Signals**: `shouldShowComputerSelect` false.

### S23 — Current query key unchanged

- **Level**: Bun
- **Given**: Existing `queryKeys.computer.tokenUsageOverview(scope, filters)`.
- **When**: Key built.
- **Then**: Same tuple as today (`atmos`, `computer`, instance, epoch, revision, `tokenUsage`, `overview`, filters).
- **Signals**: `query-keys.test.ts`.

### S24 — Local `app_device_id` is stable hex

- **Level**: Rust
- **Given**: `app_device_id_from_machine_id` fixture.
- **When**: Derived twice with case/whitespace variants.
- **Then**: Same 64 lowercase hex. Public export usable from `apps/api` runtime-info.
- **Signals**: existing `device_identity` tests plus compile of runtime-info field.

## Performance & load budgets

- All computers fan-out concurrency **3**.
- Per remote overview: connect ≤ 15s, request ≤ 60s, then count as miss (S12).
- Merge of 10 overviews with ~400 `by_day` rows is in-process and must stay well under 100ms in unit tests (no network).

## Regression checklist

- [ ] Workbench `/ws` is not retargeted when changing Token Usage scope.
- [ ] `createClientSession` for the **current** `server_id` is never used for Token Usage.
- [ ] Signed-out Token Usage still loads from local WS (APP-061 M1).
- [ ] Share PNG still excludes toolbar (`data-token-usage-share-exclude`).
- [ ] English copy is sentence case (`All computers`, not `ALL COMPUTERS`).
- [ ] `ComputerRow` fixtures include `app_device_id` so typecheck does not rot.
- [ ] Relay revoke still deletes sessions for that Computer.

## Exploratory agent-browser checks

Use `agent-browser` (load skill or `agent-browser skills get core --full`) on local Token Usage when a signed-in account with ≥2 Computers is available. If that fixture cannot be created, record `not_run` with reason.

1. Open `/token-usage`. Confirm select sits immediately left of Share when two Computers exist; hidden when signed out.
2. Pick the other Computer: charts change; header Computer / terminals do not switch; cookie banner absent.
3. Pick All computers with one Computer stopped: totals still render; missed Computer is named; Share still opens.
4. Narrow viewport (~390px): select + Share remain usable; no overlap with metric/dimension toggles.
5. Console: no unhandled WS errors from side sessions after disconnect.

## Acceptance criteria

- [ ] Every Must Have M1–M12 has a passing scenario at the declared level.
- [ ] Merge tests prove **final overview** combination (tokens sum, active_days union, no double-count by `app_device_id`).
- [ ] Relay list includes `app_device_id`; concurrent client sessions do not kick siblings.
- [ ] No new usage REST; no new `WsAction`.
- [ ] N1–N3 not required to ship.
- [ ] `atmos-specs-test-run` Coverage Status filled with exact commands.
- [ ] Scoped `bun test` / `cargo test` on touched packages pass; `just lint` on changed surfaces or recorded equivalent.

## Manual verification steps

1. Desktop signed in, two real Computers: Token Usage select, other Computer, All computers, stop one process, confirm miss name.
2. Confirm header Computer did not change (terminals still the first machine).
3. Publish/PNG while All computers is selected: snapshot totals match the on-screen merge (partial if a miss).

## Non-coverage

- Live Relay E2E with two physical Servers (covered by unit merge + Relay session tests).
- N1 persist select, N2 retry-only-misses, N3 Settings/header dedup.
- Quota Usage.
- Mobile Token Usage select.
- Billing-grade equality with provider invoices.

## Coverage Status

Updated 2026-08-21 after implementation.

| Scenario | Status | Proof |
|----------|--------|-------|
| S1 | pass | `unique-computers.test.ts` hides select when signed out |
| S2 | pass | `token-usage-computer-scope.test.ts` select appears before Share in `TokenUsagePage.tsx` |
| S3 | pass | `fetch-token-usage-scope.test.ts` All computers calls `fetchCurrent` for `isCurrent` |
| S4 | pass | `fetch-token-usage-scope.test.ts` remote payload `try_cookies: false` |
| S5 | pass | remote fetch disconnects on failure; page maps other-Computer errors to `loadOtherError` |
| S6 | pass | unique-computers same `app_device_id` → one option |
| S7 | pass | unregistered local appended |
| S8 | pass | local `app_device_id` match does not add a second local |
| S9 | pass | merge sums tokens; `active_days` is distinct dates (3, not 4) |
| S10 | pass | merge cost null if any contributor lacks cost |
| S11 | pass | `allComputersFetchTargets` length 1 for duplicate device |
| S12 | pass | All computers keeps successes and names misses |
| S13 | pass | All computers throws `none-reached` when every fetch fails |
| S14 | pass | `packages/relay/test/computer-list-and-sessions.test.ts` GET includes `app_device_id` |
| S15 | pass | client_sessions POST does not wipe sibling rows |
| S16 | pass | 9th session deletes oldest (`LIMIT 1`) |
| S17 | pass | page source Share uses displayed `overview` |
| S18 | pass | cookie banner gated with `isCurrentScope` |
| S19 | pass | Token Usage page does not call workbench connect helpers |
| S20 | pass | revoked rows dropped |
| S21 | pass | colliding labels get `server_id` suffix |
| S22 | pass | `shouldShowComputerSelect` false at uniqueCount 1 |
| S23 | pass | `query-keys.test.ts` workbench key unchanged; scoped key under relay |
| S24 | pass | `cargo test -p runtime-manager` `app_device_id_is_stable_and_hex_encoded` |

### Commands run

```bash
bun test test/computer-list-and-sessions.test.ts test/computer-registration.test.ts test/client-session.test.ts  # packages/relay
bun test  # packages/relay (54 pass)
bun test src/session-urls.test.ts src/client.test.ts  # packages/relay-client
bun test src/features/token-usage src/app-shell/__tests__/token-usage-computer-scope.test.ts src/api/query/__tests__/query-keys.test.ts
cargo test -p runtime-manager
cargo check -p api
```

### Gaps / honesty

- No live two-Computer Relay Playwright. Merge + session tests cover the contract.
- Agent-browser exploratory checks **not_run** (no signed-in ≥2 Computer fixture in this pass).
- Manual Desktop two-machine walkthrough **not_run**.
