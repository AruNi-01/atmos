# TEST · QUALITY-025: Mobile filtered list open

> Test Plan · how we verify the open path and the 20-row window in [TECH.md](./TECH.md). Quality spec. No PRD. Coverage is keyed to the TECH quality table.

## Test strategy

The hitch and the window are pure decisions plus a source scan of the call sites. Bun tests do not mount React Native.

- **Bun unit**: href builders, inbox surface flags, `snapshotsForBucket`, and every pager transition (first frame, auto-fill, advance, server-page bump, duplicate guard, retry, filter reset).
- **Bun source-scan**: card and workspace presses call the href helper with no `await`; the bucket screen does not pass `fillWhenShort`; the inbox hook gates focus refresh and enrichment; `ws-actions` sends `AGENT_SESSION_STATUS_PAGE_SIZE`; chat page size stays 100.
- **Lint cap**: root `package.json` `lint` stays `oxlint --max-warnings=455`.
- **Typecheck**: `bun --filter @atmos/mobile typecheck`.
- **Playwright / agent-browser**: not used. The screens are React Native.
- **Manual-only**: iOS simulator tap on a Session card and a Workspace row (skeleton when cold, 20 rows when warm, scroll to load, Try again, filter reset). The implementer does not run the simulator for this spec.

No test is skipped. The oxlint warning cap is not raised.

## Coverage map

| TECH item                                                                              | Scenario IDs |
| -------------------------------------------------------------------------------------- | ------------ |
| Card press returns a plain href and does not await                                     | S1, S2       |
| Workspace row press returns a plain href and does not await                            | S1, S2       |
| Bucket does not refresh on focus or load enrichment                                    | S3, S4       |
| Snapshots are filtered before join; unknown `group_key` is done                        | S5           |
| First frame is a skeleton when nothing is loaded and a fill is outstanding             | S6           |
| First frame mounts at most 20 cached rows                                              | S6           |
| Failed first page is empty plus error, not a stuck skeleton                            | S6, S9       |
| Auto-fill fetches only until 20 filtered rows                                          | S7           |
| End-reached reveals the next 20 from cache, or one server fetch, or nothing at the end | S8           |
| In-flight and failed fetches ignore another end event                                  | S8, S10      |
| A new server page does not grow the window during auto-fill                            | S11          |
| A consumed page grows by 20 when the next server page arrives                          | S11          |
| Filter change resets the window to 20                                                  | S12          |
| Duplicate `fetchNext` is ignored until the fetch settles, including a no-op            | S10          |
| Try again is allowed after `fetchFailed`                                               | S9           |
| Bucket screen does not pass `fillWhenShort`                                            | S4           |
| Status request limit stays 100, not 20                                                 | S13          |
| Chat list page size stays 100                                                          | S13          |
| oxlint cap 455                                                                         | S14          |
| Live iOS tap, skeleton, scroll, retry                                                  | S15 (manual) |

## Execution map

`Status` stays `planned` until the named command has run for this spec. Manual stays `planned`.

| Scenario | Level           | Expected tool   | Target command / method                                                           | Fixture / data                                                                    | Signals                                                                                                                 | Status  |
| -------- | --------------- | --------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------- |
| S1       | Bun unit        | `bun test`      | `list-navigation.test.ts`                                                         | bucket `done`; workspace `ws-1`                                                   | plain object href; `not.toBeInstanceOf(Promise)`                                                                        | planned |
| S2       | Bun scan        | `bun test`      | `list-navigation.test.ts` reads `SessionInboxScreen.tsx`, `WorkspaceHomeList.tsx` | source                                                                            | `openSessionBucketHref` / `openWorkspaceEntryHref`; no `await router.push`; no `await openSession`                      | planned |
| S3       | Bun unit        | `bun test`      | `filtered-list-page.test.ts` or `session-inbox-surface` cases                     | `"home"` / `"bucket"`                                                             | enrichment and focus refresh true only for home                                                                         | planned |
| S4       | Bun scan        | `bun test`      | same file reads `use-session-inbox.ts`, `SessionInboxScreen.tsx`                  | source                                                                            | `sessionInboxRefreshesOnFocus`; `sessionInboxLoadsEnrichment`; `snapshotsForBucket`; bucket file has no `fillWhenShort` | planned |
| S5       | Bun unit        | `bun test`      | `session-inbox.test.ts` `snapshotsForBucket`                                      | mixed `group_key`, including `"other"`                                            | only the bucket; `"other"` is in `done`                                                                                 | planned |
| S6       | Bun unit        | `bun test`      | `filteredListFirstFrame`                                                          | 0 rows pending; 0 rows failed; 500 cached rows, visible 20                        | skeleton; empty; 20 rows, mode `rows`                                                                                   | planned |
| S7       | Bun unit        | `bun test`      | `filteredListShouldFetch`                                                         | loaded 0/19/20, visible 20/40, fetching, failed, no next                          | fetch only while the first UI page is short                                                                             | planned |
| S8       | Bun unit        | `bun test`      | `advanceFilteredList`                                                             | visible 20 loaded 100; visible 100 loaded 100 with next; at end; fetching; failed | +20 and no fetch; fetch and same visible; no-op; ignore                                                                 | planned |
| S9       | Bun unit        | `bun test`      | `filteredListStatus`, `retryFilteredListFetch`                                    | `fetchFailed`; retry result                                                       | status `error`; retry returns `fetch: true`                                                                             | planned |
| S10      | Bun unit        | `bun test`      | `beginFilteredListFetch`, `settleFilteredListFetch`                               | second call while requesting; settle without `sawFetching`; settle after fetching | second `fetch: false`; requesting clears                                                                                | planned |
| S11      | Bun unit        | `bun test`      | `visibleCountAfterServerPage`                                                     | 0→15 auto-fill; visible 100, previous 100, loaded 180                             | visible stays 20; visible becomes 120                                                                                   | planned |
| S12      | Bun unit        | `bun test`      | `syncFilteredListFilter`                                                          | same key; key `done` → `running`                                                  | same object; visible 20                                                                                                 | planned |
| S13      | Bun unit + scan | `bun test`      | `session-status-page.ts`, `ws-actions.ts`, `chat-list-page.test.ts`               | constants                                                                         | both page sizes are 100; status action uses the constant; no `limit: 20` on that action                                 | planned |
| S14      | Review          | `rg` / `oxlint` | root `package.json` script `lint`; `bunx oxlint --max-warnings=455`               | repo                                                                              | script text unchanged; oxlint exit 0                                                                                    | planned |
| S15      | Manual          | iOS simulator   | tap Session cards and a Workspace row                                             | cold cache and warm cache                                                         | push is not held for data; skeleton or 20 rows; scroll loads; Try again; switching card resets                          | planned |

## Scenarios

### S1 — Open helpers return a plain href

- **Level**: Unit
- **Given**: `openSessionBucketHref` and `openWorkspaceEntryHref`.
- **When**: called with `done` and `ws-1`.
- **Then**: session href is `{ pathname: "/(home)/session/[bucket]", params: { bucket: "done" } }`. Workspace href is `{ pathname: "/workspace/[workspaceId]", params: { workspaceId: "ws-1" } }`. Neither value is a `Promise`.
- **Signals**: `not.toBeInstanceOf(Promise)` and deep equality.

### S2 — Presses do not await navigation

- **Level**: Source-scan
- **Given**: `SessionInboxScreen.tsx` and `WorkspaceHomeList.tsx`.
- **When**: the test reads both files.
- **Then**: each file contains its href helper. Neither contains `await router.push` or `await openSessionBucketHref` or `await openWorkspaceEntryHref`.
- **Signals**: those substrings. Absence of the `await` forms.

### S3 — Bucket skips focus refresh and enrichment

- **Level**: Unit
- **Given**: `sessionInboxLoadsEnrichment` and `sessionInboxRefreshesOnFocus`.
- **When**: called with `"home"` and `"bucket"`.
- **Then**: home is `true` for both. Bucket is `false` for both.
- **Signals**: four assertions.

### S4 — Bucket wiring matches the surface split

- **Level**: Source-scan
- **Given**: `use-session-inbox.ts` and `SessionInboxScreen.tsx`.
- **When**: the test reads them.
- **Then**: the hook contains `sessionInboxRefreshesOnFocus`, `sessionInboxLoadsEnrichment`, and `snapshotsForBucket`. `SessionInboxScreen.tsx` does not contain `fillWhenShort`.
- **Signals**: those substrings.

### S5 — Bucket join input drops other groups

- **Level**: Unit
- **Given**: snapshots whose `group_key` is `permission`, `done`, and `other`.
- **When**: `snapshotsForBucket` is called with `done` and with `permission`.
- **Then**: `done` includes the `done` row and the `other` row. `permission` includes only the permission row.
- **Signals**: ids of the returned snapshots.

### S6 — First frame never mounts the full cache

- **Level**: Unit
- **Given**: `filteredListFirstFrame`.
- **When**: pending and zero rows and a next page; `fetchFailed` and zero rows; 500 rows with `visibleCount` 20 and `pending` false.
- **Then**: skeleton and no rows; empty and no rows; mode `rows` with length 20.
- **Signals**: `mode` and `rows.length`.

### S7 — Auto-fill stops at the first UI page

- **Level**: Unit
- **Given**: `filteredListShouldFetch`.
- **When**: loaded is 0 or 19 with visible 20 and a next page; loaded is 20; visible is 40 and loaded is 30; `fetching`, `fetchFailed`, or no next page.
- **Then**: true only for the short first page. False once 20 are loaded, even if the visible window is larger and the server has more.
- **Signals**: boolean.

### S8 — End-reached advances one UI page

- **Level**: Unit
- **Given**: `advanceFilteredList`.
- **When**: visible 20 and loaded 100; visible 100 and loaded 100 with a next page; visible 20 and loaded 20 with no next page; the same inputs while `fetching` or `fetchFailed`.
- **Then**: `{ visibleCount: 40, fetch: false }`; `{ visibleCount: 100, fetch: true }`; `{ visibleCount: 20, fetch: false }`; ignore (same visible, `fetch: false`).
- **Signals**: the returned pair.

### S9 — Failure is an explicit retry

- **Level**: Unit
- **Given**: `filteredListStatus` and `retryFilteredListFetch`.
- **When**: `fetchFailed` is true with loaded rows, and retry is called.
- **Then**: status is `error`. Retry returns `fetch: true` and `requesting: true`.
- **Signals**: status string and the retry object.

### S10 — A second fetch is dropped

- **Level**: Unit
- **Given**: `beginFilteredListFetch` and `settleFilteredListFetch`.
- **When**: begin succeeds, begin is called again while `requesting`; settle runs with `fetching` false before `sawFetching`; settle runs after `fetching` was true.
- **Then**: the second begin has `fetch: false`. Both settles set `requesting` false.
- **Signals**: `fetch` and `requesting`.

### S11 — Server pages do not unroll the first screen

- **Level**: Unit
- **Given**: `visibleCountAfterServerPage` with `visibleCount` 20.
- **When**: loaded grows 0 → 15; then visible 100, previous loaded 100, new loaded 180.
- **Then**: the first result is 20. The second is 120.
- **Signals**: the returned counts.

### S12 — A new filter restores the first page

- **Level**: Unit
- **Given**: `{ key: "done", visibleCount: 80 }`.
- **When**: `syncFilteredListFilter` is called with `"done"`, then with `"running"`.
- **Then**: the same object comes back for `"done"`. `"running"` has `visibleCount` 20.
- **Signals**: object identity and `visibleCount`.

### S13 — Wire page size stays on the web contract

- **Level**: Unit and source-scan
- **Given**: `AGENT_SESSION_STATUS_PAGE_SIZE`, `CHAT_LIST_PAGE_SIZE`, and `ws-actions.ts`.
- **When**: the tests read the constants and the status action.
- **Then**: both constants are 100. The status action contains `AGENT_SESSION_STATUS_PAGE_SIZE` and does not send `limit: 20`.
- **Signals**: numeric expects and substrings. Chat coverage can extend `chat-list-page.test.ts`.

### S14 — Lint cap is untouched

- **Level**: Review
- **Given**: root `package.json`.
- **When**: the lint script is read and `bunx oxlint --max-warnings=455` runs.
- **Then**: the script is still `oxlint --max-warnings=455` and the command exits 0.
- **Signals**: script text; process status.

### S15 — Device pass

- **Level**: Manual
- **Given**: a connected Computer with more than 20 sessions in at least one bucket, and a workspace with more than 20 chats or terminals.
- **When**: the tester taps each Session card and a Workspace row, scrolls to the bottom, forces a next-page error if practical, and switches cards.
- **Then**: the push is not held for the network; a skeleton shows when the cache is empty; at most 20 rows show on the first paint; the next page loads at the bottom; the end does not spin; Try again retries; a different card starts at 20 again.
- **Signals**: observation. Not executed in CI.

## Exploratory agent-browser checks

Not applicable. These screens are Expo / React Native. S15 is the manual substitute.

## Regression checklist

- Session home still refreshes on focus and still loads candidates, git, PRs, and chat titles.
- Session home recent list is unchanged (not forced through the 20-row window).
- Workspace home still renders its full grouped list.
- `agent_chat_list` limit stays 100. Subscribe, send, and message flows are untouched.
- `agent_session_status_list` limit stays 100 with the same cursor. No `group_key` request field.
- `AppScreen` `fillWhenShort` behavior in `scroll-end.test.ts` stays as it is.
- Card counts still come from the server `counts` payload when present.
- Copy added for the footer is `Try again`, sentence case.

## Acceptance criteria

- Tapping a Workspace row or a Session card calls `router.push` on a plain href in the same turn. The destination's first commit is a skeleton or at most 20 rows. Nothing on that path awaits a fetch before `push`.
- The destination list pages 20 rows. Reaching the end loads the next page. Loading, end, error + Try again, duplicate end events, and a filter change are covered by S6–S12.
- Server and chat page parameters match the web limits (100 + cursor). Chat behavior otherwise stays as it is.
- S1–S14 have run and are `pass` in Coverage Status, except S15 which stays a manual gap.
- `bunx oxlint --max-warnings=455` exits 0 and the cap in `package.json` is unchanged.
- CI on the PR is green, or a failure is an unrelated known flake called out in the PR. Tests are not skipped to get there.

## Manual verification steps

1. Open Session, tap Done (and one smaller card). Confirm the push and the first screen.
2. Scroll until the next page appears, then until the list ends.
3. Open a workspace from the home list and repeat the scroll.
4. Switch from Done to Running and confirm the list starts at the first page.

## Non-coverage

- iOS simulator and device timing (S15).
- Web sidebar pagination.
- Server-side filtering by `group_key`.
- Virtualization below the 20-row window.

## Coverage Status

Pending implementation. S1–S14 are `planned`. S15 is manual and stays `planned`.
