# TEST · QUALITY-024: Workspace Create Overlay, Terminal Title Merge, PT Design Drawer

> Test Plan · how we verify the three slices in [TECH.md](./TECH.md) / [PR #348](https://github.com/AruNi-01/atmos/pull/348). Quality spec. No PRD. Coverage is keyed to the TECH quality table, not to product Must Haves.

## Test strategy

The PR already added Bun and Rust unit tests plus source-scan tests. This plan maps those files. Spec-only follow-up does not add product tests.

- **Bun unit**: `workspaceCreateBlocksUntilWorktree`, `isWorkspaceCreateReadyToEnter`, `mergeServerTerminalTitle`, `restoreScrollChain`.
- **Bun source-scan**: overlay Dialog wiring, auto-open `isWorkspaceCreateReadyToEnter`, Excalidraw CSS/board/motion strings.
- **Rust unit**: `reduce_title` command switch vs reattach, plus the extra `osc_title` assertion on CMD_END.
- **Lint cap**: root `package.json` `lint` stays `oxlint --max-warnings=455`.
- **Playwright / agent-browser**: not in this PR. Overlay, titles, and the Excalidraw drawer are user-visible; exploratory checks are listed but not executed by the spec-only commit.
- **Manual-only**: live Welcome create, live PTY OSC while switching commands, live PT Design library/search in dark theme.

## Coverage map

| TECH item                                                         | Scenario IDs |
| ----------------------------------------------------------------- | ------------ |
| Welcome `blocking` only when `currentView === "welcome"`          | S1           |
| Create dialog / Welcome pass `workspaceCreateBlocksUntilWorktree` | S2           |
| Overlay is a non-progress Dialog; sidebar does not set `blocking` | S3           |
| Overlay copy keys and auto-open `isWorkspaceCreateReadyToEnter`   | S4           |
| `isWorkspaceCreateReadyToEnter` waits for a worktree result       | S5           |
| Welcome `onClose` only when create does not block                 | S6           |
| Merge: command switch with no topic clears OSC                    | S7           |
| Merge: idle directory replay without topic clears OSC             | S8           |
| Merge: same-command replay without topic keeps OSC                | S9           |
| Merge: first command title keeps OSC                              | S10          |
| Merge: switch that still carries `session_title` keeps it         | S11          |
| `reduce_title` Shell switch clears; Reattach keeps                | S12          |
| Shell CMD_END still clears `session_title` and `osc_title`        | S13          |
| Drawer CSS `translate3d` / `backwards` / wrapper width / clip     | S14          |
| Dark library browse, search field, skeleton                       | S14          |
| `restoreScrollChain` and `armSidebarScrollPin` wiring             | S15, S16     |
| oxlint cap 455                                                    | S17          |
| Overlay hides on setup `error`; auto-enter-on-error               | S18 (gap)    |
| `applyServerTerminalTitle` cache-base pane selection              | S19 (gap)    |
| Live Welcome / PTY / PT Design drawer                             | S20 (manual) |

## Execution map

This table is the hand-off from plan to implementation/testing. `Status` is `pass` after the named command ran in this spec pass, and stays `planned` for gaps and manual checks.

| Scenario | Level     | Expected tool | Target command / method                                                                 | Fixture / data                                               | Signals                                                                                                    | Status  |
| -------- | --------- | ------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------- |
| S1       | Bun unit  | `bun test`    | `workspace-creation-store.test.ts` `blocks on the welcome page…`                        | view strings                                                 | `welcome` true; `workspace`/`tasks`/`automations`/`project` false                                          | pass    |
| S2       | Bun scan  | `bun test`    | `workspace-status-popover.test.ts` `welcome worktree prep uses a dialog…`               | source of overlay / dialog / Welcome / sidebar               | `workspaceCreateBlocksUntilWorktree` in dialog+Welcome; sidebar has no `blocking: true`                    | pass    |
| S3       | Bun scan  | `bun test`    | same test as S2                                                                         | `WorkspaceSetupBlockingOverlay.tsx`, `PanelLayout`           | `DialogContent`; `workspaceCreationOverlay`; not `WorkspaceSetupProgressView`; overlay still mounted       | pass    |
| S4       | Bun scan  | `bun test`    | `workspace-status-popover.test.ts` header grouping test                                 | `use-workspace-create-auto-open.ts`                          | `isWorkspaceCreateReadyToEnter`; `enterImmediately`; `WORKSPACE_AUTO_ENTER_DELAY_MS`                       | pass    |
| S5       | Bun unit  | `bun test`    | `workspace-setup.test.ts` `isWorkspaceCreateReadyToEnter`                               | null / `creating`+`create_worktree` / `error` / `setting_up` | null false; creating false; error true; setting_up true                                                    | pass    |
| S6       | Bun scan  | `bun test`    | S2 source-scan                                                                          | `WelcomePage.tsx`                                            | `if (!blocksUntilWorktree) onClose?.()`                                                                    | pass    |
| S7       | Bun unit  | `bun test`    | `persist-dynamic-title.test.ts` `clears the OSC topic when the dynamic title switches…` | grok + topic → path, `session_title: null`                   | `{ dynamicTitle: ".../atmos/dewgong" }`                                                                    | pass    |
| S8       | Bun unit  | `bun test`    | `clears a topic when an idle directory is replayed without one`                         | same path + leftover topic                                   | OSC omitted                                                                                                | pass    |
| S9       | Bun unit  | `bun test`    | `keeps a topic when the same dynamic title is replayed without one`                     | grok → grok, `session_title: null`                           | OSC kept                                                                                                   | pass    |
| S10      | Bun unit  | `bun test`    | `keeps a topic on the first dynamic title`                                              | OSC only previous, incoming `grok`                           | both kept                                                                                                  | pass    |
| S11      | Bun unit  | `bun test`    | `keeps a topic when a switch still carries one`                                         | grok → path with `session_title`                             | new dynamic + new OSC                                                                                      | pass    |
| S12      | Rust unit | `cargo test`  | `-p core-service` `shell_command_switch_clears_topic_and_reattach_keeps_it`             | `reduce_title` Shim Shell/Reattach                           | `grok --always-approve`→`grok` keeps topic; Reattach `vim` keeps; Shell `ls` clears both                   | pass    |
| S13      | Rust unit | `cargo test`  | `-p core-service` `shell_cmd_end_clears_topic_and_reattach_keeps_it`                    | Reattach CMD_END then Shell CMD_END                          | Reattach keeps topic; Shell CMD_END `session_title` and `osc_title` are `None`                             | pass    |
| S14      | Bun scan  | `bun test`    | `sidebar-motion.test.ts` `chrome CSS and board wire the press and drawer motion`        | `excalidraw-theme.css`, `ExcalidrawBoard.tsx`                | `translate3d(100%, 0, 0)`; `backwards`; `width: 100% !important`; browse/search/skeleton; `overflow: clip` | pass    |
| S15      | Bun unit  | `bun test`    | `sidebar-motion.test.ts` `puts ancestor scroll back when the drawer focus shifts it`    | fake `{ scrollLeft, scrollTop }`                             | restored to 0; second restore is a no-op                                                                   | pass    |
| S16      | Bun scan  | `bun test`    | S14 motion source-scan                                                                  | `sidebar-motion.ts`                                          | `restoreScrollChain`; `armSidebarScrollPin`; existing `commitStyles` / `freezeOffscreen`                   | pass    |
| S17      | Review    | `rg`          | root `package.json` script `lint`                                                       | this branch                                                  | `oxlint --max-warnings=455`; no cap diff                                                                   | pass    |
| S18      | Gap       | —             | none in this PR                                                                         | `status: "error"` while `blocking: true`                     | overlay hidden; auto-open not asserted                                                                     | planned |
| S19      | Gap       | —             | `matchingPaneTitles` is not exported                                                    | live pane vs stale cache                                     | cache-base preference is comment-only in tests                                                             | planned |
| S20      | Manual    | browser       | Welcome create; PTY command switch; PT Design library in dark                           | running web + API                                            | dialog copy; title label; drawer does not shove chrome                                                     | planned |

## Scenarios

### S1 — Welcome is the only blocking view

- **Level**: Unit
- **Given**: `workspaceCreateBlocksUntilWorktree` in `workspace-creation-store.ts`.
- **When**: it is called with `welcome`, `workspace`, `tasks`, `automations`, and `project`.
- **Then**: only `welcome` is `true`.
- **Signals**: `blocks on the welcome page and not when another view sits under the overlay`.

### S2 — Call sites use the helper

- **Level**: Source-scan
- **Given**: `CreateWorkspaceDialog.tsx`, `WelcomePage.tsx`, `LeftSidebar.tsx`.
- **When**: the overlay test reads those files.
- **Then**: dialog and Welcome contain `workspaceCreateBlocksUntilWorktree`. Sidebar does not contain `blocking: true`.
- **Signals**: assertions in `welcome worktree prep uses a dialog and other views dismiss the overlay`.

### S3 — Overlay is a locked Dialog, not the old progress stage

- **Level**: Source-scan
- **Given**: `WorkspaceSetupBlockingOverlay.tsx` and `PanelLayout.tsx`.
- **When**: the same test reads them.
- **Then**: overlay contains `DialogContent`, `workspaceCreationOverlay`, and `blockingJob`; it does not contain `WorkspaceSetupProgressView`; `PanelLayout` still contains `WorkspaceSetupBlockingOverlay`.
- **Signals**: those substrings. Escape / outside `preventDefault` is in the overlay source; the scan does not currently assert those handlers.

### S4 — Blocking auto-open uses ready-to-enter

- **Level**: Source-scan
- **Given**: `use-workspace-create-auto-open.ts`.
- **When**: the header workspace jobs test reads the hook.
- **Then**: the hook contains `isWorkspaceCreateReadyToEnter`, `enterImmediately`, `WORKSPACE_AUTO_ENTER_DELAY_MS`, and `paused:`.
- **Signals**: `header workspace setup grouping` in `workspace-status-popover.test.ts`.

### S5 — Ready-to-enter waits for a worktree result

- **Level**: Unit
- **Given**: `isWorkspaceCreateReadyToEnter`.
- **When**: progress is `null`/`undefined`; `status: "creating"` + `stepKey: "create_worktree"`; `status: "error"`; `status: "setting_up"` + `run_setup_script`.
- **Then**: missing and in-progress worktree are `false`; error and setting_up are `true`.
- **Signals**: `waits for a worktree result, including a missing progress snapshot`.

### S6 — Welcome dismisses only non-blocking creates

- **Level**: Source-scan
- **Given**: `WelcomePage.tsx` after `bindWorkspace`.
- **When**: S2 reads Welcome.
- **Then**: the file contains `if (!blocksUntilWorktree) onClose?.()`.
- **Signals**: same test as S2.

### S7 — Client merge clears OSC on a command → path switch

- **Level**: Unit
- **Given**: previous `{ dynamicTitle: "grok", oscTitle: "Introduce and overview the project" }`.
- **When**: `mergeServerTerminalTitle` gets `{ dynamic_title: ".../atmos/dewgong", session_title: null }`.
- **Then**: result is `{ dynamicTitle: ".../atmos/dewgong" }` (no `oscTitle`).
- **Signals**: `clears the OSC topic when the dynamic title switches and no new topic arrives`.

### S8 — Idle directory replay clears a leftover topic

- **Level**: Unit
- **Given**: previous dynamic title is already the path, with a leftover OSC topic.
- **When**: the same path is replayed with `session_title: null`.
- **Then**: OSC is omitted (`idleDirectory` via `isPathLikeTitle`).
- **Signals**: `clears a topic when an idle directory is replayed without one`.

### S9 — Same-command replay keeps the topic

- **Level**: Unit
- **Given**: previous `grok` + topic.
- **When**: `{ dynamic_title: "grok", session_title: null }`.
- **Then**: both fields remain. This is the Agent Observer `"Terminal"` guard.
- **Signals**: `keeps a topic when the same dynamic title is replayed without one`.

### S10 — First command title keeps a topic

- **Level**: Unit
- **Given**: previous has `oscTitle` only.
- **When**: first `dynamic_title` is `grok` with `session_title: null`.
- **Then**: both are kept (`dynamicSwitched` is false and the title is not path-like).
- **Signals**: `keeps a topic on the first dynamic title`.

### S11 — A switch that still carries a topic keeps it

- **Level**: Unit
- **Given**: previous `grok` + topic.
- **When**: `{ dynamic_title: ".../atmos/dewgong", session_title: "debugging auth" }`.
- **Then**: `{ dynamicTitle: ".../atmos/dewgong", oscTitle: "debugging auth" }`.
- **Signals**: `keeps a topic when a switch still carries one`.

### S12 — Server command switch vs reattach

- **Level**: Rust unit
- **Given**: `reduce_title` in `title_hub.rs`.
- **When**: Shell start `grok --always-approve`, WindowTitle topic, Shell start `grok`, Reattach start `vim`, Shell start `ls`.
- **Then**: `grok --always-approve` and `grok` share extracted name `"grok"`, so the topic stays; Reattach `vim` keeps the topic and sets `dynamic_title`; Shell `ls` sets `session_title` and `osc_title` to `None` and `dynamic_title` to `ls`.
- **Signals**: `shell_command_switch_clears_topic_and_reattach_keeps_it`.

### S13 — Shell CMD_END still clears topic

- **Level**: Rust unit
- **Given**: a window title, then Reattach CMD_END with a path, then Shell CMD_END with the same path.
- **When**: `shell_cmd_end_clears_topic_and_reattach_keeps_it` runs.
- **Then**: Reattach keeps `session_title`; Shell CMD_END clears `session_title` and `osc_title`; `dynamic_title` is `.../proj/app`.
- **Signals**: that test, including the new `osc_title` assertion.

### S14 — Excalidraw drawer CSS and board overflow

- **Level**: Source-scan
- **Given**: `excalidraw-theme.css` and `ExcalidrawBoard.tsx`.
- **When**: `chrome CSS and board wire the press and drawer motion` reads them.
- **Then**: CSS contains `pt-design-drawer-in`, `translate3d(100%, 0, 0)`, `animation: pt-design-drawer-in 280ms cubic-bezier(0.32, 0.72, 0, 1) backwards`, `width: 100% !important`, `a.library-menu-browse-button`, `.layer-ui__search-header`, `.library-unit--skeleton`, `overflow: clip`; board contains `overflow: "clip"`.
- **Signals**: those substrings.

### S15 — Scroll pin restore

- **Level**: Unit
- **Given**: a box `{ scrollLeft: 40, scrollTop: 12 }` and a mark at `0, 0`.
- **When**: `restoreScrollChain` runs twice.
- **Then**: first call writes zeros; second call leaves zeros.
- **Signals**: `puts ancestor scroll back when the drawer focus shifts it`.

### S16 — Motion module wires the pin

- **Level**: Source-scan
- **Given**: `sidebar-motion.ts`.
- **When**: S14 reads it.
- **Then**: file contains `restoreScrollChain`, `armSidebarScrollPin`, `commitStyles`, `freezeOffscreen`, `opacity: 0`.
- **Signals**: same chrome test.

### S17 — oxlint cap

- **Level**: Review
- **Given**: QUALITY-010 left the cap at 455.
- **When**: root `package.json` `lint` is read.
- **Then**: it is `oxlint --max-warnings=455`. This spec does not edit that script.
- **Signals**: script text. No diff on that line.

### S18 — Gap: setup error vs auto-enter

- **Level**: Gap
- **Given**: overlay `failed = progress?.status === "error"` hides the dialog, while `isWorkspaceCreateReadyToEnter` is `true` on error.
- **When**: a blocking Welcome create fails after bind.
- **Then**: no automated test in this PR asserts whether auto-open still navigates.
- **Signals**: none. Recorded as a gap, not a pass.

### S19 — Gap: live-pane cache base

- **Level**: Gap
- **Given**: `applyServerTerminalTitle` prefers a live pane whose merge drops OSC over a cache that already shows the new path.
- **When**: unit tests for `mergeServerTerminalTitle` run.
- **Then**: they do not construct `workspacePanes` or call `applyServerTerminalTitle`. `matchingPaneTitles` is not exported.
- **Signals**: none.

### S20 — Live UI (manual)

- **Level**: Manual
- **Given**: web + API.
- **When**: create from Welcome; create from an open workspace; switch a terminal from an agent command to a directory; open PT Design library/search in dark theme.
- **Then**: Welcome shows the locked creating/opening dialog; the other view dismisses and uses the header; the tab does not keep the old OSC beside the path; the drawer does not shift toolbar/zoom.
- **Signals**: human observation. Not run in the spec-only pass.

## Performance & load budgets

Not a new hot path. Drawer enter stays 280 ms (`SIDEBAR_ENTER_MS`). Scroll pin lasts `SIDEBAR_ENTER_MS + 160`. Title hub debounce is unchanged. No new WS chatter.

## Regression checklist

- [x] `package.json` lint cap is still 455.
- [x] Same-command `session_title: null` replay still keeps OSC (Observer `"Terminal"`).
- [x] Reattach CMD_START does not clear topic in `reduce_title`.
- [x] Welcome is the only `workspaceCreateBlocksUntilWorktree` true view in the unit table.
- [x] Overlay still has `data-workspace-setup-blocking-overlay`.
- [x] `titlesFromServerSnapshot` still exists for non-merge callers.
- [x] Excalidraw exit clone (`data-pt-leaving`) CSS is still present.

## Exploratory agent-browser checks

Use after a UI verification pass. Load Agent Browser instructions first (`agent-browser` skill, or `agent-browser skills get core --full`; otherwise `specs/references/agent-browser-setup.md`). Do not treat a clean exploration as a substitute for S1–S16.

1. Welcome: start New Workspace, confirm the locked dialog, wait until copy switches to opening, then land in the workspace.
2. From an open workspace: New Workspace, confirm the dialog closes and the previous page stays up.
3. Terminal: run a titled agent, then `cd` / idle; tab label must not keep the agent topic beside the path. Reattach/refresh must not show `"Terminal"` while the command is unchanged.
4. PT Design, dark theme, desktop and a narrow width: open library and search; browse link and search field have contrast; toolbar/zoom do not jump.
5. Watch console/network for overlay or title WS failures.

## Acceptance criteria

- [x] S1–S16 have a named automated command in the execution map.
- [x] S17: lint script is still `oxlint --max-warnings=455`.
- [x] S18–S20 remain documented gaps / manual; they do not block the spec-only commit.
- [x] This spec does not edit `apps/`, `crates/`, or `packages/` product files.
- [x] Coverage Status names commands that ran and commands that did not.

## Manual verification steps

1. Welcome create through worktree ready (S20).
2. Create from workspace/tasks/automations (S20).
3. PTY: agent OSC topic, then a new shell command, then reattach (S20).
4. PT Design dark library + search (S20).

## Non-coverage

- Playwright journey for create or titles. No new `e2e/tests/specs/` file in #348.
- `applyServerTerminalTitle` integration (S19).
- Auto-enter after `status: "error"` (S18).
- Overlay Escape / outside-click handlers (present in source, not scanned).
- `isPathLikeTitle` itself (owned by `@atmos/shared/terminal`, unchanged).
- i18n JSON (not in the #348 diff).
- Mobile create overlay or mobile terminal titles.
- `cargo test --workspace` / `just test` as a requirement of the spec-only commit.

## Coverage Status

2026-10-21, spec-only pass on `aarynlu/local-wip-workspace-terminal-title` after QUALITY-024 docs landed. Commands and remaining gaps:

- S1 — pass. `bun test apps/web/src/features/workspace/store/workspace-creation-store.test.ts` (10 pass), including `blocks on the welcome page and not when another view sits under the overlay`.
- S2, S3, S4, S6 — pass. `bun test apps/web/src/app-shell/__tests__/workspace-status-popover.test.ts` (6 pass), including `welcome worktree prep uses a dialog and other views dismiss the overlay` and the header grouping scan of `isWorkspaceCreateReadyToEnter`.
- S5 — pass. `bun test apps/web/src/features/workspace/lib/workspace-setup.test.ts` (6 pass), including `waits for a worktree result, including a missing progress snapshot`.
- S7–S11 — pass. `bun test apps/web/src/features/terminal/store/__tests__/persist-dynamic-title.test.ts` (15 pass), including the five `mergeServerTerminalTitle` cases.
- S12, S13 — pass. `cargo test -p core-service --lib clears_topic_and_reattach_keeps_it` (2 passed, 852 filtered): `shell_command_switch_clears_topic_and_reattach_keeps_it`, `shell_cmd_end_clears_topic_and_reattach_keeps_it`.
- S14–S16 — pass. `bun test packages/pt-design/src/embed/sidebar-motion.test.ts` (3 pass).
- S17 — pass by inspection. Root `package.json` `lint` is `oxlint --max-warnings=455`. This spec did not edit that script.
- S18, S19 — still gaps (no new product tests in this spec-only pass). Status remains `planned`.
- S20 / agent-browser / Playwright — not_run. No UI harness in this pass.

Logs: `/opt/cursor/artifacts/quality-024-bun-tests.log`, `/opt/cursor/artifacts/quality-024-rust-tests.log`.
