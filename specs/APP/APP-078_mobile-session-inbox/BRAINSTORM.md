# Brainstorm · APP-078: Mobile Session Inbox

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Mobile home is one root Stack screen: the workspace list (`apps/mobile/app/index.tsx` → `WorkspaceListScreen`). After a Computer is connected, that list is the primary surface (APP-077 / `apps/mobile/AGENTS.md`). There is no Session tab and no per-session inbox.

Web already buckets **workspaces** by Agent activity (APP-058): Need permission, Need attention, Running, Done. The rollup key is `context_id` (workspace guid, or project guid when developing on main). Several terminals and chats in one workspace collapse into one bucket. `GET /agent-status/workspace-agent-groups` omits Done. The web footer can show per-pane rows, but that is not a list product and mobile does not use it.

The phone needs the opposite grain: one row per session, because one workspace can hold several terminals and (later) several chats. Mobile does not ship chat yet, so chat rows stay hidden, but the model has to keep a surface so chat can appear later without a second status system.

## What exists today

| Fact | Where |
|------|--------|
| Four buckets, priority permission > running > task-complete attention > done | `workspace_agent_group.rs`, same rule in `workspace-agent-status.ts` |
| Web group order is permission, attention, running, done | `WORKSPACE_AGENT_GROUP_ORDER` |
| English labels: Need permission, Need attention, Running, Done | `apps/web/messages/en.json` `agent_*` |
| Terminal identity in the status map is the pane `{context_id}:{tmux_window}`, not the CLI session id | hook `resolve_session_id` prefers `ATMOS_PANE_ID` |
| Chat identity is `chat:{id}` on surface `chat` | `chat_status_session_id` |
| Idle rows are swept (manual clear, and a ~30 min job). Attention latches survive the sweep. After ack, a finished session has **no** in-memory row | `clear_idle_sessions`, APP-058 (memory only, not SQLite) |
| Status records have no human title | `AgentStatusRecord` |
| Terminal list can return every workspace when `workspace_id` is omitted. Title is `terminal_name`. Time is `uptime_secs` since create, not last update | `terminal_session_list` |
| Branch and a stored `github_pr` snapshot are on the workspace bootstrap row. Live “PR for this branch” is a separate GitHub list matched on `head_ref` | `WorkspaceModel`, `useWorkspacePrStatus` |
| Mobile reaches the Computer over WS, and can HTTP the same gateway the web hooks client uses | `MobileWsClient`, `gateway_url` |
| Expo SDK 56 native tabs import is `expo-router/unstable-native-tabs`. No NativeTabs in the app yet. Sheets and workspace push stay on the root Stack | `apps/mobile/package.json`, `app/_layout.tsx` |

Home currently draws a fake “Workspace” title plus text Filter / Settings gear. Native-nav rules want a real large title and icon-only header items. A tabs change should not copy that custom header.

APP-075 Agent Sessions is a different product (web CLI transcript browser). This spec is the phone inbox of **live surfaces** classified by Agent status.

## Goals (draft)

- Primary: after connect, home is two native tabs — Workspace (today’s list) and Session (inbox).
- Primary: Session classifies **each session**, not each workspace, into the four Agent buckets.
- Secondary: keep chat in the status model and off the phone until a chat screen exists.
- Non-goal for this brainstorm: redesign web sidebar grouping, persist Agent status to SQLite, or open chat on mobile.

The requested Session screen, if we take the message literally:

1. Inbox: four cards (Need attention, Need permission, Running, Done). Tap a card to open that bucket’s list.
2. Under the cards: the five most recently updated sessions.
3. Row: status icon + title + time; second line project · workspace · branch · PR state when that branch has a PR.

## Options

### Option A — Every terminal pane, status painted on

Inventory is `terminal_session_list` (all workspaces). Each pane gets a bucket from live occupancy + attention for that pane id. No agent yet, or idle and acknowledged → Done. Chat sessions are computed the same way and filtered out on mobile (`surface = chat`).

**Pros**: Done stays populated after idle sweep, because the terminal still exists. Matches “a workspace has many sessions.” Top 5 and the Done card have something to show. Titles come from `terminal_name`.
**Cons**: A plain shell with no agent is Done, so Done can be noisy. “Updated” is not on the terminal row (`uptime_secs` only). Branch / PR still need a workspace join, and a real branch PR may need a GitHub lookup.
**Unknown**: whether side-chat terminal windows count as terminals (show) or as chat (hide).

### Option B — Only sessions the status kernel still knows

Inventory is `GET /sessions` plus attention latches, one row per pane / `chat:{id}`, bucketed with the same priority function the workspace rollup uses. Mobile drops `surface = chat`.

**Pros**: Smallest server change: a per-session snapshot beside `list_workspace_agent_groups`, no new persistence. Same rules as web, finer grain. Footer already thinks this way.
**Cons**: Done is empty once idle rows are swept and the user has acknowledged. Need attention survives only via the latch. No title, no branch, no PR on the record — the phone still joins terminal list + bootstrap. Top 5 of “recently updated” has no timestamp after sweep.

### Option C — Status kernel keeps a last-known session catalog

Same buckets as B, but the server remembers the last group, title, context, and timestamp for each pane/chat after idle sweep and after ack, until the terminal or chat is destroyed.

**Pros**: Done and top 5 survive refresh and sweep. One payload can grow a title later. Chat stays a surface flag.
**Cons**: New in-memory (or persisted) catalog. APP-058 explicitly refused to persist Agent status. Must define eviction when a tmux window dies. Larger than the phone UI.

## Key forks in the road

- **Fork 1 — What is a row?** Every terminal pane (A) vs only live status/attention rows (B) vs a retained catalog (C). Decide in PRD. The user message describes terminals and chats inside a workspace, which leans A, but Done-after-ack only works cleanly in A or C.
- **Fork 2 — “Updated time”.** Last occupancy/attention timestamp vs terminal uptime vs a new last-activity clock. Decide in PRD. Top 5 is undefined until this is picked. Status records have a timestamp; terminals do not.
- **Fork 3 — PR on the second line.** Workspace-linked `github_pr` snapshot vs live PR whose `head_ref` equals the workspace branch (web `useWorkspacePrStatus`). Decide in PRD. Snapshot is already on bootstrap; live lookup is extra GitHub calls per workspace.
- **Fork 4 — Card order.** User listed Need attention, Need permission, Running, Done. Web grouping is permission first (“action-first”). Decide in PRD. Priority of a single row can stay permission > running > attention > done even if the cards are drawn in another order.
- **Fork 5 — Tap a row.** Open that workspace’s terminal focused on the pane, vs a session detail that does not exist on mobile yet. Decide in PRD. Chat tap is out of scope until chat ships; the reserved behavior should be named.
- **Fork 6 — Transport.** Extend the existing Computer REST `/agent-status/*` (web already hydrates that way; mobile can use `gateway_url`) vs a new `WsAction` because mobile’s main path is WS. Decide in TECH. Do not invent a second status model.
- **Fork 7 — Tabs vs unconnected home.** Both tabs always mounted (Session empty / connect hint) vs hide Session until WS is open. Hiding a native tab remounts the navigator. Decide in TECH. Sheets (settings, filters) and `/workspace/[id]` stay on the root Stack; each tab gets its own stack for the large title. SDK 56 uses `expo-router/unstable-native-tabs`.

## Decisions (locked)

- **Fork 1**: Option A. Every terminal pane is a row. A shell that never ran an agent, or an idle pane whose latch was acknowledged, is Done. Agent Chat uses the same status model and stays hidden on mobile.
- **Fork 2**: Last Agent occupancy or attention timestamp. Panes that never reported status are omitted from Top 5. That timestamp is stored on the inbox catalog, so idle cleanup and a restart do not drop a finished pane out of Top 5.
- **Storage**: Live occupancy stays in memory (lost on restart; idle rows older than ~30 minutes are deleted). Done history is a separate SQLite catalog, one row per pane, hidden only when the user archives the session or the workspace is archived.
- **Fork 3**: Live PR whose head branch equals the workspace branch. A failed lookup omits the PR segment.
- **Fork 4**: Card order matches web: Need permission, Need attention, Running, Done. Row priority stays permission > running > attention > done.
- **Fork 5**: Tap opens that workspace terminal focused on the pane.
- **Fork 6 / 7**: Resolved in TECH.md. Bottom tabs use `@rbayuokt/expo-adaptive-glass` on Expo Router `Tabs`, not system native tabs.
- **Side-chat tmux windows** are terminal panes and are shown. Agent Chat threads are not.
- **Cards show a count.**
- **Project-scoped panes** (no workspace) omit the workspace segment.
- **Web / Desktop**: left sidebar filter gains View (Workspace default, Session). Session lists terminal and chat rows with the phone row layout. Group By and Filter still apply. Kanban stays workspace cards. Desktop uses the Web sidebar, so it is not a second UI.

## References

- Mobile home: `apps/mobile/app/_layout.tsx`, `apps/mobile/src/features/workspaces/WorkspaceListScreen.tsx`
- Native tabs (SDK 56): `expo-router/unstable-native-tabs` — https://docs.expo.dev/router/advanced/native-tabs/
- Status kernel: `crates/core-service/src/service/agent_status/`
- REST: `apps/api/src/api/agent_status.rs`
- Web buckets: `apps/web/src/features/agent/lib/workspace-agent-status.ts`
- Terminal list: `packages/api-types/src/ws/dto/terminal.ts`
- Related: [APP-058](../APP-058_agent-status-workspace-grouping/BRAINSTORM.md), [APP-077](../APP-077_mobile-terminal-main-path/BRAINSTORM.md), [APP-075](../APP-075_agent-sessions/BRAINSTORM.md) (different product)

## Ready to promote

- Promoted to PRD: two-tab home, per-pane buckets, top 5 by status time, live head-branch PR, tap focuses the pane. See PRD.md.
- Promoted to TECH: `agent_session_status_list`, client join onto terminal candidates, native tabs under the root Stack. See TECH.md.
