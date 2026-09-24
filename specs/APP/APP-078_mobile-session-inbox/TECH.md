# TECH · APP-078: Mobile Session Inbox

> Technical Design · HOW. Implements PRD APP-078. Addresses M1–M18. N1 and N2 are specified but not required for the first ship.

## Scope summary

Phone home uses Expo Router JavaScript tabs with an adaptive glass tab bar. The Web left sidebar, which Desktop already loads, gains a Session view beside the workspace list. Both use the same per-session snapshot. Live occupancy stays in memory. A SQLite catalog remembers the last bucket-change time and an archive flag. The phone hides Agent Chat. Web and Desktop show it. Workspace-view By Agent Status stays a workspace rollup. The kanban board does not gain a session view.

## Architecture overview

```text
apps/mobile
  Tabs + GlassNavigationTabBar (Workspace | Session)
  join panes + status + bootstrap + github_pr_list
        │  WsAction agent_session_status_list
        │  existing terminal_workspace_candidates, project_workspace_bootstrap, github_pr_list
        ▼
apps/api  WS router
        ▼
crates/core-service
  live map (memory) + inbox catalog (SQLite)
  resolve_workspace_agent_group_key   (unchanged priority)
        ▼
crates/infra
  agent_session_catalog
```

No `crates/core-engine` change. GitHub lookup reuses `github_pr_list`.

## Storage

Two stores. They are not the same lifetime.

**Live map (keep).** `AgentStatusService` sessions and attention latches are process memory (`RwLock<HashMap<...>>` in `crates/core-service/src/service/agent_status/mod.rs`). A Computer restart drops them. A job every 5 minutes (`apps/api/src/main.rs`, `agent-hooks.idle_session_cleanup`) deletes idle rows older than 30 minutes (`idle_session_timeout_mins`) and forces non-chat running/permission rows older than 30 minutes to idle (`active_session_stale_mins`). The web client can also clear every idle row at once. Attention latches survive that sweep until acknowledged. This map is the source of truth for what is happening now. It is not the inbox history. Do not turn off the 30-minute cleanup to make Done stick.

**Inbox catalog (add).** One SQLite row per pane or chat, updated in place. Not one row per hook event, and not a copy of every shell that never ran an agent.

| Column | Role |
|--------|------|
| `session_id` | Primary key. Pane id `{context}:{tmux_window}`, or `chat:{id}` |
| `context_id` | Workspace or project guid |
| `surface` | `terminal` or `chat` |
| `tool` | Last tool, nullable |
| `project_path` | Nullable |
| `updated_at` | RFC3339 of the last inbox-bucket change |
| `archived_at` | Null until the user archives the session |

Write that row only when the inbox bucket changes (`permission`, `attention`, `running`, `done`), including the first time a pane is seen and Done → Running. The hook path does not wait on SQLite: enqueue the upsert and return. A repeat of the same bucket (Running staying Running across tool calls and text) does not write. Memory already has the newer timestamp, and the inbox uses that while the process is up.

Writes for one `session_id` stay ordered. A slower Done write must not land after a later Running write and move `updated_at` backwards.

The row is the pane, not a Done-only record. Idle cleanup deletes the live row and leaves the catalog row. Archive is a separate write on `agent_session_archive`, not a hook transition.

Restart does not copy the catalog into the live map. The live map starts empty and fills only from new hooks. The inbox reads the catalog from SQLite at list time. Until a hook arrives, those rows display as Done with the stored `updated_at`. A later hook writes the live map and updates the same catalog row; the inbox then shows the new bucket.

**Read.** For each catalog row and each current terminal candidate:

- Live occupancy or latch present → that bucket, time = the memory timestamp or latch `raised_at`. SQLite is not updated unless this read is a new bucket.
- No live row, catalog row, `archived_at` null → Done, time = catalog `updated_at`. Do not show the pre-restart bucket. A pane that was running when the process died is Done until the next hook.
- Candidate, no catalog row → Done, no time. It is the never-run shell. It disappears when the terminal is gone. It is not written to SQLite.
- `archived_at` set, or the workspace `is_archived` → omit.

**Archive.** `agent_session_archive` sets `archived_at`. It does not delete the row, so a later unarchive is possible without a new migration. No time-to-live on the catalog. Growth is one row per pane that has reported status, not per turn.

Workspace archive already lives on `workspaces.is_archived`. The inbox filters those context ids. It does not need a second copy of that flag.

## Decisions

- **Fork 6 — transport**: New read is a `WsAction`, not a new REST route. `/agent-status/workspace-agent-groups` stays the web hydrate. Mobile’s inbox path is already the Computer socket. A second HTTP client for one read is not worth a parallel contract.
- **Fork 7 — tabs**: Root `Stack` in `apps/mobile/app/_layout.tsx` keeps form sheets and `workspace/[workspaceId]`. The home child is Expo Router `Tabs` from `expo-router`, with `tabBar` set to `GlassNavigationTabBar` and `screenLayout` set to `GlassScreenBackdrop` from `@rbayuokt/expo-adaptive-glass/navigation`. `GlassProvider` wraps the tree once in the root layout. Each tab still has its own native `Stack` so large titles and the bucket push stay inside the tab. `Tabs` sets `headerShown: false`. Both screens are static. Do not use `expo-router/unstable-native-tabs`, and do not build a separate bar with `GlassTabBar`. Tab icons go through `src/ui/icons/lucide-native.ts`. The bar floats, so tab scroll content keeps a bottom inset. `quality` stays `'auto'`.
- **Inventory**: Rows come from `terminal_workspace_candidates` for every non-archived workspace in the bootstrap, not from `terminal_session_list` alone. Candidates are what the workspace terminal strip can open (APP-077). `terminal_session_list` misses tmux windows that have not been attached.
- **Status overlay**: Match `ATMOS_PANE_ID`, which is `{workspace_id}:{tmux_window_name}`, to the candidate’s `workspace_id` + `tmux_window_name`. No window name → Done, no time.
- **Chat**: `list_agent_session_statuses` returns `surface = chat` rows (`chat:{id}`). The phone drops them. Side-chat candidates stay; they are terminal panes (`terminal_kind` / their own tmux window).
- **Time**: Top 5 sorts the merged `updated_at` descending and skips null. Never-run candidates stay null. Catalog `updated_at` is what remains after idle cleanup and restart. The phone does not invent a clock from `uptime_secs`.
- **PR**: Phone calls existing `github_pr_list` once per distinct `(owner, repo, branch)` when Session is focused. Displayed state comes only from that list (highest `number` whose head ref equals the branch, same rule as web `pickBranchHeadPr`). Do not fall back to the stored `workspace.github_pr` snapshot. Owner/repo come from that snapshot when present, otherwise from `git_get_status` on `workspace.local_path`.
- **Focus**: Push `/workspace/{id}?terminal={candidateId}`. `WorkspaceScreen` selects that flattened entry when candidates load. Unknown id keeps today’s default selection.

## Module-by-module design

### crates/infra

- New table `agent_session_catalog` as in Storage. Repo methods: upsert by `session_id`, list non-archived, set `archived_at`.
- No change to the workspace archive column.

### crates/core-service

`crates/core-service/src/service/agent_status/workspace_agent_group.rs` (or a sibling `session_agent_group.rs` if the file is already crowded):

- Reuse `resolve_workspace_agent_group_key`. Do not copy the priority table.
- New `AgentStatusService::list_agent_session_statuses() -> Vec<AgentSessionStatusSnapshot>` merges the live map with the catalog using the read rules above.
- After `update_state` / attention raise, if the inbox bucket for that pane changed, enqueue an async catalog upsert. Same-bucket progress does not enqueue. `clear_idle_sessions` and `clear_idle_older_than` must not delete catalog rows.
- Include catalog rows that no longer have a live map entry (they are Done).
- Do not roll up by `context_id`. A live attention latch still wins over a catalog Done.
- `list_workspace_agent_groups` stays workspace-scoped and still omits Done.

### apps/api

- `WsAction::AgentSessionStatusList` in `apps/api/src/api/ws/message.rs` (empty body).
- `WsAction::AgentSessionArchive` with `{ session_id }`. Sets `archived_at`. Unknown id is a no-op success so a double archive is safe.
- Handler on the WS router calls `list_agent_session_statuses` and returns the vec.
- Follow `packages/api-types/AGENTS.md`: extract actions, DTO, `WsContract` row. No `<T>` at call sites.
- No new REST route.

### apps/mobile

File layout:

```text
app/_layout.tsx                      # root Stack; index screen becomes the tabs host
app/(home)/_layout.tsx               # Tabs + GlassNavigationTabBar
app/(home)/workspace/_layout.tsx     # Stack
app/(home)/workspace/index.tsx       # WorkspaceListScreen
app/(home)/session/_layout.tsx       # Stack
app/(home)/session/index.tsx         # inbox
app/(home)/session/[bucket].tsx      # M5 list
app/workspace/[workspaceId].tsx      # unchanged presentation; reads terminal param
```

`WorkspaceListScreen` drops the custom `header` render. Title via `nativeLargeTitleOptions("Workspace")`. Filter and Settings become icon-only `unstable_headerRightItems` (SF Symbol on iOS). First body child stays `AppScreen`.

Session screens use `nativeLargeTitleOptions` (“Session”, and the bucket label on the pushed list). Inbox body is `AppScreen`: four plain cards (`cardElevated`, not glass), then a “Recent” section of at most five `SessionRow`s. Bucket route reuses `SessionRow`.

Pure helpers, unit-tested, no React:

- `apps/mobile/src/features/sessions/session-inbox.ts` — join candidates to snapshots, hide `surface === "chat"`, assign Done when unmatched, top 5, bucket counts.
- `apps/mobile/src/features/sessions/session-row-subtitle.ts` — project · workspace · branch · PR, omitting empty segments.
- `apps/mobile/src/features/sessions/pick-branch-pr.ts` — head-ref match, highest number. Do not import the web hook.

Icons through `src/ui/icons/lucide-native.ts`: permission `ShieldAlert`, attention `Bell`, running `LoaderCircle`, done `CircleCheck`. Add only the missing exports.

Live updates: `MobileWsClient` notification handlers for `agent_status_changed`, `agent_status_cleared`, and the existing attention events, writing a small zustand map keyed by pane id. Refetch `agent_session_status_list` when Session gains focus so a swept latch still appears after resume.

PR queries: `@tanstack/react-query`, keyed by owner, repo, branch, enabled only while Session is focused. Failure sets that branch’s PR to absent.

### apps/web (Desktop uses this sidebar)

`apps/desktop-electron` hosts the Web app. No second session list in the Electron shell.

`WorkspaceKanbanFilterMenu` (`apps/web/src/app-shell/sidebar/WorkspaceKanbanFilterMenu.tsx`) gets an optional View block, rendered only when the left sidebar passes `showView`. It sits above the Group By label. Options: `workspace` (default) and `session`. The kanban board does not pass `showView`.

Persist the choice on `workspace_sidebar.view` next to `workspace_sidebar.filters` in `apps/web/src/app-shell/left-sidebar-settings.ts`. Missing value means `workspace`.

Session list replaces workspace rows in `LeftSidebar` when the view is `session`. Group By and Filter stay as they are.

`apps/web/src/app-shell/sidebar/session-grouping.ts` buckets session rows:

| Group By | Session key |
|----------|-------------|
| project | session project id |
| group | workspace membership, else project membership (same as workspace view) |
| status | workspace workflow status |
| agent | this session’s bucket, not the workspace rollup |
| time | session `updated_at`, same day buckets as workspaces |
| label | workspace labels; a session can sit in more than one label group |
| priority | workspace priority |

Row component mirrors the phone row: status icon, title, relative time, then project · workspace · branch · PR. Chat title comes from the existing Agent Chat index (`title`, else provider). Terminal title comes from the candidate label. Copy lives in `apps/web/messages/en.json` and `zh.json` under the sidebar namespace (`view.sectionLabel`, `view.workspace`, `view.session`).

Activate a terminal row by opening that workspace and selecting the pane the phone focuses. Activate a chat row with the existing open-chat path. Hidden archived sessions follow M14.

Subscribe to the same status events the phone uses, and call `agent_session_status_list` when the sidebar mounts. Do not switch `useWorkspaceAgentGroupKeyMap` off the workspace rollup.

## Data model

```rust
pub struct AgentSessionStatusSnapshot {
    pub session_id: String,
    pub context_id: Option<String>,
    pub surface: AgentSurface,          // terminal | chat
    pub surface_id: Option<String>,
    pub tool: Option<AgentToolType>,
    pub group_key: WorkspaceAgentGroupKey, // permission | attention | running | done
    pub updated_at: String,             // RFC3339; required on this snapshot
    pub project_path: Option<String>,
}
```

Wire JSON is snake_case in `packages/api-types/src/ws/dto/agent-status.ts` (new module) with a `WsContract` row `agent_session_status_list: { input: WsEmpty, output: AgentSessionStatusListResponse }`.

Phone row (derived, not a server type):

```ts
type SessionInboxRow = {
  id: string;                 // candidate id
  bucket: "permission" | "attention" | "running" | "done";
  title: string;              // candidate.label, else tmux window name
  updatedAt: string | null;
  projectName: string | null;
  workspaceName: string | null;
  branch: string | null;
  prState: "open" | "draft" | "merged" | "closed" | null;
  workspaceId: string;
  terminalCandidateId: string;
};
```

`prState === "draft"` wins over `open` when `is_draft` is true.

## Transport

### WebSocket

```ts
// request
{ action: "agent_session_status_list", data: {} }
// response data
{ sessions: AgentSessionStatusSnapshot[] }
```

Invariants:

- Chat and terminal rows are both present.
- Two panes in one `context_id` are two objects.
- `group_key` uses `resolve_workspace_agent_group_key`.
- `updated_at` is always set on these objects. Panes that are Done only because no snapshot matched them are not in this list; the phone adds them.

Existing actions reused unchanged: `project_workspace_bootstrap`, `terminal_workspace_candidates`, `github_pr_list`, `git_get_status`.

### REST

None. Workspace rollup REST stays for web hydrate.

## Security & permissions

Same Computer socket as the rest of mobile. The action returns status metadata (ids, paths, tool names), not prompt bodies or transcripts. Do not log `client_token` or gateway URLs. GitHub calls use the Computer’s existing GitHub credentials; the phone does not see those tokens.

## Rollout plan

1. Catalog table + upsert on status change + unit tests that idle cleanup keeps the row (M8, M12, M14). Web unchanged.
2. `WsAction` + api-types contract + extract fixtures.
3. Mobile tab host and Workspace header migration (M1–M3). Session can render an empty inbox.
4. Inbox join, cards, top 5, bucket push, live status (M4–M9, M13).
5. Pane focus query param (M11).
6. PR segment (M10).
7. Sidebar View, session grouping, and row activation on Web (M15–M18). Desktop picks this up by loading Web.

Steps 1–2 can merge before the phone UI. Steps 3–6 are one mobile branch if they land together; do not ship step 3 with a dead Session tab in a store build if that is easy to avoid.

## Risks & tradeoffs

- **Risk**: The glass package is 0.1.0 and its sample app is Expo 57. If the native module does not compile on SDK 56, stop and do not fork it. JavaScript `Tabs` stay either way.
- **Risk**: One `terminal_workspace_candidates` call per workspace on focus. Acceptable for dogfood workspace counts. If it gets slow, a later action can fan out on the server. Do not add that until measured.
- **Tradeoff**: Client join instead of one fat inbox DTO. The status kernel must not learn about tmux candidates or GitHub. The phone already has bootstrap and candidates.
- **Risk**: Candidate id and pane id differ. Matching is only `workspace_id` + `tmux_window_name`. A candidate without a window name cannot light up Running even if some other id matches.
- **Risk**: `?terminal=` arrives before candidates load. Select after merge, once.
- **Tradeoff**: Catalog stores last time and archive, not the live bucket. After a restart the inbox is honest (Done) instead of stale Running.
- **Rollback**: Revert the tabs layout to `app/index.tsx` → `WorkspaceListScreen`. The catalog table is additive; leaving it unused is safe.

## Dependencies & compatibility

- Depends on APP-058 bucket rules and APP-077 terminal strip.
- Does not block them.
- Expo SDK 56 / React Native 0.85. `@rbayuokt/expo-adaptive-glass` 0.1.0 (MIT) peers `expo` and `@react-navigation/bottom-tabs` >= 7. Its own example is built on Expo 57. First install must compile in this app’s dev client (`bun run ios`). It does not run as real glass in Expo Go. npm dependency only; no `NOTICE` entry.
- External: GitHub via the existing Computer GitHub client, when M10 runs.

## Open questions

- [ ] N1 badge and N2 pull-to-refresh wait until the inbox is in daily use.
