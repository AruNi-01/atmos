# TEST · APP-078: Mobile Session Inbox

> Test Plan · how we verify the phone Session inbox and the per-session Agent snapshot. References PRD APP-078 and TECH APP-078.

## Test strategy

Bucket rules and the inbox join are pure functions. Prove those in Rust and Bun. The new WebSocket action is a thin handler over the same snapshot, covered by an API test if the router harness already exists; otherwise the Rust unit tests are the contract. There is no Playwright harness for Expo, so the phone chrome is manual plus the Bun helpers. Web sidebar rollup gets a regression assertion that `list_workspace_agent_groups` still omits Done and still collapses two panes.

- Unit: Rust snapshot; Bun inbox join, subtitle, PR pick.
- Service-level: existing workspace-group tests stay green.
- WebSocket/API-level: action name is in the extracted catalog.
- End-to-end: none for mobile. No new web E2E; APP-058 web grouping must not change.
- Exploratory: iOS simulator walkthrough of the tabs. Agent-browser does not drive the Expo app.
- Manual: glass tab bar, large titles, and opening a pane.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S14 |
| M2 | S2 |
| M3 | S3 |
| M4 | S4, S5 |
| M5 | S6 |
| M6 | S7, S8 |
| M7 | S9, S10 |
| M8 | S11, S12 |
| M9 | S13 |
| M10 | S15, S16 |
| M11 | S17 |
| M12 | S11, S18 |
| M13 | S19 |
| M14 | S20, S21, S22 |
| M15 | S23 |
| M16 | S24, S25 |
| M17 | S26 |
| M18 | S27 |
| N1 | deferred |
| N2 | deferred |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Manual | iOS simulator | `cd apps/mobile && bun run ios` | signed-in Computer | Tab bar shows Workspace and Session | planned |
| S2 | Manual | iOS simulator | same as S1 | bootstrap with one workspace | Workspace list still opens `/workspace/:id`; title is native | planned |
| S3 | Manual | iOS simulator | same as S1 | signed out | Workspace shows connect; Session shows not-connected empty state | planned |
| S4 | Bun | `bun test` | `apps/mobile/src/features/sessions/session-inbox.test.ts` | four panes, one per bucket | counts and card order permission, attention, running, done | planned |
| S5 | Bun | `bun test` | same file | zero panes | all four counts are 0 | planned |
| S6 | Bun | `bun test` | same file | mixed buckets | bucket filter returns only that key | planned |
| S7 | Bun | `bun test` | same file | six timestamped panes | recent list length 5, newest first | planned |
| S8 | Bun | `bun test` | same file | pane with `updatedAt: null` | absent from recent, present in done | planned |
| S9 | Bun | `bun test` | same file | two candidates, one workspace | two rows | planned |
| S10 | Bun | `bun test` | same file | one chat snapshot, one side-chat candidate | chat dropped; side-chat kept | planned |
| S11 | Rust | `cargo test` | `cargo test -p core-service session_agent_group` | two panes, one context | two snapshots; workspace rollup still one group and omits done | planned |
| S12 | Rust | `cargo test` | same | idle sweep then attention latch | snapshot remains attention; no live idle row required | planned |
| S13 | Bun | `bun test` | `session-row-subtitle.test.ts` | partial names, project-scoped pane | middle-dot line omits empty segments and workspace | planned |
| S14 | Manual | iOS simulator | S1 | switch tabs twice | tab state not remounted from a dynamic hide | planned |
| S15 | Bun | `bun test` | `pick-branch-pr.test.ts` | two PRs, one head match, draft flag | highest matching number; draft beats open | planned |
| S16 | Bun | `bun test` | same | empty list / thrown lookup | `prState` null | planned |
| S17 | Manual | iOS simulator | open a row | workspace with two windows | terminal strip selects the tapped window | planned |
| S18 | Rust + catalog | `cargo test` and `bun run --filter @atmos/api-types check-actions` | extract fixtures include `agent_session_status_list` | — | action listed; response has `sessions` | planned |
| S19 | Bun | `bun test` | inbox reducer test | running snapshot then permission event for same pane | pane moves to permission; counts follow | planned |
| S20 | Rust | `cargo test` | `cargo test -p core-service session_agent_catalog` | pane goes idle, then idle cleanup, then a fresh service loaded from the same DB | row still listed as done with the stored time; live map empty | planned |
| S21 | Rust | `cargo test` | same | archive that session id; workspace `is_archived` on another | both omitted from the list | planned |
| S22 | Rust | `cargo test` | same | running pane receives another running progress event, then Done, then Running | one write on enter Running, none on progress, one on Done, one on Running again; `updated_at` never moves backwards | planned |
| S23 | Bun | `bun test` | `apps/web` sidebar view parse test | missing `workspace_sidebar.view` | parsed view is `workspace` | planned |
| S24 | Bun | `bun test` | `apps/web/src/app-shell/sidebar/session-grouping.test.ts` | two terminals and one chat in one workspace | three rows; chat kept | planned |
| S25 | Bun | `bun test` | same | row formatter | line one is title and time; line two joins project, workspace, branch, PR and skips empties | planned |
| S26 | Bun | `bun test` | same | agent group-by with two panes in one workspace, one running and one permission | two groups; workspace rollup helper still returns one permission group | planned |
| S27 | Manual | Web sidebar | open a terminal row and a chat row | one workspace with both surfaces | terminal focuses that pane; chat opens that Agent Chat; kanban board stays workspace cards | planned |

## Scenarios

### S1 — Tabs stay on the home

- **Level**: Manual
- **Given**: a dev build signed in to one online Computer.
- **When**: the home screen appears.
- **Then**: a glass bottom bar shows Workspace and Session. Session is reachable without a workspace push. Sheets still present from the root stack.
- **Signals**: both labels visible; no third tab.

### S2 — Workspace list still opens a terminal

- **Level**: Manual
- **Given**: S1, one workspace in the list.
- **When**: the builder opens that workspace from the Workspace tab.
- **Then**: the terminal screen opens. The home title is the system large title Workspace, and Filter / Settings are icon buttons.
- **Signals**: route `/workspace/:id`; no second “Workspace” text in the scroll body.

### S3 — Disconnected Session does not sign in again

- **Level**: Manual
- **Given**: no device credential, or the socket is closed.
- **When**: the builder opens Session.
- **Then**: an empty state says the Computer is not connected. The Workspace tab still shows the existing connect screen.
- **Signals**: one sign-in surface; Session has no QR scanner.

### S4 — Card order and counts

- **Level**: Bun
- **Given**: panes classified permission, attention, running, and done.
- **When**: the inbox summary is built.
- **Then**: the four cards are in that order and each count matches the rows.
- **Signals**: ordered keys and numeric counts.

### S5 — Empty inbox

- **Level**: Bun
- **Given**: no candidates.
- **When**: the summary is built.
- **Then**: four counts are 0 and the recent list is empty.
- **Signals**: zero counts; recent length 0.

### S6 — Bucket list

- **Level**: Bun
- **Given**: S4’s rows.
- **When**: the permission bucket is selected.
- **Then**: only permission rows remain.
- **Signals**: every returned row has bucket permission.

### S7 — Top five by status time

- **Level**: Bun
- **Given**: six panes with RFC3339 `updatedAt` values.
- **When**: recent rows are taken.
- **Then**: five rows, newest first.
- **Signals**: length 5; timestamps strictly descending.

### S8 — No time stays out of recent and in Done

- **Level**: Bun
- **Given**: a candidate with no matching status snapshot.
- **When**: the inbox is built.
- **Then**: the row’s bucket is done, `updatedAt` is null, and it is not in recent.
- **Signals**: bucket done; recent ids do not include it.

### S9 — Two panes, one workspace

- **Level**: Bun
- **Given**: two candidates with the same `workspace_id` and different tmux window names.
- **When**: rows are joined.
- **Then**: two rows share project, workspace, and branch, and differ by title.
- **Signals**: row count 2; distinct titles.

### S10 — Chat hidden, side-chat shown

- **Level**: Bun
- **Given**: a status snapshot `surface: chat` and a terminal candidate whose window is a side-chat pane.
- **When**: rows are joined.
- **Then**: the chat snapshot produces no row. The side-chat candidate does.
- **Signals**: no row with a `chat:` id; side-chat title present.

### S11 — Per-session snapshot does not collapse

- **Level**: Rust
- **Given**: two terminal status rows with the same `context_id` and different pane ids, one running and one permission.
- **When**: `list_agent_session_statuses` and `list_workspace_agent_groups` run.
- **Then**: the session list has two entries (permission and running). The workspace list has one permission entry and no done entry.
- **Signals**: session len 2; workspace group key permission only.

### S12 — Attention survives idle sweep

- **Level**: Rust
- **Given**: a pane goes running, then terminal-idle, then idle rows are cleared.
- **When**: session statuses are listed.
- **Then**: the pane is still present with group attention and an `updated_at`.
- **Signals**: group key attention; sessions map empty.

### S13 — Subtitle omits missing parts

- **Level**: Bun
- **Given**: a project-scoped pane with project and branch set and workspace name null, and a second pane missing branch.
- **When**: subtitles are formatted.
- **Then**: the first line has no empty slot where the workspace name would be. The second line has no trailing dot.
- **Signals**: strings equal the joined non-empty parts.

### S14 — Tabs are not toggled with auth

- **Level**: Manual
- **Given**: S1, then sign out, then sign in again.
- **When**: home is shown in both states.
- **Then**: Workspace and Session are both still on the tab bar.
- **Signals**: two tabs before and after.

### S15 — PR follows the head branch

- **Level**: Bun
- **Given**: branch `feat/a`, one open PR on `feat/a`, one draft PR on `feat/a` with a higher number, one open PR on `feat/b`.
- **When**: the branch PR is picked.
- **Then**: the result is the draft with the higher number.
- **Signals**: `prState` draft; number is the higher one.

### S16 — PR lookup miss

- **Level**: Bun
- **Given**: an empty PR list, or the lookup function rejects.
- **When**: the row is decorated.
- **Then**: `prState` is null and the rest of the row remains.
- **Signals**: null PR; title and branch unchanged.

### S17 — Tap focuses the pane

- **Level**: Manual
- **Given**: a workspace with two tmux windows, both listed on Session.
- **When**: the builder taps the second row.
- **Then**: the terminal screen shows that window’s tab selected.
- **Signals**: selected tab label equals the row title.

### S18 — Action is in the contract

- **Level**: Rust catalog
- **Given**: the handler and `WsContract` row exist.
- **When**: `bun run --filter @atmos/api-types check-actions` runs.
- **Then**: `agent_session_status_list` is an extracted action with an empty input and a `sessions` array output.
- **Signals**: check-actions exit 0.

### S20 — Done survives idle cleanup and a new process

- **Level**: Rust
- **Given**: a pane reports running, then terminal-idle, and the idle cleanup job deletes the live row.
- **When**: statuses are listed, and listed again from a new service on the same database with an empty live map.
- **Then**: the pane is Done both times, with the same `updated_at`. It is not running.
- **Signals**: group key done; `updated_at` unchanged; live session map empty after cleanup.

### S21 — Archive hides the pane

- **Level**: Rust
- **Given**: a catalog row for pane A, and a row whose `context_id` is an archived workspace.
- **When**: pane A is archived and statuses are listed.
- **Then**: neither row is returned.
- **Signals**: list contains neither session id.

### S22 — Same bucket does not write

- **Level**: Rust
- **Given**: a pane enters Running, then more Running progress arrives, then it becomes Done, then Running again.
- **When**: catalog writes are counted.
- **Then**: progress while still Running does not write. Each bucket change writes once, asynchronously. A slower earlier write does not overwrite a later `updated_at`.
- **Signals**: write count is 3 (Running, Done, Running); stored time equals the last transition.

### S23 — Sidebar view defaults to workspaces

- **Level**: Bun
- **Given**: sidebar settings with no `view` field.
- **When**: the saved view is parsed.
- **Then**: the view is `workspace`.
- **Signals**: parsed value `workspace`.

### S24 — Web session list includes chat

- **Level**: Bun
- **Given**: two terminal panes and one Agent Chat in the same workspace.
- **When**: the sidebar session list is built.
- **Then**: three rows are returned. The phone join of the same inputs still drops the chat.
- **Signals**: web length 3; mobile length 2.

### S25 — Sidebar row matches the phone row

- **Level**: Bun
- **Given**: a session with project, workspace, branch, and an open PR.
- **When**: the row subtitle is formatted.
- **Then**: the second line is those parts joined with a middle dot. A missing branch leaves no empty slot.
- **Signals**: joined string with no double dots.

### S26 — Group By agent uses the session bucket

- **Level**: Bun
- **Given**: one workspace with a running pane and a permission pane.
- **When**: sessions are grouped by agent, and workspaces are grouped by agent.
- **Then**: sessions form two groups. Workspaces still form one permission group.
- **Signals**: session group keys `running` and `permission`; workspace group key `permission` only.

### S27 — Opening a session row

- **Level**: Manual
- **Given**: Web or Desktop with one terminal pane and one Agent Chat.
- **When**: View is Session and each row is activated.
- **Then**: the terminal row focuses that pane. The chat row opens that chat. The kanban board still shows workspace cards, and its filter menu has no View section.
- **Signals**: focused pane title; open chat id; kanban cards unchanged.

### S19 — Live permission moves the pane

- **Level**: Bun
- **Given**: a pane snapshot in running, then an occupancy event permission for the same pane id.
- **When**: the inbox store applies the event.
- **Then**: the pane’s bucket is permission and the running count drops by one.
- **Signals**: bucket permission; counts differ by one.

## Performance & load budgets

- Session focus with 20 workspaces may issue one candidates call each. No numeric budget in v1. If focus feels stuck, that is the follow-up noted in TECH, not a merge blocker.
- PR calls are deduped by owner, repo, and branch. Do not call GitHub once per pane.

## Regression checklist

- [ ] `list_workspace_agent_groups` still omits Done and still rolls two panes into one context.
- [ ] Workspace-view By Agent Status still rolls two panes into one workspace group.
- [ ] Kanban filter menu does not show View. Session view does not replace kanban cards.
- [ ] Session does not render a `chat:` row.
- [ ] A GitHub error does not blank the Session list.
- [ ] Custom Workspace header text is gone; settings still open the settings sheet.
- [ ] Device credentials are not logged from the new status path.

## Exploratory agent-browser checks

Not used. This feature’s UI is Expo native, and agent-browser does not drive that app. The manual scenarios S1–S3, S14, and S17 cover the chrome.

## Acceptance criteria

- [ ] S4–S13, S15, S16, and S18–S27 pass at the level in the execution map.
- [ ] S11 proves two panes in one workspace stay two session rows while the workspace rollup stays one.
- [ ] S8 and S10 match the product rules for Done-without-time and hidden chat.
- [ ] S1, S2, S3, S14, and S17 are checked on an iOS simulator before the phone UI is called done.
- [ ] No new REST route for this snapshot.
- [ ] `bun --filter @atmos/mobile typecheck`, `cargo test -p core-service session_agent_group`, and `cargo test -p core-service session_agent_catalog` pass.
- [ ] Coverage Status below is updated by `atmos-specs-test-run` after implementation.

## Manual verification steps

1. Connect a Computer that has one workspace with two terminals. Confirm Session shows two rows and Workspace shows one workspace.
2. Start an agent in one terminal until it asks for permission. Confirm that row’s card count moves to Need permission, then tap the card and the row.
3. Open the row and confirm the terminal tab matches.
4. Sign out and confirm Session does not show a second QR / OAuth form.

## Non-coverage

- Android tab visuals (same routes; check once a device is available, not a gate for the Rust/Bun rules).
- N1 badge and N2 pull-to-refresh.
- Kanban board as a session board.
- A second Desktop-only session list. Desktop loads the Web sidebar.
- A pane whose candidate has no tmux window name lighting up as Running.
- GitHub Enterprise and CI check rings.

## Coverage Status

> Filled after implementation by `atmos-specs-test-run`.
