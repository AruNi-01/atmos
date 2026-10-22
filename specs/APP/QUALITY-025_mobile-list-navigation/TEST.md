# TEST · QUALITY-025: Mobile list navigation

> Test plan for the navigation skeleton, filtered session pages, and 20-row windows. References TECH QUALITY-025. Coverage Status is filled after the commands actually run.

## Test strategy

Proof is unit tests for the paging math, the status-list request, the timing line, and the Rust filter. Screen wiring is the hook calls those helpers describe. Do not assert by scanning source for the window size.

Layers:

- **Mobile unit** (`apps/mobile`): `list-page`, `list-navigation`, `session-status-page`.
- **Service unit** (`core-service`): `page_agent_sessions` filter keeps catalog-wide counts.
- **Typecheck / lint** on touched files. oxlint cap is `--max-warnings=455`. Do not raise it.
- **Manual / not run:** iOS Simulator. Record the gap. Do not push screenshots or recordings.

No Playwright journey. `apps/mobile/e2e` is not the proof for this change.

## Coverage map

| Requirement                                               | Scenario IDs |
| --------------------------------------------------------- | ------------ |
| Reveal window grows by 20 and fetches only when consumed  | S1           |
| Home blocks mount 20 open rows and keep collapsed headers | S2           |
| Unfiltered status key stays the home cache key            | S3           |
| Filtered request sends group and context, page size 20    | S3           |
| Click-to-first-frame log and mismatched target            | S4           |
| Server filter pages without changing totals               | S5           |
| Unknown group is an empty page                            | S5           |
| `idle` aliases `done`                                     | S5           |
| Typecheck and lint cap                                    | S6           |
| iOS Simulator timing                                      | S7 (not run) |

## Execution map

| Scenario | Level     | Tool      | Command / method                                                              | Signals                                                        | Status  |
| -------- | --------- | --------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------- | ------- |
| S1       | Unit      | Bun       | `bun test src/features/lists/list-page.test.ts` in `apps/mobile`              | reveal vs fetch decisions                                      | pass    |
| S2       | Unit      | Bun       | same                                                                          | 20-item slice; collapsed header kept; later open block omitted | pass    |
| S3       | Unit      | Bun       | `bun test src/features/sessions/session-status-page.test.ts` in `apps/mobile` | short key for limit 100; long key and body for a bucket        | pass    |
| S4       | Unit      | Bun       | `bun test src/features/lists/list-navigation.test.ts` in `apps/mobile`        | one log line; other target does not clear the mark             | pass    |
| S5       | Unit      | Cargo     | `cargo test -p core-service page_agent_sessions_filters -- --test-threads=8`  | filtered page, catalog total, empty unknown group, idle alias  | pass    |
| S6       | Toolchain | bun/oxc   | `bun --filter @atmos/mobile typecheck`; oxlint and oxfmt on touched paths     | typecheck exits 0; no new oxlint warnings; cap stays 455       | pass    |
| S7       | Manual    | Simulator | `just dev-mobile` then `just mobile-ios`                                      | Metro/Xcode shows `[list-nav] click-to-first-frame`            | not run |

## Scenarios

### S1 — Next page follows the reveal window

- **Level**: Unit
- **Given**: a window of 20.
- **When**: loaded rows are ahead of the window, exactly at the window with another page, or behind the window because a client filter dropped rows.
- **Then**: the first case reveals without fetching; the second grows the window and fetches; the third fetches without growing; no next page stays put.
- **Signals**: `nextListWindow` return value.

### S2 — Home blocks do not mount hidden rows

- **Level**: Unit
- **Given**: a pinned block, a collapsed block with `keep`, and a later open block.
- **When**: the window is 20 and the pinned block already fills it.
- **Then**: the collapsed header is still emitted with no items, and the later open block is omitted.
- **Signals**: `pageBlocks` keys and item lengths.

### S3 — Status list identity

- **Level**: Unit
- **Given**: a server id.
- **When**: the caller omits filters, passes a blank group, or passes `running` / a workspace id.
- **Then**: the unfiltered key is exactly `["agent-session-status-list", serverId]` and the body is limit 100 with no filter fields. The filtered key includes the group, context, and 20. The body sends `group_key` / `context_id` only when set.
- **Signals**: `agentSessionStatusQueryKey` and `agentSessionStatusListInput`.

### S4 — Click-to-first-frame

- **Level**: Unit
- **Given**: a test sink, and a mark for `session-bucket`.
- **When**: a different target reports, then `session-bucket` reports.
- **Then**: the first report is null and the mark remains. The second report writes one `[list-nav] click-to-first-frame target=session-bucket` line with `detail=running`. A second report is null.
- **Signals**: sink lines and `lastListNavSample`.

### S5 — Filtered page keeps catalog totals

- **Level**: Unit
- **Given**: four snapshots across two workspaces and two groups.
- **When**: the page is filtered to `running` + workspace `ws-1` with limit 1, then the cursor is continued, then the group is `nope`, then `idle`.
- **Then**: the first row is the newest match, `total` stays 4, running count stays 3, the next page is only the older match, `nope` returns no rows and no cursor, and `idle` returns the done row.
- **Signals**: `page_agent_sessions` page fields.

### S6 — Toolchain

- **Level**: Toolchain
- **Given**: the touched mobile and Rust files.
- **When**: mobile typecheck, oxlint, and oxfmt run on those paths, and the Rust paging test compiles.
- **Then**: `bun --filter @atmos/mobile typecheck` exits 0. oxlint adds no warning on touched files, and `package.json` lint script still says `--max-warnings=455`.
- **Signals**: command exit codes.

### S7 — iOS Simulator

- **Level**: Manual
- **Given**: a Mac with Xcode, not this Linux agent.
- **When**: `bun install` if needed, `just dev-mobile` (Metro: `cd apps/mobile && bunx expo start --dev-client --scheme atmos --lan`), then `just mobile-ios`.
- **Then**: opening a workspace row and a session card paints a skeleton before rows, further rows load at the bottom, and the dev console shows the timing line.
- **Signals**: Metro or Xcode console. Not run here.

## Exploratory agent-browser checks

Not used. This change is Expo mobile, and the Linux agent has no iOS Simulator. S7 is the manual check.

## Regression checklist

- Web `agent_session_status_list` calls that omit `group_key` and `context_id` still receive a page of 100 and catalog-wide counts.
- Home session pins and the recent 8 still come from the unfiltered page of 100.
- `AgentChatThreadScreen` still lists chats with page size 100.
- Archive / hide drops the row from every `agent-session-status-list` cache for that server, including filtered pages. The unfiltered key string stays `["agent-session-status-list", serverId]`.
- oxlint `--max-warnings` stays 455.

## Acceptance criteria

- S1–S5 pass.
- S6 warning cap is unchanged. Touched-file lint adds no warning.
- S7 is recorded as not run, with the commands above.

## Non-coverage

- Pixel timing on a device. The log is the measurement; this environment cannot run the simulator.
- A perfect merge of chat and terminal timestamps across pages.
- Terminals whose status snapshot has an empty `context_id`.

## Coverage Status

Recorded on `aarynlu/mobile-list-nav-pagination-0419` (Linux cloud agent, no iOS Simulator).

| Scenario | Status  | Evidence                                                                                                                                                                                                                                                                                           |
| -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1       | pass    | `nextListWindow` reveal, grow-and-fetch, shrink-and-fetch, and stay cases in `list-page.test.ts`                                                                                                                                                                                                   |
| S2       | pass    | `pageBlocks` keeps a collapsed header and omits a later open block                                                                                                                                                                                                                                 |
| S3       | pass    | `session-status-page.test.ts`: unfiltered key is `["agent-session-status-list", serverId]`; filtered key and body include group, context, and 20                                                                                                                                                   |
| S4       | pass    | `list-navigation.test.ts`: mismatched target leaves the mark; matching target writes one `[list-nav] click-to-first-frame` line                                                                                                                                                                    |
| S5       | pass    | `cargo test -p core-service page_agent_sessions_filters -- --test-threads=8` — 1 passed                                                                                                                                                                                                            |
| S6       | pass    | `bun --filter @atmos/mobile typecheck` exits 0. `react-dom/server` stays on the `@ts-expect-error` used by the settings and glass tests, and `open-thread-resync.test.ts` publish callbacks return void. Lint, format, and clippy passed. `package.json` lint script remains `--max-warnings=455`. |
| S7       | not run | This environment has no iOS Simulator. Commands: `bun install` if needed, `just dev-mobile`, then `just mobile-ios`. Read `[list-nav] click-to-first-frame` in the Metro or Xcode console on a dev build.                                                                                          |

`bun test` in `apps/mobile` for `list-page`, `list-navigation`, `session-status-page`, `session-inbox`, `chat-list-page`, `session-row-actions`, and `use-bucket-candidate-load` covers the window reset (`reconcileListWindow`), closed blocks that keep only the already-mounted rows (`mountedItemCount`) without spending the window, mark expiry and detail mismatch, and `omitSessionFromStatusPages`. The filtered status key starts with the unfiltered prefix, which is what `setQueriesData` matches. `listFooterState` is `error` only for a failed next page and `loading` while that page is in flight. Bucket candidate load stays off for home, for an empty session set, and until the screen is ready; a changed session-id set uses stale time 0.
