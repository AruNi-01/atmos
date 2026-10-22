# TECH · QUALITY-025: Mobile list navigation

> Technical design. Workspace rows and Session cards stutter because the destination's first React commit joins and mounts the whole list. This spec makes that first frame a skeleton, then pages the filtered lists at 20 rows.
>
> Zone: QUALITY-025 is the next free QUALITY id, with `TECH.md` and `TEST.md` only. The task asked for that shape for the navigation hitch and the paging that removes it, rather than a four-file `APP-NNN` feature.

## Quality target

| Surface                  | Before                                                                                        | After                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Workspace row → activity | First commit mounts every chat and terminal row when the shared cache is warm                 | Skeleton commits first. Queries and row joins start on the following frame                       |
| Session card → bucket    | First commit joins the warm inbox and invalidates the global list during the push             | Skeleton commits first. Bucket reads a filtered page of 20 and does not invalidate the home list |
| Filtered lists           | Client keeps asking for global pages until a bucket count is filled, or mounts every home row | 20 rows, then the next page when the scroll position reaches the end                             |
| Click-to-first-frame     | Not measured                                                                                  | Dev log `[list-nav] click-to-first-frame target=… ms=…`                                          |

Out of scope: Session swipe-row visuals, token-usage screens, Settings screens, the oxlint warning cap (455), and web sidebar paging (web keeps omitting the new filters and stays on pages of 100).

## Root cause

The press handlers already call `router.push` immediately. Nothing awaits a network call before navigation. The hitch is the destination's first commit on the JS thread, which runs before the native transition can paint.

**Workspace activity** (`WorkspaceHomeList` → `WorkspaceEntryScreen`):

- The row only pushes `/workspace/${id}`.
- The first render calls `useAgentChatList` (page size 100), the terminal-candidate query, `useAgentSessionStatusList` (shared cache, page size 100), and `useTerminalLaunchAgents`.
- `useTerminalLaunchAgents` calls `setCustom(null)` and reads AsyncStorage even when the screen does not need the menu yet.
- When those caches are warm, `workspaceActivityRows` and `terminalActivityFromStatus` run in that commit, and a `SessionSwipeRow` mounts for every row.
- The skeleton only renders when `loading && rows.length === 0`. A warm cache skips it.

**Session bucket** (`SessionHomeScreen` cards → `SessionBucketScreen`):

- The card pushes `/(home)/session/[bucket]`.
- `useSessionInbox` joins every loaded snapshot with every workspace's terminal candidates and the chat-title map (`loadSessionChatTitles` walks up to 20 pages of 100).
- The bucket then filters, sorts, and mounts every matching row.
- Its focus effect invalidates `agent-session-status-list` and `session-terminal-candidates` in that focus commit, so the still-mounted home inbox refetches and re-joins during the push.

TanStack Query starts fetches in effects, after paint. The stutter is the synchronous join plus the focus invalidation, not a missing `await` in the press handler. A cold cache already shows the skeleton (`loading && length === 0`), so the bug shows up when the user has already opened Session or the same workspace.

## Navigation

`markListNavigation(target, detail)` runs synchronously before `router.push`. Targets:

| Target               | Call site                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `workspace-activity` | Workspace home row                                                                              |
| `session-bucket`     | Session home card                                                                               |
| `workspace-chats`    | Chat history route. No press calls it today, so there is no click mark unless a caller is added |

`useListReveal(target, resetKey)`:

1. The first render is a skeleton. List queries stay disabled, and disabled hooks do not flatten a warm cache.
2. The destination effect logs click-to-first-frame (the skeleton commit).
3. `requestAnimationFrame` then marks the screen ready. Queries, joins, and `useTerminalLaunchAgents` I/O start on that following commit.
4. Changing `resetKey` (workspace id or bucket) makes the screen not-ready again without a render-time `setState`. Ready state lives in a module store read with `useSyncExternalStore`, so the hook does not call `setState` inside an effect (mobile oxlint warns on that, and the warning cap has no room).

A deep link with no mark still defers the fetch. `reportListFirstFrame` returns null and leaves any other target's mark in place. A mark older than 3 seconds is dropped. A mark whose `detail` does not match the destination `resetKey` is left in place.

`useTerminalLaunchAgents(false)` returns before `setState` and before AsyncStorage. The rendered list uses a cache only when its `serverId` matches the selected Computer, so a server switch while the hook is inactive does not show the previous Computer's agents on the first active frame.

Session home does not use the reveal hook. Deferring it would flash a skeleton over data the user is already looking at. Its focus invalidation stays, so popping back to home refreshes the inbox.

The bucket passes `useSessionInbox({ active: reveal.ready, groupKey })`. While inactive, the join returns no rows, `sessionWorkspaceSources` / git targets / PR targets stay empty, and `isLoading` stays true (skeleton, not the empty state). A disabled status query still has the warm bootstrap in its cache, so those builders must not read it on the skeleton frame. The bucket focus effect and pull-to-refresh invalidate only that bucket's filtered status key, including when the screen regains focus after a session is opened. They do not invalidate the unfiltered prefix, so the still-mounted home inbox does not refetch. Its notification subscription is off until active, and then it invalidates only the filtered status key. Home focus and home pull-to-refresh still invalidate the unfiltered prefix.

`session-terminal-candidates` and `session-chat-titles` use `staleTime: 60_000`, matching the git and PR queries. Opening a bucket does not restart the all-workspace candidate fan-out or the 20×100 title loop when home already loaded them. Bootstrap `staleTime` is unchanged.

## Pagination

`LIST_PAGE_SIZE` is 20.

`nextListWindow({ shown, loaded, hasNextPage })`:

| Condition                           | Result                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `loaded > shown`                    | Reveal `min(loaded, shown + 20)`. Do not fetch                               |
| `hasNextPage` and `loaded >= shown` | `shown += 20` and fetch                                                      |
| `hasNextPage` and `loaded < shown`  | Fetch, leave `shown` (archive filter shrank the page, or the page was empty) |
| No next page                        | Stay                                                                         |

`fillWhenShort` on `AppScreen` still fills a short viewport. The armed flag in `sessionListShouldRequestNextPage` does not chain-fetch while the user sits at the bottom of a tall list. Screens must not drain pages by comparing `rows.length` to a bucket count.

The reveal window resets to 20 when the workspace home filters or grouping change, including a return to a previous filter. `reconcileListWindow` stores that new page on the render where the key changes, so the previous key's expanded window is not restored.

### Session buckets

`agent_session_status_list` gains optional `group_key` and `context_id`.

- Blank or missing means the unfiltered live catalog. There is no date filter.
- `group_key` is `permission`, `attention`, `running`, or `done`. `idle` is an alias of `done`. Any other non-blank value returns an empty page, not the full list.
- `context_id` is an exact workspace id. Sessions with an empty `context_id` are not in that page.
- The server still materializes the live set, then filters, then pages. `limit` stays clamped to 1…100. Missing or zero still means 100.
- `counts` and `total` are computed before the filter, so web cards and the mobile home cards stay catalog-wide.
- The mobile bucket requests `limit: 20` plus `group_key`. The client still filters and sorts the loaded page (pins float only inside loaded rows).

Query keys:

- Unfiltered, limit 100: `["agent-session-status-list", serverId]`. Home recent (8) and pins stay on this page so a pin outside the newest 20 is not dropped. `hideSession` writes with `setQueriesData` on that prefix, so the unfiltered cache and every filtered bucket or workspace page for the same server drop the row in the same update.
- Filtered: `["agent-session-status-list", serverId, groupKey, contextId, limit]`.
- `invalidateQueries` on the unfiltered prefix still matches filtered keys. The bucket must not use that prefix.

### Workspace activity

- Chats: `agent_chat_list` already has workspace scope, cursor, and limit (server clamps at 200). List screens pass `pageSize: 20`. The default `CHAT_LIST_PAGE_SIZE` stays 100 because `AgentChatThreadScreen` resolves the open chat's title from `useAgentChatList(workspaceId)` and a 20-item page would miss it. The query key includes page size: `["agent-chat-list", serverId, scopeId, wsState, pageSize]`.
- Terminals: `agent_session_status_list` with `context_id` and `limit: 20`.
- The screen merges the loaded pages with the existing timestamp sort and reveals 20 at a time. The next source page is requested only when the reveal window has consumed the loaded rows. This is not a global k-way merge; rows past page 1 can be slightly out of order until both cursors catch up.
- A terminal whose snapshot has an empty `context_id` is absent from the context page unless a later unfiltered snapshot is loaded. This screen does not also scan the unfiltered catalog (that scan is the hitch). Shell windows that never became agent sessions stay out of the list, as they do today.

### Workspace home

`project_workspace_bootstrap` has no cursor. Web and `resolveChatScope` need the full map, so this spec does not page that action. The home list computes the filtered entries, mounts 20 open rows (`pageBlocks`), and reveals 20 more on scroll or when `fillWhenShort` says the viewport is not filled. A section that is already closed keeps its header and passes no row children. A section that is closing keeps only the rows already mounted (`mountedItemCount`) for the 220ms animation, then unmounts them. Closed sections do not spend the 20-row window. A section count stays the full workspace count, not the sliced length. Open sections past the window stay unmounted, including their headers, until the window reaches them.

### Chat history

`AgentChatSessionListScreen` is the same kind of list. `openWorkspaceChatList` has no UI caller. The screen still pages at 20 and defers its fetch under `workspace-chats`.

## Timing log

Dev-only, or any test sink registered with `setListNavSink`.

```text
[list-nav] click-to-first-frame target=workspace-activity ms=12.4 detail=<workspace id>
[list-nav] click-to-first-frame target=session-bucket ms=12.4 detail=running
```

`lastListNavSample()` keeps the last accepted sample. The log is written when a sink is set, or when `__DEV__` is true (same `globalThis.__DEV__` check as `dev-device-import.ts`). Production builds with no sink do not log.

Read it in the Metro or Xcode console of a dev build. The sample is the time from `markListNavigation` to the destination effect, which is the skeleton commit. It is not time-to-data.

## Layers

```text
apps/mobile
  list window, reveal, inbox / workspace / chat screens
        │
        ▼
WsAction agent_session_status_list (existing action, two optional fields)
        │
        ▼
apps/api handler → core-service page_agent_sessions filter
```

No new REST route. No new `WsAction`. `@atmos/api-types` adds the two optional fields on `AgentSessionStatusListRequest`. The existing `WsContract` row already points at that type. Web omits the fields.

`AgentSessionListFilter` is the core-service argument. Counts and total use the unfiltered vec. Cursor and sort stay newest `updated_at`, then larger `session_id`.

## Risks

- Filtered pins only float when that row is on an already loaded page. Home avoids this by keeping the unfiltered page of 100.
- Empty-`context_id` terminals can disappear from a workspace activity list. Loading the unfiltered catalog to recover them brings the hitch back.
- Chat and terminal cursors are independent. The merged order is the order of rows loaded so far.
- `useSyncExternalStore` ready tokens are cleared when the reveal effect cleans up. React Strict Mode reports the mark once (the first effect consumes it) and the second frame still marks the screen ready.

## Audit

The hitch is the destination's first commit, not a request before `router.push`. Read `WorkspaceEntryScreen`, `SessionBucketScreen`, and `useSessionInbox`: a warm cache joins and mounts every row in that commit, and the bucket used to invalidate the unfiltered status prefix from its focus effect. There is no repo-wide line-count command for this change. The executable checks are the unit commands in `TEST.md`.

## Follow-ups

- iOS Simulator timing stays manual (`just dev-mobile`, then `just mobile-ios`).
- Terminals with an empty `context_id` stay off the workspace-filtered page.
- A filtered page that the client then drops entirely can stall `fillWhenShort` when the content height does not change.

## Verification

See `TEST.md`. iOS Simulator is manual (`just dev-mobile`, then `just mobile-ios`) and is not run from the Linux agent environment.
