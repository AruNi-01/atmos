# TEST · QUALITY-026: Mobile Workspace Swipe Rows

> Test Plan · how we verify swipe taps, Recently subtitles, and project-group detail. References TECH QUALITY-026.

## Test strategy

The rules are pure functions on the mobile client. Bun tests lock them. There is no web Playwright journey and no new server behavior. iOS Simulator screenshots are manual and stay out of git. `agent-browser` does not drive the Expo app; those checks are `not_run`.

- Unit: `bun test` on the new helper files under `apps/mobile`.
- Service / WebSocket: no new action. The batch wrapper is the existing `git_get_status_batch` contract.
- End-to-end: none. The mobile harness does not boot a signed-in workspace list in CI.
- Exploratory agent-browser: not applicable (native app).
- Manual: Simulator steps in Manual verification. No `EVIDENCE_PUSH`, no committed screenshots.

## Coverage map

| Requirement                                     | Scenario IDs |
| ----------------------------------------------- | ------------ |
| M1 swipe does not navigate                      | S1, S2, S3   |
| M2 Recently subtitle                            | S4, S5       |
| M3 project-group detail from existing git batch | S6, S7, S8   |
| M4 open row card, light and dark                | S9           |
| Lint cap unchanged                              | S10          |

## Execution map

| Scenario | Level    | Expected tool | Target command / method                                                 | Fixture / data                                | Signals                                                                      | Status |
| -------- | -------- | ------------- | ----------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| S1       | Bun test | `bun test`    | `apps/mobile/src/ui/primitives/swipe-row-press.test.ts`                 | horizontal samples and revealed flags         | `navigate` only for a tap that is not revealed                               | pass   |
| S2       | Bun test | `bun test`    | same file, pan cases                                                    | pan kind, including a small final translation | action is `ignore`                                                           | pass   |
| S3       | Bun test | `bun test`    | same file, revealed tap                                                 | `revealed: true`, kind `tap`                  | action is `close`                                                            | pass   |
| S4       | Bun test | `bun test`    | `apps/mobile/src/features/workspaces/workspace-row-subtitle.test.ts`    | workspace entry with `projectName`            | subtitle is the project name                                                 | pass   |
| S5       | Bun test | `bun test`    | same file                                                               | `kind: "project"`                             | subtitle is `Project`                                                        | pass   |
| S6       | Bun test | `bun test`    | same file                                                               | branch plus uncommitted count                 | `feat · +2`; clean branch has no `+0`                                        | pass   |
| S7       | Bun test | `bun test`    | same file                                                               | project branch, then count fallback           | `Project · main`; `Project · 2 workspaces`; empty project stays `Project`    | pass   |
| S8       | Bun test | `bun test`    | `apps/mobile/src/features/workspaces/workspace-list-git-status.test.ts` | expanded project section, duplicate paths     | one path list; collapsed sections omitted; non-project grouping returns none | pass   |
| S9       | Bun test | `bun test`    | `swipe-row-press.test.ts` chrome cases                                  | `lightColors` and `darkColors`                | open well differs from the card in both schemes; closed radius is 0          | pass   |
| S10      | Review   | `rg`          | root `package.json` script `lint`                                       | this branch                                   | `oxlint --max-warnings=455`                                                  | pass   |

## Scenarios

### S1 — A stationary tap opens the row

- **Level**: Bun test
- **Given**: the row is closed and horizontal movement is 0, or exactly `SWIPE_TAP_SLOP_PX`.
- **When**: the touch is classified and resolved.
- **Then**: the action is `navigate`.
- **Signals**: `swipeRowTouchAction` / `resolveSwipeRowTouch` returns `navigate`.

### S2 — Horizontal movement does not open the row

- **Level**: Bun test
- **Given**: a closed row.
- **When**: absolute horizontal movement is greater than the slop, or the gesture kind is `pan` even if the final translation is back under the slop.
- **Then**: the action is `ignore`.
- **Signals**: return value `ignore` for `+11`, `-40`, and `kind: "pan"` with horizontal `0`.

### S3 — A tap on an open row only closes it

- **Level**: Bun test
- **Given**: action buttons are revealed.
- **When**: the gesture is a tap.
- **Then**: the action is `close`.
- **Signals**: return value `close`. A pan while revealed stays `ignore` and does not navigate.

### S4 — Recently workspace shows its project

- **Level**: Bun test
- **Given**: a workspace entry whose `projectName` is `Atmos`.
- **When**: the Recently subtitle is built.
- **Then**: the string is `Atmos`.
- **Signals**: `recentEntrySubtitle`.

### S5 — A project row in Recently says Project

- **Level**: Bun test
- **Given**: an entry with `kind: "project"`.
- **When**: the Recently subtitle is built.
- **Then**: the string is `Project`.
- **Signals**: `recentEntrySubtitle`.

### S6 — Project-group workspace line

- **Level**: Bun test
- **Given**: branch `feat/list` and an uncommitted count.
- **When**: the workspace subtitle is built.
- **Then**: count `2` yields `feat/list · +2`. Count `0`, missing, or negative yields `feat/list` only. An empty branch yields `No branch`.
- **Signals**: `projectGroupWorkspaceSubtitle`.

### S7 — Project-group project line

- **Level**: Bun test
- **Given**: a project section.
- **When**: the project subtitle is built.
- **Then**: a current branch `main` yields `Project · main`. No branch and two workspaces yields `Project · 2 workspaces`. One workspace uses the singular `workspace`. Zero workspaces yields `Project`.
- **Signals**: `projectGroupProjectSubtitle`.

### S8 — Batch paths follow the web action inputs

- **Level**: Bun test
- **Given**: project grouping, one expanded section and one collapsed section, plus a workspace path shared by two rows.
- **When**: paths are collected.
- **Then**: the list contains the expanded project's `main_file_path` and the expanded workspace `local_path` once. The collapsed section is absent. A non-project grouping returns an empty list.
- **Signals**: `collectProjectGroupStatusPaths`.

### S9 — Open card uses a different fill in light and dark

- **Level**: Bun test
- **Given**: `lightColors` and `darkColors`.
- **When**: chrome is resolved for open and closed.
- **Then**: open radius is `radii.cardNested`. Open well is `colors.background` and is not the card fill. Closed radius is 0 and the well is `transparent`.
- **Signals**: `swipeRowOpenChrome`.

### S10 — Lint cap stays 455

- **Level**: Review
- **Given**: root `package.json`.
- **When**: the `lint` script is read.
- **Then**: it is `oxlint --max-warnings=455`.
- **Signals**: no diff to that script.

## Performance and load budgets

One `git_get_status_batch` for the expanded project-group path set. No per-row `git_get_status`. No budget beyond that.

## Regression checklist

- [ ] Closed rows in a `Section` stay square and flush. Radius applies only while the row is open or moving.
- [ ] Project rows are not swipeable.
- [ ] Session rows and workspace rows both go through `resolveSwipeRowTouch`.
- [ ] `TerminalGroupDrawer` still has no swipe actions.
- [ ] A vertical list scroll is not turned into a navigation tap.
- [ ] Root lint script is still `oxlint --max-warnings=455`.
- [ ] No `EVIDENCE_PUSH` and no screenshot committed under `apps/mobile` or `specs/`.

## Exploratory agent-browser checks

Not run. The surface is the Expo native app, not the web app. `agent-browser` has no mobile workspace session here.

## Acceptance criteria

- [ ] S1–S9 have a passing bun test named in Coverage Status.
- [ ] S10 stays `oxlint --max-warnings=455`.
- [ ] No new `WsAction` and no REST route.
- [ ] `bun --filter @atmos/mobile typecheck` passes.
- [ ] Screenshots are not in the commit.

## Manual verification steps

iOS Simulator, signed in, Computer connected, at least one Project with a workspace. Default home grouping is By Project.

1. Open the Workspace tab (grid icon). Pull to the Recently header. Each workspace line under it shows the project name. Confirm a grouped project row still says `Project`, with a branch or a workspace count when the batch returns.
2. In a Project section, confirm a workspace line shows its branch. If the worktree has uncommitted files, the same line includes `+N`.
3. Swipe a workspace row left or right until the buttons settle. The row is a rounded card; the buttons sit on the page fill, not on the card fill. Repeat in dark mode.
4. While the row is open, tap the card. It closes and the workspace does not open. Swipe and lift. The workspace does not open. Tap the closed row with no sideways movement. The workspace opens.
5. Open the Session tab and repeat step 4 on a session row. The session does not open on a swipe or on a tap of an open row.
6. Open a workspace, then repeat step 4 on a session row inside that workspace.

## Non-coverage

- Pixel comparison of the open card against the Messages app.
- Live `git_get_status_batch` against a Computer in CI.
- Unpushed-count rendering.
- Git detail on Pinned, Recently, or non-project groupings.

## Coverage Status

_Last run: 2026-10-21._

- S1 — ✅ `apps/mobile/src/ui/primitives/swipe-row-press.test.ts` `a stationary tap navigates`
- S2 — ✅ same file, `horizontal movement and a finished pan do not navigate`
- S3 — ✅ same file, `a tap on an open row only closes it`
- S4 — ✅ `apps/mobile/src/features/workspaces/workspace-row-subtitle.test.ts` `recent workspace shows its project name`
- S5 — ✅ same file, `a project row in Recently says Project`
- S6 — ✅ same file, `project-group workspace line shows branch and a positive change count`
- S7 — ✅ same file, `project-group project line prefers the current branch, then the workspace count`
- S8 — ✅ `apps/mobile/src/features/workspaces/workspace-list-git-status.test.ts`
- S9 — ✅ `swipe-row-press.test.ts` `an open row is a rounded card on a different fill in light and dark`
- S10 — ✅ root `package.json` `lint` is `oxlint --max-warnings=455`. `bunx oxlint --max-warnings=455` exited 0 on this tree.
- Command: `bun test apps/mobile/src/ui/primitives/swipe-row-press.test.ts apps/mobile/src/features/workspaces/workspace-row-subtitle.test.ts apps/mobile/src/features/workspaces/workspace-list-git-status.test.ts` — 12 pass, 0 fail.
- `bun --filter @atmos/mobile typecheck` — fails on pre-existing `apps/mobile/src/features/agent-chat/glass-text-button.test.ts` and `open-thread-resync.test.ts`. No diagnostic in the QUALITY-026 files.
- Exploratory agent-browser — not_run. Expo native screen; no mobile workspace session for agent-browser.
- iOS Simulator manual steps — not run. This environment is Linux and has no iOS Simulator.
