# PRD · APP-078: Mobile Session Inbox

> Product Requirements · WHAT and WHY. Phone home and the Web/Desktop left sidebar can list Agent sessions, not only workspaces.

## Context

- **Problem**: Home and the left sidebar list workspaces. Agent status on web buckets a whole workspace, so a builder cannot see which terminal or chat inside that workspace needs permission, is still running, or just finished.
- **Why now**: Mobile is far enough along (APP-077) to add a Session tab. The same per-session snapshot serves the Web left sidebar, which Desktop already hosts.
- **Related specs**: Builds on [APP-058](../APP-058_agent-status-workspace-grouping/PRD.md) (same four buckets and priority, finer grain). Does not change the [APP-077](../APP-077_mobile-terminal-main-path/PRD.md) terminal screen except to open a chosen pane. [APP-075](../APP-075_agent-sessions/PRD.md) is a different product (web CLI transcript browser).

## Goals

1. After a Computer is connected, phone home has two tabs: Workspace (today’s list) and Session (an inbox of terminal panes).
2. Web and Desktop left sidebar can switch from the workspace list to a session list. The default stays the workspace list.
3. Each session is classified on its own, with the same Agent buckets web already uses for workspaces.

## Users & Scenarios

- **Primary persona**: A builder using the phone against a remote Atmos Computer that already has several workspaces and several terminals.
- **Scenario 1**: They open Session, see four inbox cards, and tap Need permission to handle the panes that are blocked.
- **Scenario 2**: Under the cards they see the five panes whose Agent status changed most recently, and open one straight into that terminal.
- **Scenario 3**: A workspace with two terminals and one Agent Chat shows two Session rows on the phone. The chat is not listed until the phone has a chat screen.
- **Scenario 4**: On Web or Desktop they open the left-sidebar filter, switch View to Session, and see every terminal and chat as its own row, still grouped by the current Group By.

## User Stories

- As a builder, I want each terminal listed by its own Agent status, so that one busy workspace does not hide a pane that is waiting on me.
- As a builder, I want the latest Agent activity at the top of Session, so that I can jump back without scanning every workspace.
- As a builder, I want the row to name the project, workspace, branch, and PR, so that I know which worktree I am about to open.
- As a builder on Web or Desktop, I want a Session view in the same sidebar filter, so that I can scan panes without leaving the workspace list’s grouping habits.

## Functional Requirements

### Must Have

- **M1**: Home shows two bottom tabs, Workspace and Session, whether or not a Computer is connected. The tabs are not added or removed at runtime. The bar is the adaptive glass tab bar, not the system tab bar.
- **M2**: The Workspace tab is today’s workspace list: grouping, filters, open a workspace, and settings. Its title is the native large title “Workspace”, not a hand-drawn header.
- **M3**: When the phone is signed out or the Computer socket is down, Workspace keeps the current connect / sign-in screen. Session does not start a second sign-in; it shows an empty state that the Computer is not connected.
- **M4**: The Session inbox shows four cards, in order: Need permission, Need attention, Running, Done. Each card shows how many terminal panes are in that bucket.
- **M5**: Tapping a card pushes a list of only that bucket. The list uses the same row as the rest of Session.
- **M6**: Under the cards, Session shows at most five panes that have an Agent status time, newest first. While the Computer process is up, that time is the latest in-memory status time. A pane that has never reported Agent status is left out of this strip and still appears in Done. Across idle cleanup and a restart, the time that remains is when the inbox bucket last changed, so the pane can stay in the top five.
- **M7**: One row is one terminal pane, including a side-chat terminal window. Two panes in one workspace are two rows. Agent Chat threads are not shown.
- **M8**: Bucket rules match workspace Agent grouping, applied to one pane: permission (live or sticky) beats running, running beats task-complete attention, everything else is Done. A pane the status kernel has never seen is Done.
- **M9**: Row line one is status icon, pane title, and a short relative time when a status time exists. Line two is project name, workspace name, branch name, and PR state, separated by a middle dot. A project-scoped pane omits the workspace name. Missing pieces are omitted, not replaced with placeholders.
- **M10**: PR state is the live pull request whose head branch is the workspace branch (Open, Draft, Merged, or Closed). No matching PR, or a failed lookup, omits the PR segment. The row still renders.
- **M11**: Tapping a row opens that workspace’s terminal with that pane selected.
- **M12**: The Computer exposes each Agent session’s bucket, including Agent Chat, without changing the web workspace rollup.
- **M13**: While Session is open and the socket is up, card counts and lists move when a pane’s Agent status changes.
- **M14**: A Done pane that has reported Agent status stays in the inbox until the user archives that session, or until its workspace is archived. Idle cleanup and a Computer restart do not remove it. Archiving hides it from every bucket and from the top five. A shell that never ran an agent is Done only while that terminal still exists.
- **M15**: The left-sidebar filter menu (`WorkspaceKanbanFilterMenu` on the sidebar, not the kanban board) has a View section above Group By. Choices are Workspace and Session. Workspace is the default and keeps today’s workspace rows.
- **M16**: Session view lists every Agent session the catalog and live map know: terminal panes and Agent Chat. The row matches the phone row: status icon, title, relative time, then project · workspace · branch · PR state. Chat rows are included here. The phone still hides them (M7).
- **M17**: Group By and the existing Filter section still apply in Session view. Group By buckets sessions with the same modes as workspaces (project, group, workflow status, agent status, time, label, priority). Agent-status grouping uses each session’s own bucket. The other modes use the session’s workspace. Filter narrows by that same workspace metadata.
- **M18**: Choosing a terminal row opens that workspace with the pane focused. Choosing a chat row opens that Agent Chat. The chosen view is remembered for the sidebar and does not change the kanban board.

### Nice to Have

- **N1**: The Session tab shows a badge with the Need permission count plus the Need attention count.
- **N2**: Pull to refresh on Session re-reads panes and PR state.

## Out of Scope

- **Kanban board session view** — the board stays workspace cards. View is a left-sidebar control only.
- **Web workspace rollup** — By Agent Status on the workspace view still collapses a workspace to one bucket.
- **Mobile Agent Chat** — chat stays in the status model and off the phone.
- **Persisting live occupancy** — running, permission, and attention stay in process memory and may be empty after a restart until the next hook. The durable record is the inbox catalog (last time + archive flag), not a replay of the live map.
- **CI checks on the row** — PR state text only.
- **One CLI conversation inside a pane as its own row** — the pane is the session.
- **A second sign-in flow on Session.**

## Success Metrics

- Qualitative: with two terminals in one workspace, Session shows two rows and the workspace list still shows one workspace.
- Qualitative: a permission prompt moves that pane onto the Need permission card without restarting the app.
- Qualitative: a pane that has never run an agent is listed under Done and is absent from the top five.

## Risks & Open Questions

- **Risk**: After a Computer restart, a pane that was still running shows as Done until the next hook. The catalog must not claim it is still running.
- **Risk**: Live PR lookup can be slow or fail. The row must stay useful with the PR segment missing.
- **Open for TECH**: How the phone asks for the per-session snapshot, and how it focuses a pane that the terminal strip has not loaded yet.

## Milestones

- Phase 1 — M12 and M14: per-session snapshot plus the durable catalog (M7, M8).
- Phase 2 — M1–M6, M9, M11, M13 phone tabs and lists.
- Phase 3 — M10 live PR segment. N1–N2 after the inbox is usable.
- Phase 4 — M15–M18 sidebar Session view on Web, which Desktop already loads.
