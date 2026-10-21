# TECH · QUALITY-025: Mobile filtered list open

> Technical Design · HOW. Quality spec. No BRAINSTORM or PRD.
> Fixes the hitch when a phone opens a Workspace row or a Session card, and windows the list behind that tap.
> Continues [APP-078](../APP-078_mobile-session-inbox/TECH.md) and [APP-079](../APP-079_mobile-agent-chat/TECH.md). Product identity for the inbox and chat stays there. This file records why the open stalls and how the destination stops doing that work.

## Scope summary

Two existing mobile destinations stall on the tap, then paint a long list:

1. **Session cards** on `SessionHomeScreen` (`permission`, `attention`, `running`, `done`) push `/(home)/session/[bucket]`.
2. **Workspace rows** on `WorkspaceHomeList` push `/workspace/[workspaceId]` (`WorkspaceEntryScreen`).

The press handlers already call `router.push` with no `await`. The hitch is the destination commit. This spec removes that work. It does not defer navigation with `setTimeout`, `InteractionManager`, or a dynamic import.

The list after the tap is a UI window of 20 rows. The server page stays the web page: `agent_session_status_list` `{ limit: 100, cursor }` and `agent_chat_list` `{ limit: 100, cursor }`. Chat subscribe, send, and messages do not change.

Out of scope: paging the workspace home list, a `group_key` filter on the status request, web sidebar changes, new `WsAction` / REST routes, i18n JSON (these screens already use hardcoded English), raising `oxlint --max-warnings` above 455, and the iOS simulator pass (manual, local).

Id selection: `origin/main` at the time of writing has QUALITY-001…021 and QUALITY-024. Open PRs hold QUALITY-022 (#343) and QUALITY-023 (#346). 019–024 are reserved. QUALITY-025 is the next free id. Re-fetch `origin/main` before the spec push; if 025 is taken, use the next integer above 024.

## Quality target

| Item                          | Before                                                                                                                                                                                         | After                                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session card `onPress`        | Sync `router.push`, then the bucket screen invalidates status + terminal candidates on focus and mounts every matching row                                                                     | Sync `router.push(openSessionBucketHref(bucket))`. Bucket surface does not invalidate on focus. Git, PR, and chat titles stay off. Terminal candidates load after paint |
| Workspace row `onPress`       | Sync `router.push`, then `WorkspaceEntryScreen` mounts every merged activity row                                                                                                               | Sync `router.push(openWorkspaceEntryHref(id))`. First paint mounts at most 20 rows                                                                                      |
| Data not ready                | Bucket replaces the list with `ListSkeleton` while `fillWhenShort` chains server pages during the transition. Workspace shows a skeleton only when the cache is empty, otherwise the full list | Skeleton when the filtered cache is empty and a fill is still in flight. Cached rows paint immediately, sliced to the UI window                                         |
| `fillWhenShort` on the bucket | `true` while `rows.length < bucketCount && hasNextPage && !fetchNextPageFailed`, including `rows.length === 0`                                                                                 | Bucket does not pass `fillWhenShort`. The `AppScreen` prop stays for its existing scroll helper                                                                         |
| UI page                       | Entire filtered array                                                                                                                                                                          | `FILTERED_LIST_PAGE_SIZE = 20`. Next 20 on end-reached. Reset to 20 when the bucket or workspace id changes                                                             |
| Server status page            | `limit: 100` literal in `ws-actions.ts`                                                                                                                                                        | Same 100 via `AGENT_SESSION_STATUS_PAGE_SIZE`. Web `SESSION_PAGE_SIZE` is 100. Server `AGENT_SESSION_PAGE_LIMIT` stays 100                                              |
| Server chat page              | `CHAT_LIST_PAGE_SIZE = 100`                                                                                                                                                                    | Unchanged. Web `AGENT_CHAT_SESSIONS_PAGE_LIMIT` is 100                                                                                                                  |
| Next-page failure             | Swallowed (`isFetchNextPageError` nulls the row error). End-reached calls `retryNextPage`                                                                                                      | Status `error`, explicit `Try again`. End-reached does not auto-retry                                                                                                   |
| Duplicate end events          | Status list has `nextPageLock`. Chat `fetchNextPage` returns early. Bucket `fillWhenShort` can still re-enter from layout                                                                      | `beginFilteredListFetch` ignores a second call while `requesting`. `releaseFilteredListFetch` runs from the request promise, not from a `fetching` render               |
| End of list                   | Footer spinner while `isFetchingNextPage`                                                                                                                                                      | Status `end`. Further end events are a no-op                                                                                                                            |
| oxlint cap                    | `oxlint --max-warnings=455`                                                                                                                                                                    | Unchanged                                                                                                                                                               |

## Root cause

The stall is not an `await` in the press handler. Both handlers call `router.push` and return. Session home and the bucket screen share `SessionInboxScreen.tsx`, so the session path is not waiting on a route-module eval. The native push waits on the destination's first commit.

### Session card

`SessionHomeScreen` pushes the bucket. `SessionBucketScreen` mounts a second `useSessionInbox()`.

1. **Focus fan-out on the navigation turn.** `useFocusEffect` invalidates `agent-session-status-list` and `session-terminal-candidates` whenever the hook is focused, including the bucket push. Candidate invalidation reruns `loadSessionCandidates`, which `await`s `terminal_workspace_candidates` for every non-archived workspace (the fan-out [APP-078](../APP-078_mobile-session-inbox/TECH.md) already recorded). Git status, branch PRs, and chat titles are `enabled` only while focused. Chat titles loop up to 20 pages of 100 (`loadSessionChatTitles`). Pushing the bucket moves that fan-out onto the navigation turn.
2. **Full join, then a full mount.** The same commit runs `joinSessionRows` over every loaded snapshot (sort by `session_id`, then a row per terminal/chat snapshot). `SessionBucketScreen` then mounts every row that matches the bucket in non-virtualized `SessionSwipeRow`s. Done is the large bucket. That first frame blocks the native push.
3. **`fillWhenShort` withholds the list and chains pages.** `AppScreen` requests the next global page from `onLayout` / `useEffect` while `fillWhenShort` is true. The bucket sets that flag when `rows.length < card count` and the status query has another page. A sparse bucket (few matches in the first server page of 100) stays on `ListSkeleton` and pulls further 100-row server pages during the transition. Counts are computed on the server for the full set before paging, so the card count can be far ahead of the rows loaded so far.

`QueryClient` `staleTime` is 15s and `retry` is 1. A warm cache still pays (2) and (3). A cold cache pays (1) as well. `enabled: false` still returns cache written by another observer, so the bucket can read enrichment the home screen already fetched without starting it again.

### Workspace row

`WorkspaceHomeList.openEntry` is a synchronous `router.push`. There is no focus-invalidation fan-out on this path. `useTerminalLaunchAgents` fetches in `useEffect` after paint, so it is not the blocker.

`WorkspaceEntryScreen` merges the chat index (`CHAT_LIST_PAGE_SIZE = 100`) with every terminal row scanned from the shared global session pages, then mounts **all** `orderedRows` on the first commit. `loading` is `chats.loading || sessions.isLoading`, but any cached rows render in full immediately. Warm cache is a large first frame, not a skeleton. `activityPinId` scans snapshots per rendered row, so the scan grows with the mounted list. Next-page errors are hidden: chat `error` drops `isFetchNextPageError`, and the status `InlineError` is null when `sessions.isFetchNextPageError`.

The workspace **home** list is not this bug. It is not paged by this spec.

## Architecture overview

```
Session card press
  openSessionBucketHref(bucket)          // plain object, same turn
  router.push(href)                      // no await
    SessionBucketScreen
      useSessionInbox({ surface: "bucket", bucket })
        refreshesOnFocus === false       // no invalidate
        loadsEnrichment === false        // git / PR / chat titles stay disabled
        useBucketCandidateLoad           // terminal candidates after paint, again when bucket session ids change
        snapshotsForBucket before join   // unknown group_key maps to done, same as asBucket
      useFilteredListWindow(filterKey = bucket)
        first frame: skeleton | empty | rows.slice(0, visibleCount)   // visibleCount starts at 20
        auto-fetch only while loaded < min(visible, 20)
        end-reached: reveal +20 from cache, or one server page, or end
        filter change: visibleCount = 20 on that render

Workspace row press
  openWorkspaceEntryHref(id)
  router.push(href)
    WorkspaceEntryScreen
      same window over orderedRows
      server limits stay 100 + cursor
```

No new crate, table, or wire message. The oxlint cap in `package.json` stays `--max-warnings=455`.

## Module-by-module design

### Navigation hrefs

**`apps/mobile/src/features/sessions/list-navigation.ts`**

```ts
export function openSessionBucketHref(bucket: SessionBucket): {
  pathname: "/(home)/session/[bucket]";
  params: { bucket: SessionBucket };
};

export function openWorkspaceEntryHref(workspaceId: string): {
  pathname: "/workspace/[workspaceId]";
  params: { workspaceId: string };
};
```

Both return a plain object. They do not fetch and do not return a `Promise`. Call sites pass the object straight to `router.push`.

`SessionHomeScreen` card `onPress` uses `openSessionBucketHref`. `WorkspaceHomeList` uses `openWorkspaceEntryHref`. Row opens inside the destination (a session row, a chat, a terminal) stay as they are.

### Inbox surface

**`apps/mobile/src/features/sessions/session-inbox-surface.ts`**

```ts
export type SessionInboxSurface = "home" | "bucket";

export function sessionInboxLoadsEnrichment(surface: SessionInboxSurface): boolean;
export function sessionInboxRefreshesOnFocus(surface: SessionInboxSurface): boolean;
```

Both are `true` only for `"home"`.

**`useSessionInbox(options?)`** in `use-session-inbox.ts`. Default `surface` is `"home"`, so `SessionHomeScreen` keeps today's focus refresh and enrichment.

Bucket:

- `useFocusEffect` still runs (hooks order). The body returns immediately when `sessionInboxRefreshesOnFocus` is false, so it does not invalidate the status list or the candidate query.
- Git, PR, and chat-title queries set `enabled` only when `sessionInboxLoadsEnrichment` is true (and their existing connection / target checks). The candidate `useQuery` stays on that same flag, so the opening commit does not call `loadSessionCandidates`. `enabled: false` still reads cache and still observes `fetchQuery` writes.
- The status infinite query stays enabled. Paging and live rows need it. Its query key stays `["agent-session-status-list", selectedServerId]`. Page size stays 100. Workspace entry and session home share this cache; do not shrink it to 20.
- Snapshots passed to `joinSessionRows` are `snapshotsForBucket(sessions, bucket)` when `surface === "bucket"` and the bucket is known. An unknown bucket joins nothing.
- `chatTitlesPending` is true only when enrichment is enabled and the chat-title query has not succeeded. A bucket with enrichment off does not keep rows in a pending-title skeleton.
- The notification subscription stays. It runs in `useEffect` after paint. It invalidates the status list. Home also invalidates the candidate query. The bucket does not: a disabled candidate query would not refetch. `useBucketCandidateLoad` fetches after paint when `sessionKey` (the bucket's `session_id`s) or `reloadKey` (the workspace set) is non-empty, and again when either changes. That is how a terminal that appears while the bucket stays open gets a title other than the raw session id. `fetchQuery` uses `staleTime: 0` so the shared 15s cache does not skip that reload. The opening render does not call it.
- Pull-to-refresh still calls `refresh()`. Home invalidates candidates. The bucket `fetchQuery`s them, because invalidate would not run a disabled query.
- The memo's loading dependency matches the loading read (`bootstrapQuery.isLoading`). Home behavior stays the early empty model while status or bootstrap is loading.

**`apps/mobile/src/features/sessions/session-inbox.ts`**

```ts
export function snapshotMatchesBucket(groupKey: string, bucket: SessionBucket): boolean;
export function snapshotsForBucket<T extends { group_key: string }>(
  snapshots: readonly T[],
  bucket: SessionBucket,
): T[];
```

`snapshotMatchesBucket` is `(isSessionBucket(groupKey) ? groupKey : "done") === bucket`, the same rule as private `asBucket`.

Bucket rows still go through `sortSessionRowsByRecency` and `orderPinnedRows` on the filtered loaded set, then the UI window slices. Pins need the filtered set, not the mounted window. The view tree mounts the slice.

### UI window

**`apps/mobile/src/features/sessions/filtered-list-page.ts`** (no React, no React Native).

```ts
export const FILTERED_LIST_PAGE_SIZE = 20;
export type FilteredListStatus = "loading" | "ready" | "loading-more" | "error" | "end";

export function syncFilteredListFilter(
  current: { key: string; visibleCount: number },
  filterKey: string,
): { key: string; visibleCount: number };

export function filteredListFirstFrame<T>(input: {
  pending: boolean;
  rows: readonly T[];
  visibleCount: number;
  hasNextServerPage: boolean;
  fetchFailed: boolean;
}): { mode: "skeleton" | "empty" | "rows"; rows: readonly T[] };

export function filteredListStatus(input: {
  pending: boolean;
  loadedCount: number;
  visibleCount: number;
  hasNextServerPage: boolean;
  fetching: boolean;
  fetchFailed: boolean;
}): FilteredListStatus;

export function filteredListShouldFetch(input: {
  loadedCount: number;
  visibleCount: number;
  hasNextServerPage: boolean;
  fetching: boolean;
  fetchFailed: boolean;
}): boolean;

export function advanceFilteredList(input: {
  visibleCount: number;
  loadedCount: number;
  hasNextServerPage: boolean;
  fetching: boolean;
  fetchFailed: boolean;
}): { visibleCount: number; fetch: boolean };

export function visibleCountAfterServerPage(input: {
  visibleCount: number;
  previousLoadedCount: number;
  loadedCount: number;
}): number;

export type FilteredListFetchLatch = { requesting: boolean; generation: number };

export function beginFilteredListFetch(
  latch: FilteredListFetchLatch,
  input: { fetching: boolean; fetchFailed: boolean; hasNextServerPage: boolean },
): { latch: FilteredListFetchLatch; fetch: boolean };

export function releaseFilteredListFetch(
  latch: FilteredListFetchLatch,
  generation: number,
): FilteredListFetchLatch;

export function retryFilteredListFetch(latch: FilteredListFetchLatch): {
  latch: FilteredListFetchLatch;
  fetch: true;
};
```

Rules:

- `syncFilteredListFilter` returns the same object when the key matches. A new key sets `visibleCount` to 20. `reduceFilteredListWindow` applies that reset and `visibleCountAfterServerPage`. The hook stores the result in React state. When the reducer returns a new object, the hook calls `setState` during that render so the same paint uses the new window. That adjustment is the path `react/set-state-in-render` allows; the hook does not read or write a ref during render (`react/refs` is a warning on mobile, and the oxlint cap has no spare warnings). The screen also sets `key` to the bucket or workspace id so a param change remounts.
- `filteredListFirstFrame`: zero rows and not `fetchFailed`, and (`pending` or `hasNextServerPage`) → `{ mode: "skeleton", rows: [] }`. Zero rows otherwise → `empty`. Otherwise `rows.slice(0, visibleCount)`. A warm cache of 500 rows with `visibleCount === 20` returns 20 rows and mode `rows`, never a skeleton and never the full array.
- `filteredListStatus`: `fetchFailed` → `error` (wins over the spinner). Else zero loaded and (`pending` or `hasNextServerPage`) → `loading`. Else `fetching` and `visibleCount >= loadedCount` and `hasNextServerPage` → `loading-more`. Else `loadedCount <= visibleCount` and no next server page → `end`. Else `ready`.
- `filteredListShouldFetch` is the post-paint auto-fill for the **first** UI page only. False when `fetching`, `fetchFailed`, or there is no next server page. Otherwise true when `loadedCount < min(visibleCount, 20)`. A sparse bucket keeps asking for the next server page of 100 until 20 filtered rows exist or the server ends. It does not expand the window past 20 by itself.
- `advanceFilteredList` is the end-reached decision. `fetching` or `fetchFailed` → ignore (`fetch: false`, same `visibleCount`). `visibleCount < loadedCount` → reveal `min(visibleCount + 20, loadedCount)` and do not fetch. Else if `hasNextServerPage` → same `visibleCount`, `fetch: true`. Else no-op (end). One call reveals at most 20 more rows.
- `visibleCountAfterServerPage` grows the window only when a new server page arrived **and** the user had already consumed a full previous page (`previousLoadedCount >= 20` and `visibleCount >= previousLoadedCount`). The bump is `+20`, capped by `loadedCount`. An auto-fill from 0 loaded rows to N does not move `visibleCount`.
- `beginFilteredListFetch` returns `fetch: false` when `requesting`, `fetching`, `fetchFailed`, or there is no next page. Otherwise it returns a new latch `{ requesting: true, generation: previous + 1 }` and `fetch: true`.
- `releaseFilteredListFetch` clears `requesting` when `generation` is still the latch's generation. A stale settle returns the same latch. It does not take a `fetching` flag. Waiting for a render where `fetching` became true left the latch stuck when a fast request committed only the settled update.
- `retryFilteredListFetch` returns `{ latch: { requesting: true, generation: previous + 1 }, fetch: true }`. The Try again control uses this path so a failed page can be asked for again. End-reached does not.

**`apps/mobile/src/features/sessions/use-filtered-list-window.ts`**

Thin hook. Owns the window state (`filterKey`, `visibleCount`, `previousLoadedCount`) and a fetch latch ref `{ requesting, generation }`. The latch ref is touched only from effects, press handlers, and the request promise's `finally`. `fetchNext` and `retryNext` return `boolean | Promise<boolean>`. Status and chat `fetchNextPage` / `retryNextPage` return the react-query promise (`false` when the call does not start). The workspace screen waits for both promises with `Promise.all`.

`onEndReached` applies `advanceFilteredList`. A larger `visibleCount` is `setState` from that handler. When `fetch` is true, `beginFilteredListFetch` then `fetchNext`. The promise `finally` calls `releaseFilteredListFetch` for that generation even if `fetching` never rendered `true`. An effect applies `filteredListShouldFetch` (first page only) through the same start path. If that effect already ran while the latch was held, the `finally` starts one more fill when the list is still short. `retry` applies `retryFilteredListFetch` and calls `retryNext` even though `fetchFailed` is still true. No effect calls `setState` (`react/set-state-in-effect` is a warning on mobile).

The hook does not import React Native. Pager decisions stay on the pure module. Hook render tests mount this hook and `useBucketCandidateLoad` with `react-dom` and `happy-dom`.

### Bucket screen

**`SessionBucketScreen`** reads `useSessionInbox({ surface: "bucket", bucket })`. It orders and pins the inbox rows, then passes that array to the window. It does not compute `fillWhenShort` and does not pass it to `AppScreen`.

First frame from `filteredListFirstFrame`:

- `skeleton` → `ListSkeleton`
- `empty` → the existing empty copy (`No sessions` / `This list is empty.`)
- `rows` → `SessionRowList` of that slice only

`onEndReached` is the window's `onEndReached`, not `retryNextPage`. Footer is `FilteredListFooter`: `loading-more` shows `ListLoadMoreFooter`; `error` shows a `Pressable` labeled `Try again` (sentence case, not a CSS uppercase label). Initial load errors still use `InlineError` for the inbox `error` string. A next-page failure is the footer, not a second automatic request.

`inbox.fetchNextPage` is what the window calls for the next status page. The existing `nextPageLock` in `use-agent-session-status-list.ts` stays and clears in that promise's `finally`. The window latch covers the same interval without watching a loading render, including the chat list, which has no lock of its own.

### Workspace entry

**`WorkspaceEntryScreen`** builds `orderedRows` as it does now, then runs the same window with `filterKey = workspaceId`.

- `pending` = `(chats.loading || sessions.isLoading) && orderedRows.length === 0`
- `hasNextServerPage` = `chats.hasNextPage || sessions.hasNextPage`
- `fetching` = `chats.isFetchingNextPage || sessions.isFetchingNextPage`
- `fetchFailed` = `chats.isFetchNextPageError || sessions.isFetchNextPageError`
- `fetchNext` calls each list's `fetchNextPage` and resolves `true` when either call started a request (each resolves `false` when it has no next page, is already fetching, or — for `fetchNextPage` — the previous page failed)
- `retryNext` calls each list's `retryNextPage` the same way, including after a next-page error
- `retry` calls each list's `retryNextPage`

The first frame uses the same skeleton / empty / slice rule. `onEndReached` is the window, not a direct `retryNextPage`. Next-page errors that those hooks currently hide become the footer `Try again`. Initial errors stay on `InlineError`.

Do not page `WorkspaceHomeList`.

### Server page size

**`apps/mobile/src/api/session-status-page.ts`**

```ts
/** Matches web `SESSION_PAGE_SIZE` and server `AGENT_SESSION_PAGE_LIMIT`. */
export const AGENT_SESSION_STATUS_PAGE_SIZE = 100;
```

`wsActions.agentSessionStatusList` sends `{ limit: AGENT_SESSION_STATUS_PAGE_SIZE, cursor }`. The api module does not import from `features/`. `AgentSessionStatusListRequest` stays `{ limit?, cursor? }`. No `group_key` field.

`CHAT_LIST_PAGE_SIZE` stays 100. `loadSessionChatTitles` stays a home-only enrichment loop at 100. Do not import web code into mobile; the test locks the numeric equality.

Web `WORKSPACE_LIST_PAGE_SIZE` (10) is a web sidebar window. It is not the mobile contract. Mobile's 20 is the destination UI window only.

### Footer

**`apps/mobile/src/features/sessions/filtered-list-footer.tsx`**

`FilteredListFooter` renders nothing for `ready`, `end`, and `loading` (the list body already shows the skeleton). `loading-more` renders `ListLoadMoreFooter`. `error` renders `Try again`. No component is created inside render (`react/static-components`).

## Risks

- Bucket git, PR, and chat-title fan-out stay off, including on a deep link. Terminal candidates load after the first paint, so a bucket that never opened Session home still picks up titles without holding the push. Until that fetch returns, a row can show the session-id fallback. Home still enriches when it is focused.
- A dense bucket still joins every loaded snapshot in that bucket (a server page is up to 100, and older pages append). The mounted tree is the 20-row window. Joining a later page happens after the fetch, not instead of the first paint.
- Shared status cache: a bucket auto-fill appends global pages. Session home and other workspace entries observe those pages. Page size stays 100 so their cursors stay aligned with web.
- `fillWhenShort` remains on `AppScreen`. Only the bucket used it. Leaving the prop avoids a behavior change in the scroll helper tests.

## Follow-ups

- iOS simulator check of the tap, the skeleton, and the 20-row footer. Not part of this change's automated gate.
- Virtualizing the window if a single row's mount cost is still visible at 20. Not required to remove the full-catalog first frame.
- A server `group_key` filter would shrink sparse-bucket auto-fill. Web does not send one. This spec does not add it.
- Workspace entry still merges two newest-first cursors with `workspaceActivityRows` (`agent_chat_list` for that workspace, and the shared global status pages filtered to that workspace) and sorts by `updatedAt`. A later page of either cursor can insert a row above one already taken from the other, so the merged list is not a stable prefix. A correct bound would hide a loaded row until the other cursor's oldest loaded record is at least as old. On the terminal side that bound is the oldest global status snapshot, not the oldest row in this workspace, so filling 20 stable rows can walk status pages that belong to other workspaces. Pins pulled to the top would also need an exception or a loaded pin past the bound would disappear. That behavior change is left for a separate follow-up. This spec does not change the merge.

## Verification commands

```bash
bun test apps/mobile/src/features/sessions/filtered-list-page.test.ts \
  apps/mobile/src/features/sessions/filtered-list-hooks.test.tsx \
  apps/mobile/src/features/sessions/list-navigation.test.ts \
  apps/mobile/src/features/sessions/session-inbox.test.ts \
  apps/mobile/src/features/agent-chat/chat-list-page.test.ts
bun test apps/mobile
bun --filter @atmos/mobile typecheck
bunx oxlint --fix <changed paths>
bunx oxfmt <changed paths>
bunx oxlint --max-warnings=455
```

The cap invocation must exit 0 without editing `package.json`.
