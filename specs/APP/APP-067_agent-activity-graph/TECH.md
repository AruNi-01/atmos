# TECH · APP-067: Agent Activity Graph

> Technical Design · HOW. Implements PRD APP-067. Addresses M1–M10. N1–N5 deferred.

## Scope summary

Keep `AgentHookSession` / `agent_hook_state_changed` as the coarse lifecycle used by APP-058, footer counts, and attention. Add an in-memory **activity** ring on `AgentHooksService`, fold tool/child/todo/prompt fields in the v1 adapters, expose a REST snapshot + typed WS event, and render a computer-scoped React Flow tree in `apps/web`.

No SQLite table. No new hook install URLs. No Canvas / tldraw changes.

## Architecture overview

```text
terminal Agent
  → existing hook command (stdin / curl) → POST /hooks/<tool>
apps/api hook routes
  → AgentHooksService::handle_* (state machine, unchanged rules)
  → ActivityFolder::apply(payload)          NEW
        sessions: Map<session_id, AgentHookSession>
        activity: Map<session_id, AgentActivity>
        children: Map<session_id, Map<child_id, AgentActivity>>

broadcast
  agent_hook_state_changed          existing
  agent_activity_updated            NEW (only when activity actually changed)
  agent_activity_cleared            NEW (session sweep / force idle drop)

GET /hooks/sessions                 existing bootstrap
GET /hooks/activity                 NEW snapshot for graph + footer tool line

apps/web
  features/agent/store/agent-hooks-store.ts     state (unchanged shape)
  features/agent/store/agent-activity-store.ts  NEW
  features/agent/lib/agent-activity-graph.ts    tree projection
  features/agent/components/AgentActivityGraphView.tsx
  app-shell Launchpad item `agent-graph` → /agent-graph
```

## Data model

### `AgentActivity` (Rust + `@atmos/api-types`)

Wire JSON, snake_case. One object per lead session; children nested (not a second session_id in the hook session map).

```ts
export type AgentToolLine = {
  name: string;          // "Edit" | "Bash" | "read" | vendor name, as received
  detail: string;        // truncated path / command / query, max 120 chars
  state: "pending" | "ok" | "error";
  started_at: string;    // ISO-8601
  ended_at?: string | null;
  duration_ms?: number | null;
};

export type AgentTodoItem = {
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
};

export type AgentChildActivity = {
  child_id: string;
  name?: string | null;          // subagent_type / description if present
  state: AgentHookState;         // running | idle | permission_request
  current_tool?: AgentToolLine | null;
  recent_tools: AgentToolLine[]; // cap 8
  started_at: string;
  last_event_at: string;
};

export type AgentActivity = {
  session_id: string;
  tool: AgentHookToolType;
  current_tool?: AgentToolLine | null;
  recent_tools: AgentToolLine[]; // cap 8, newest first
  todos: AgentTodoItem[];        // replaced wholesale on TodoWrite
  children: AgentChildActivity[];
  prompt_preview?: string | null; // max 240 chars
  last_file?: string | null;      // last tool file_path relative if possible
  started_at: string;             // first NewTurn / first activity
  last_event_at: string;
};
```

Caps (constants, not settings in v1): `RECENT_TOOLS = 8`, `DETAIL_CHARS = 120`, `PROMPT_CHARS = 240`, `TODO_WIRE = 40` (UI shows 5 + overflow).

### Aggregation

Consecutive completed tools with the same `name` within `RUN_GAP = 8s` collapse into one recent_tools slot. The slot keeps the latest `detail`, sums count in `detail` only at UI (`bash ×5`). Pending tools never aggregate; a pending line is `current_tool` until PostToolUse / ToolResult / `tool.execute.after`.

### Lifetime

- Created on first activity fold for a known `session_id` (session row must exist or be created by the existing state path first).
- Dropped with the session on idle sweep, stale-active sweep, `force_session_idle` teardown, and `agent_hook_sessions_cleared`.
- Child entries dropped on SubagentStop / child idle; lead `children` array shrinks. A stopped child is **not** kept for replay.
- `RUNNING_SUPPRESS_AFTER_IDLE` still applies to **state**. Activity may record a late PostToolUse that does not resurrect Running (same 3s window); if state stays Idle, `current_tool` is cleared.

## Adapter fold (v1)

Each adapter keeps its state `match`. After (or beside) `update_state` / `handle_child_lifecycle`, call `service.fold_activity(session_id, child_id, payload)`.

Shared extractor in `agent_hooks/activity.rs`:

| Want | Keys tried (first hit) |
|------|------------------------|
| Event name | `hook_event_name`, `hookEventName`, `type` |
| Tool name | `tool_name`, `toolName`, `tool`, `name` |
| Tool input | `tool_input`, `toolInput`, `input`, `arguments`, `properties` |
| File / detail | `file_path`, `notebook_path`, `command`, `pattern`, `url`, `query`, `prompt` (string) |
| Todos | `tool_input.todos` or `todos` array with `content` + `status` |
| Prompt | `prompt`, `content`, `user_prompt` (string) |
| Child id | existing `extract_child_agent_id` |

Per-tool notes:

- **Claude Code / Grok Build**: `PreToolUse` → pending `current_tool`; `PostToolUse` / `PostToolUseFailure` → complete + push recent; `UserPromptSubmit` → `prompt_preview`; `TodoWrite` → replace `todos`; child events keyed by `agent_id`.
- **Codex**: same Pre/Post tool mapping; ignore missing child/todo fields.
- **OpenCode**: `tool.execute.before` / `after` (tool name from payload `tool` / `properties`); `permission.*` does not invent a tool line.
- **Pi**: `ToolCall` pending, `ToolResult` complete.

Unknown events: no-op. Malformed JSON fields: skip that field. Never fail the hook HTTP handler (hooks stay fail-silent).

## APIs

### REST

`GET /hooks/activity` — same auth / computer scope as `GET /hooks/sessions`.

```json
{ "sessions": [ /* AgentActivity */ ] }
```

Returns only sessions that currently exist in the state map. Empty `sessions: []` is valid.

### WS (APP-064 catalog)

```ts
agent_activity_updated: { payload: AgentActivity }
agent_activity_cleared: { payload: { session_ids: string[] } }
```

Emit `agent_activity_updated` only when the folded struct is not equal to the previous (field-wise). Tool ticks that do not change visible fields (e.g. duplicate PostToolUse) do not broadcast.

Forwarder in `apps/api/src/main.rs` next to the existing agent-hook forwarder.

No new `WsAction` in v1. Graph is subscribe + REST hydrate.

## Graph projection (client)

`buildActivityGraph({ projects, sessions, activity, collapsedIds }) → { nodes, edges }`

Stable ids:

| Node | id |
|------|----|
| Root | `atmos` |
| Project | `project:{projectId}` |
| Fallback | `project:unassigned` |
| Workspace | `workspace:{workspaceId}` |
| Agent | `agent:{sessionId}` |
| Subagent | `child:{sessionId}:{childId}` |

Edges: `parent→child` with `kind: "owns" | "spawn"`. `spawn` is Agent→Subagent and `animated` while child `state === running` or child `current_tool` is pending.

Parent resolution:

1. `context_id` matches a workspace id → under that workspace → that workspace's project.
2. Else `context_id` matches a project id → under that project.
3. Else `project_path` matches a known project `mainFilePath` / local path → under that project.
4. Else `project:unassigned`.

`projects` catalog comes from the existing project bootstrap query. Graph does not fetch git or fs.

### Layout

- Renderer: `@xyflow/react` (already a web dependency; GitHub Actions graph is the prior art for custom nodes + CSS import).
- Algorithm: dagre / elk **vertical tree** (root at top). Run on structure change (node add/remove, expand/collapse), **not** on `current_tool` mutation.
- Content updates use `setNodes` map to patch `data` in place.
- New nodes: if layout is stale, place below parent + sibling offset until the next Relayout.
- Min zoom 0.2. Fit on first hydrate only.

Custom node types: `atmosRoot`, `project`, `workspace`, `agent`, `subagent`. Cards are React components; they must not import terminal/xterm.

### Collapse state

React state `Set<string>` of collapsed node ids. Defaults:

- Root, Project, Workspace: **expanded**
- Agent: **compact card**, children **collapsed** (no Subagent nodes until expanded)
- Subagent: compact

Not persisted in v1 (N4).

## Web surfaces

| Piece | Location |
|-------|----------|
| Route | `apps/web/src/app/(app)/agent-graph/page.tsx` |
| View | `features/agent/components/AgentActivityGraphView.tsx` |
| Nodes | `features/agent/components/graph/*-node.tsx` |
| Launchpad id | `agent-graph` on `LaunchpadItemId`, default **outside**, enabled |
| Footer | Agent overview popover shows `current_tool` when activity exists |
| i18n | `Agent.graph.*` in `packages/i18n` / web messages |

Shell: reuse Launchpad full-page pattern (Token Usage / Disk Analyzer): header stays, left sidebar stays, center stage is the graph. Do not mount inside `CenterStage` workspace tabs.

Click **Open pane**: existing `navigateToAgentHookSessionPane`.

## Hook install

No version bump **required** if current v4 stdin-forwarding already delivers tool payloads (Claude/Grok). If a v1 tool's install command currently posts a fixed `{hook_event_name}` body for tool events, bump that tool's command to stdin-forward and bump `CURRENT_HOOK_VERSION` only if the install JSON changes. Record the decision in implementation notes. Activity fold must tolerate both rich and empty payloads.

Hooks remain `timeout: 5`, `|| true`, ATMOS_MANAGED, fail-silent.

## Risks

- **Payload shape drift** — extractors are best-effort; unit-test each adapter with fixtures from real payloads committed under `crates/core-service/src/service/agent_hooks/fixtures/`.
- **Event storms** (OpenCode `message.part.delta`) — activity fold ignores pure stream deltas; only tool/permission/session/child/todo/prompt events update activity. State adapter already skips redundant Running writes; keep that.
- **Path leaking** — `detail` and `last_file` prefer paths relative to `project_path`; never put home-directory prefixes in the card if relativize succeeds.
- **xyflow CSS** — import `@xyflow/react/dist/style.css` from the JS graph (same as Actions workflow) so the pane is not blank.

## Rollout

1. Rust activity map + REST + WS + adapter tests (no UI).
2. Client store hydrate + footer current-tool line (behind no flag; additive).
3. Graph page + Launchpad. Ship as a normal Launchpad item.
4. Subagent expand + todos + chips.

No feature flag. Graph empty state is valid when hooks are quiet.

```mermaid
sequenceDiagram
  participant Agent as Terminal agent
  participant Hook as POST /hooks/tool
  participant Svc as AgentHooksService
  participant WS as /ws
  participant UI as Agent Graph

  Agent->>Hook: PreToolUse stdin JSON
  Hook->>Svc: handle adapter
  Svc->>Svc: update_state(Running)
  Svc->>Svc: fold_activity(current_tool pending)
  Svc->>WS: agent_hook_state_changed
  Svc->>WS: agent_activity_updated
  WS->>UI: patch session node data
  Note over UI: layout unchanged; card line updates
  Agent->>Hook: SubagentStart
  Svc->>Svc: handle_child_lifecycle
  Svc->>WS: agent_activity_updated (children)
  UI->>UI: if parent expanded, add child node + spawn edge
```
