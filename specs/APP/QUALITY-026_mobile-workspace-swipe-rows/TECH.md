# TECH · QUALITY-026: Mobile Workspace Swipe Rows

> Technical Design · HOW. Mobile (Expo / React Native) workspace-list swipe behavior, Recently subtitles, and project-group row detail. No BRAINSTORM or PRD: the behavior is fixed by the task, and this file is the contract.

## Scope summary

Addresses four mobile list behaviors. No new WebSocket action, REST route, or server change.

1. **Swipe does not navigate.** A row that can reveal leading or trailing actions opens its destination only on a tap whose horizontal movement stays within the tap slop. Any horizontal pan, including the frame when the finger lifts, does not navigate. A tap while the actions are revealed only closes the row. This covers every list that mounts `SessionSwipeRow`, including the Session list.
2. **Recently subtitles.** Each Recently row shows the Project it belongs to. A row whose own kind is `project` shows the same `Project` label the grouped project row already uses.
3. **Project-group detail.** Workspace rows under the Project grouping show one short secondary line taken from fields the web workspace list already renders: the workspace branch from bootstrap, plus the uncommitted count from `git_get_status_batch` when it is greater than zero. Project rows add one short token from the same batch (`current_branch` of `main_file_path`) or, until that branch exists, the workspace count already in the bootstrap payload. Other groupings stay title-only.
4. **Open row matches the Messages trailing cap.** After a left swipe settles, only the trailing corners are largely rounded, the leading edge is square and flush with the screen, and the row has no stroke. Only that row changes fill. The button bay keeps the same list fill as the rows above and below. The separators directly above and below the moving row hide until it closes. Light and dark both use theme tokens.

Out of scope:

- New `WsAction` / REST routes, including any mobile-only git summary.
- Web sidebar or Recent Workspaces UI changes.
- Git status for Recently, Pinned, or non-project groupings.
- The unpushed-count chip from web `RecentWorkspacesView` (omitted so the line stays one token past the branch).
- `TerminalGroupDrawer`, which renders `SessionRowList` without swipe callbacks.
- `EVIDENCE_PUSH`, hostnames, and screenshots or recordings committed to the repo.
- Raising root `oxlint --max-warnings` above 455.
- Reconciling file overlap with the parallel Token usage, list-pagination / entry-performance, and Settings work.

## Number

`QUALITY-026` is the next free id when the PR opens:

- `origin/main` contains `QUALITY-001`–`QUALITY-021` and `QUALITY-024`.
- Open PRs reserve `QUALITY-022` (`#343`), `QUALITY-023` (`#346`), and `QUALITY-025` (`#350`, mobile Settings).
- `019`–`024` stay skipped.
- This branch first pushed the spec as `QUALITY-025`. `#350` took that id before the implementation PR opened, so the directory moved here. The first spec commit stays in history. No rebase.

## Architecture

```
WorkspaceHomeList / WorkspaceEntryScreen / SessionRowList
  └─ SessionSwipeRow          one implementation, iOS and Android
        ├─ swipe-row-press    tap vs pan vs revealed
        └─ open chrome        transparent well + trailing cap + circular actions
WorkspaceHomeList (grouping === "project", section expanded)
  └─ git_get_status_batch     existing WsContract action
        └─ workspace-row-subtitle / workspace-list-git-status
```

SwiftUI `SwipeActions` (`session-swipe-row.ios.tsx`) does not report horizontal displacement or the settled open state, and it paints full-height action slabs attached to the row. Both platform files are replaced by the shared row so the press rule and the card are the same everywhere `SessionSwipeRow` is mounted.

Call sites today:

| List                                      | File                                                           | Swipe                      |
| ----------------------------------------- | -------------------------------------------------------------- | -------------------------- |
| Workspace home (Pinned, Recently, groups) | `apps/mobile/src/features/workspaces/WorkspaceHomeList.tsx`    | workspace rows             |
| Workspace session list                    | `apps/mobile/src/features/workspaces/WorkspaceEntryScreen.tsx` | every activity row         |
| Session home and bucket lists             | `apps/mobile/src/features/sessions/session-row-list.tsx`       | when `onTogglePin` is set  |
| Terminal group drawer                     | `apps/mobile/src/features/terminal/TerminalGroupDrawer.tsx`    | no (`onTogglePin` omitted) |

## Decisions

### D1. Only a stationary tap navigates

`apps/mobile/src/ui/primitives/swipe-row-press.ts` owns the decision:

- `SWIPE_TAP_SLOP_PX` is 10. Movement at or below that distance is a tap. Movement above it is a pan. The slop exists so a resting finger still counts as a tap; a real horizontal swipe does not.
- `resolveSwipeRowTouch({ kind: "tap", revealed: false })` returns `navigate`.
- `kind: "pan"` always returns `ignore`, including when the finger lifts and the row springs shut, and including when the final translation falls back under the slop after the pan activated.
- `kind: "tap"` while `revealed` returns `close` and does not navigate.

`SessionSwipeRow` removes the inner `Pressable` navigation. A `Gesture.Exclusive` pan (activates past the slop on X, fails if Y wins) and tap (`maxDistance` = the slop) are the only touch path. The pan handler passes `kind: "pan"`. The tap handler passes `kind: "tap"`. A ref set when the pan activates blocks a same-turn tap. Accessibility activation uses the tap path.

`Row` in the workspace lists and `SessionRow` in the session list keep `onPress` only when they are not inside `SessionSwipeRow`. The swipe row receives `onPress` and forwards it only when the helper returns `navigate`.

### D2. Recently subtitle is the project name

`recentEntrySubtitle` in `apps/mobile/src/features/workspaces/workspace-row-subtitle.ts`:

- `kind: "workspace"` returns `projectName` (already filled by `visibleWorkspaceEntries`, falling back to `Other` when the project is missing).
- `kind: "project"` returns `Project`, the same string `WorkspaceHomeList` uses for a grouped project row.

Recently is still built by `recentWorkspaceEntries`, which only emits workspaces. The project branch of the helper is what the row renders if a project entry is placed in that section. This spec does not add a new recent-project source.

Pinned rows and non-project groupings do not gain this subtitle.

### D3. Project-group detail reuses the web list fields and `git_get_status_batch`

Web sources, unchanged:

- Sidebar workspace model field `workspace.branch` (`WorkspaceContent` popover and `RecentWorkspacesView` branch label). Bootstrap already delivers `WorkspaceModel.branch`.
- `gitApi.getStatuses` → `wsRequest("git_get_status_batch", { paths })` in `apps/web/src/api/ws-api.ts`. `RecentWorkspacesView` reads `uncommitted_count` and renders `+N` when `N > 0`.
- `GroupedProjectRow` reads `useGitStatusQuery(project.mainFilePath).data.current_branch`. That hook is `git_get_status` for one path. The batch action returns the same `GitStatusResponse` per path, so the project row uses the batch result instead of a second action.

Mobile calls the existing action through `wsActions.gitGetStatuses` → `client.request("git_get_status_batch", { paths })`. No new contract row.

What each project-group row shows, one secondary line, `numberOfLines` 1:

| Row       | Line                                                                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace | `{branch}` from `WorkspaceModel.branch`. Empty branch becomes `No branch`. When the batch reports `uncommitted_count > 0` for `local_path`, append ` · +{count}`.                                                   |
| Project   | `Project · {current_branch}` when the batch has a non-empty `current_branch` for `main_file_path`. Otherwise `Project · {n} workspace` / `workspaces` from the section's workspace rows. `n === 0` stays `Project`. |

Paths are collected only for expanded project-group sections (`expanded[key] !== false`). Duplicate paths are sent once. An empty path list does not call the action. A missing status, error, or in-flight request still shows the branch or the workspace-count fallback, so the row is never blank once requirement 3 applies.

Unpushed count, base branch, path, labels, priority, and PR chips stay off the row.

### D4. Open swipe row is a trailing cap on the page

`swipeRowOpenChrome(revealed, colors)` and `swipeRowCardFrame(offset)`:

- Swipe sections pass `clip={false}`. The row wrapper keeps `overflow: visible`, so the outer edge can cross the section and sit on the screen edge. `SWIPE_ROW_SCREEN_BLEED` is `spacing.screenX` (18). Closed rows do not paint their own fill (`transparent`), so the section's `cardElevated` and its corner radius stay intact.
- Closed: every corner radius `0`, horizontal margins `0`, well `transparent`, `borderWidth` `0`.
- Left swipe: `marginRight` equals the reveal, so the trailing edge opens the action bay. `marginLeft` moves toward the screen and clamps at `-SWIPE_ROW_SCREEN_BLEED`, so the leading edge is square and flush with the screen instead of carrying the title off it. Only the trailing corners grow to `radii.control` (28). No vertical inset. `borderWidth` stays `0`. While the reveal is still within the screen padding, `marginLeft + marginRight` is `0`. Past that, the row gets narrower on the action side.
- Right swipe (pin) mirrors that: only the leading corners round, and the trailing edge stops at the right screen edge.
- Open row fill is `colors.secondaryBackground`. Dark `#3a3a3c` is one step lighter than the list card `cardElevated` (`#2c2c2e`). Light list rows are already `#ffffff`, so the open row uses `#f2f2f7` (a light gray) instead of a brighter white. It is not `cardElevated` and not the page `background`.
- The button bay paints nothing (`wellBackground` stays `transparent`). The section's `cardElevated` shows through, which is the same fill as the rows above and below. It is not a second page-colored band.
- While `Math.abs(offset) > 0.5`, `onRevealedChange(true)` tells the list to hide the separator before that row and the separator before the next row (`hiddenSwipeSeparatorIndexes`). Both come back when the offset returns. This is display state. It does not change tap versus pan.
- Buttons stay circular and vertically centered in the bay. `SWIPE_ROW_BUTTON_EDGE` (16) is the gap between the cap and the first button, and the inset after the last button. Archive is `colors.swipeArchive` (`#d97706`), delete is `colors.swipeDelete` (`#dc2626`), pin is `colors.swipePin` (`#2563eb`), and the icon is `colors.ctaLabel`. The row component has no hex literals.
- Full-swipe stays off: the row snaps open or shut, it does not fire the action on a long drag. Tap and pan decisions are unchanged (D1).

System swipe actions are not this chrome. SwiftUI `List` `.swipeActions`, UIKit `UISwipeActionsConfiguration`, and `@expo/ui` `SwipeActions` (SDK 56, a host for the same SwiftUI modifier) all draw full-height rectangular action slabs. On iOS 26 those slabs also show the action title next to the icon unless the label style is icon-only. The Messages app on iOS 26 replaced those slabs with round buttons on the list fill ([AppleInsider, Messages iOS 26 vs iOS 18](https://appleinsider.com/inside/ios-26/vs/messages-ios-26-vs-ios-18-playful-useful-changes)); that treatment is not a public `swipeActions` style. Apple DTS has said a circular control has to be a custom drag, and private `UISwipeActionPullView` swizzling is not a supported API. `@expo/ui` `SwipeActions` also only applies inside a SwiftUI `List` hosted by `Host`. These lists are React Native rows (subtitles, pin, archive, delete, pagination, and the tap-versus-pan rule) inside an `AppScreen` scroll view. Moving them into a SwiftUI `List` would replace that structure and would still get the rectangular slabs. The shared row stays.

Revision (2026-10-22): the first landing used a four-corner `radii.cardNested` card, inset on every side, still filled with `cardElevated`. That read as a bordered card on the same fill as the other rows. The next pass clamped the leading edge at the screen padding and painted the button bay with the page color. The page-colored bay was a separate band. This section leaves the bay transparent and hides the two adjacent separators while the row is open. Gesture classification did not change.

### D5. One swipe implementation

Delete the platform split. `session-swipe-row.tsx` is the implementation Metro loads for iOS, Android, and web. `session-swipe-row.ios.tsx` and `session-swipe-row.android.tsx` go away so iOS cannot keep SwiftUI `SwipeActions`.

## Data model

No schema, store, or DTO changes. Helpers are pure:

```ts
type SwipeTouchKind = "tap" | "pan";
type SwipeTouchAction = "navigate" | "close" | "ignore";

function resolveSwipeRowTouch(input: { kind: SwipeTouchKind; revealed: boolean }): SwipeTouchAction;

function recentEntrySubtitle(entry: { kind: "project" | "workspace"; projectName: string }): string;

function projectGroupWorkspaceSubtitle(input: {
  branch: string;
  uncommitted?: number | null;
}): string;

function projectGroupProjectSubtitle(input: {
  currentBranch?: string | null;
  workspaceCount: number;
}): string;
```

`git_get_status_batch` input is `{ paths: string[] }`. Each result is `{ path, status: GitStatusResponse | null, error: string | null }` from `@atmos/api-types/ws/dto/git`.

## Transport

No new messages. Mobile wrapper:

```ts
gitGetStatuses(client, paths) {
  return client.request("git_get_status_batch", { paths });
}
```

The query key includes the computer id, socket state, and the path list. It is disabled unless the socket is open and the path list is non-empty.

## Security and permissions

The batch uses the same Computer socket as the rest of the mobile workspace list. Paths come from bootstrap `local_path` and `main_file_path`. The row renders counts and branch names only. It does not log paths, credentials, or status payloads.

## Rollout

1. Land this spec and the README row.
2. Add the pure helpers and their bun tests.
3. Add `gitGetStatuses` and the project-group query. Render Recently and project-group subtitles.
4. Replace `SessionSwipeRow` and move `onPress` onto it at the three swipe call sites.
5. Run the mobile bun tests and `bun --filter @atmos/mobile typecheck`. `oxlint --max-warnings` stays 455.

## Risks and tradeoffs

- **Risk**: A JS pan will not feel identical to SwiftUI `swipeActions`. Chosen because the native modifier cannot enforce the tap rule or the separate card.
- **Risk**: Animating the open gutter lays out that row during the drag. One row, not the whole list.
- **Tradeoff**: Unpushed commits stay off the line. Web Recent Workspaces shows them; a second chip crowds a 64px row. Uncommitted count is the change count this spec shows.
- **Tradeoff**: Project current branch replaces the workspace-count fallback once the batch returns. The count is what keeps the project row non-empty before that response.
- **Rollback**: revert the mobile list and swipe-row commits. No migration.

## Dependencies and compatibility

- Depends on `project_workspace_bootstrap` and `git_get_status_batch` already on `main`.
- Does not block another spec.
- iOS and Android share the row. There is no simulator job in this PR unless the `ios-parity` label is added, and this spec does not add that label.

## Open questions

None. The tap slop, the omitted unpushed chip, and the project-count fallback are decided above.
