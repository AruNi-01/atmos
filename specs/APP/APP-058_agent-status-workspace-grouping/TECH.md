# TECH · APP-058: Agent Status Workspace Grouping

> Technical Design · HOW. Implements PRD APP-058. Addresses M1–M8. N1–N3 deferred.

## Scope summary

Add sidebar/kanban grouping mode `agent` (**By Agent Status**) that buckets workspaces from live agent-hook sessions + sticky attention. Persist the mode string on `workspace_sidebar.grouping_mode`. Project the same rules on the API from in-memory sessions + attention so a browser refresh can hydrate buckets without waiting for the next hook event. No new WS actions, tables, or Agent protocol fields. No SQLite persistence of Agent status (still derived / in-memory).

## Architecture overview

```
crates/core-service  agent_hooks/workspace_agent_group.rs
  list_workspace_agent_groups()  ← in-memory snapshot (sessions + attention)

apps/api  GET /hooks/workspace-agent-groups
  pre-connection bootstrap (same category as GET /hooks/sessions)

apps/web
  features/agent/store/agent-hooks-store.ts      ← hydrate sessions + groups
  features/agent/lib/workspace-agent-status.ts   ← bucket key helper
  features/agent/hooks/use-workspace-agent-status.ts ← live map hook
  app-shell/sidebar/workspace-grouping.ts        ← sidebar groups
  app-shell/sidebar/kanban-columns.ts            ← kanban columns
  app-shell/sidebar/workspace-status.tsx         ← Group By option
  features/task + LeftSidebar                    ← same grouping_mode
```

Function settings already store `grouping_mode` as an untyped JSON string.

## Module-by-module design

### `apps/web/src/features/agent/lib/workspace-agent-status.ts`

Add a grouping helper next to `resolveWorkspaceAgentStatusView`. **Do not** reuse the view helper’s `attentionFilterMode` override — grouping must follow PRD M2 even when the attention filter is on.

```ts
export type WorkspaceAgentGroupKey =
  | "permission"
  | "attention"
  | "running"
  | "idle";

export const WORKSPACE_AGENT_GROUP_ORDER: WorkspaceAgentGroupKey[] = [
  "permission",
  "attention",
  "running",
  "idle",
];

export function resolveWorkspaceAgentGroupKey(input: {
  agentState: AgentHookState;
  attentionReason: AttentionReason | null;
}): WorkspaceAgentGroupKey
```

Rules (M2):

1. `agentState === permission_request` **or** `attentionReason === permission_request` → `permission`
2. `agentState === running` → `running`
3. `attentionReason === task_complete` → `attention`
4. else → `idle`

### `apps/web/src/features/agent/hooks/use-workspace-agent-status.ts`

Add `useWorkspaceAgentGroupKeyMap(contextIds)` that subscribes to `useAgentHooksStore` sessions and `useAgentAttentionStore.revision`, then returns `Record<workspaceId, WorkspaceAgentGroupKey>`. Sidebar derived hook and kanban view both use this map.

### `crates/core-service/src/service/agent_hooks/workspace_agent_group.rs`

Same M2 rules as the TS helper, projected from `AgentHooksService` in-memory maps:

- Aggregate live hook state per `context_id` (permission > running > idle).
- Aggregate sticky attention per `context_id` (permission > task_complete).
- Omit pure-idle contexts (frontend defaults missing keys to `idle`).
- Idle session sweep must **not** drop the snapshot when a `task_complete` or `permission_request` latch remains.

```rust
pub enum WorkspaceAgentGroupKey { Permission, Attention, Running, Idle }

pub struct WorkspaceAgentGroupSnapshot {
    pub context_id: String,
    pub group_key: WorkspaceAgentGroupKey,
}

impl AgentHooksService {
    pub fn list_workspace_agent_groups(&self) -> Vec<WorkspaceAgentGroupSnapshot>
}
```

### `apps/web/src/app-shell/sidebar/workspace-status.tsx`

- Extend `SidebarGroupingMode` with `"agent"`.
- Add `parseSidebarGroupingMode(value: unknown): SidebarGroupingMode` (unknown → `"project"`) and use it in `LeftSidebar` load path so the allowlist lives in one place.
- Add Group By option `{ value: "agent", labelKey: "grouping.agent", icon: Bot }` (copy: **By Agent Status**).
- Export `WORKSPACE_AGENT_GROUP_META` (i18n key, icon, className, color) for sidebar group markers and kanban headers.

### `apps/web/src/app-shell/sidebar/workspace-grouping.ts`

When `groupingMode === "agent"`, bucket with `options.agentGroupKeyByWorkspaceId` (default `idle` if missing). Always emit all four groups in `WORKSPACE_AGENT_GROUP_ORDER`. Labels via `workspaceGroupingT("agent_permission" | …)`.

### `apps/web/src/app-shell/sidebar/kanban-columns.ts`

- `buildKanbanBoardColumns`: `agent` → four columns, `labelIsI18nKey: false` using the same translated labels (or `true` with `appShell.task.agentStatus.*` — pick one source; prefer `workspaceGrouping` keys passed through `workspaceGroupingT` to avoid duplicate copy).
- `resolveKanbanColumnKeys`: `agent` → `[agentGroupKey]` from the map / optional `agentGroupKey` param.
- `isKanbanDragAssignable`: **false** for `agent` (M6).

### `apps/web/src/app-shell/use-left-sidebar-workspace-derived.ts`

- Accept `agentGroupKeyByWorkspaceId`.
- Pass it into `groupWorkspaces`.
- Two-column: `groupingMode === "agent" && workspaceSidebarAgentTwoColumn`.
- `currentWorkspaceGroupKey` in agent mode = that workspace’s group key.

### `apps/web/src/app-shell/sidebar/WorkspaceKanbanView.tsx`

Subscribe to the group-key map; pass into `resolveKanbanColumnKeys`. No create-workspace button on Agent columns. Header icons from agent group meta (not a color swatch).

### Hydrate (refresh)

`useAgentHooksStore.init()` loads sessions, attention, and workspace-agent-groups in `Promise.all`, then applies them together. `useWorkspaceAgentGroupKeyMap` uses the API snapshot until that hydrate finishes, then follows live stores (WS).

### Settings / URL

- `apps/web/src/api/ws/settings-api.ts` — add `"agent"` to `grouping_mode` union.
- `apps/web/src/shared/lib/nuqs/searchParams.ts` — `TaskGroupingModeParam` + `taskGroupBy` enum include `"agent"`.
- `layout-settings-store.ts` + `LayoutSettingsSection.tsx` — `workspace_sidebar_agent_two_column` boolean, same pattern as status/time/priority/label/group.
- `settings-modal-data.ts` — search item + keywords.

### i18n

`apps/web/messages/en.json` and `zh.json`:

- `appShell.task.grouping.agent`
- `appShell.workspaceGrouping.agent_permission` / `agent_attention` / `agent_running` / `agent_idle`
- Layout two-column title/description for By Agent Status
- Settings search labels

English: `By Agent Status`, `Need permission`, `Need attention`, `Running`, `Idle` (sentence case). Chinese: `按 Agent 状态`, `需要授权`, `需要关注`, `运行中`, `空闲`.

## Data model

No DB. In-memory on the API (hook sessions + attention latches), projected as:

```ts
type WorkspaceAgentGroupKey = "permission" | "attention" | "running" | "idle";
```

Persisted (user preference only):

```ts
workspace_sidebar.grouping_mode: SidebarGroupingMode // now includes "agent"
layout.workspace_sidebar_agent_two_column: boolean
```

## Transport

- Existing `functionSettingsApi.update("workspace_sidebar", "grouping_mode", mode)` and layout key updates.
- **REST exception (bootstrap)**: `GET /hooks/workspace-agent-groups` → `{ groups: [{ context_id, group_key }] }`. Same pre-connection hydrate category as `GET /hooks/sessions` and `GET /hooks/attention`. Not a duplicate write path — it is a projection of those in-memory maps. No new WS event.

## Security & permissions

No new auth surface. Agent state is already on-device UI state from hook events.

## Rollout plan

1. Bucket helper + unit tests (`resolveWorkspaceAgentGroupKey`).
2. Extend grouping mode union, Group By option, `groupWorkspaces` / `kanban-columns`.
3. Wire live map into sidebar derived hook + kanban; persist/parse `"agent"`.
4. Two-column layout toggle + i18n (**By Agent Status**).
5. Backend in-memory snapshot + `GET /hooks/workspace-agent-groups` + frontend hydrate.
6. Bun tests for grouping/kanban membership; Rust tests for refresh snapshot; optional Playwright Group By visibility.

## Risks & tradeoffs

- **Tradeoff**: Four buckets instead of splitting live vs sticky permission. Sticky permission is still “Need permission” because the user action is the same.
- **Tradeoff**: Attention filter overlay does not change grouping. A running workspace stays in Running even if the filter would show a bell. Matches PRD “after down”.
- **Risk**: Subscribing to the whole sessions Map re-groups on every hook tick. Acceptable — list surfaces already re-render on those ticks for status marks.
- **Pinned rows**: Unchanged — pinned workspaces stay in the pinned section and are omitted from grouped unpinned lists.
- **If this breaks in production, the rollback path is**: users switch Group By away from By Agent Status; unknown persisted values already fall back to `project`. Old APIs without `GET /hooks/workspace-agent-groups` still hydrate sessions + attention; grouping reconstructs on the client.

## Dependencies & compatibility

- Depends on existing agent hook sessions + sticky attention in `AgentHooksService` memory.
- Blocks nothing.
- Old clients ignore unknown `grouping_mode`; new client falls back unknown → `project`.
- Clients that do not call `GET /hooks/workspace-agent-groups` still restore buckets from `GET /hooks/sessions` + `GET /hooks/attention`.

## Open questions

- None. N1 filter chips deferred.
