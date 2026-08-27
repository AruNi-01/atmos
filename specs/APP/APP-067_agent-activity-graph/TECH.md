# TECH · APP-067: Agent Observer

> Technical Design · HOW. Implements PRD APP-067. Addresses M1–M10. N1–N5 deferred.

## Scope summary

Keep `AgentHookSession` / `agent_hook_state_changed` as the coarse lifecycle used by APP-058, footer counts, and attention. Add an in-memory **activity** record on `AgentHooksService` whose history unit is an **`AgentTurn`**. Fold tool / child / todo / **prompt** fields in the v1 adapters, **upgrade hook install templates** so those fields actually arrive, expose a REST snapshot + typed WS event, and render a computer-scoped React Flow tree in `apps/web`.

Idle sweep and pane-focus dismiss continue to drop **session rows**. They do **not** drop activity/turns. No SQLite. No Canvas / tldraw changes. No Token Usage–style Computer picker.

## Frozen decisions

| Decision | Rule |
|----------|------|
| Parallel model | State map unchanged. Activity is a second map keyed by `session_id`. |
| History unit | `AgentTurn` opened by prompt-submit / NewTurn, closed by Idle/Stop or the next prompt. |
| Finished Agents | Stay on the graph while an activity record with `turns.length ≥ 1` exists. |
| Automatic idle cleanup | `clear_idle_older_than` and client `dismissIdleSessionsForPane` do **not** call activity clear. |
| Explicit drop | Footer Clear idle, session remove, pane destroy, tool takeover, API process restart **do** drop activity. |
| Hook install | Bump `CURRENT_HOOK_VERSION` **4 → 5**. Startup `sync_installed_hooks` refreshes installed tools. |
| Layout lib | In-house vertical tree. Do not add `elkjs` (EPL). |
| Equality emit | Compare visible fields only (not `last_event_at`). |
| Graph scope | Connected workbench Computer. Hydrate + subscribe that Computer. Reset on Computer switch. |
| i18n | `apps/web/messages/{en,zh}.json` only. Namespace `AgentObserver.*` (do not reuse `Agent.*` manager copy, do not put app copy in `packages/i18n`). |
| Footer | Popover stays. Optional one-line from activity. Launchpad opens the board. |

## Architecture overview

```text
terminal Agent
  → hook command / plugin (v5 bodies) → POST /hooks/<tool>
apps/api hook routes
  → AgentHooksService::handle_*          state machine, unchanged rules
  → ActivityFolder::apply(payload)       NEW
        sessions: Map<session_id, AgentHookSession>      // existing
        activity: Map<session_id, AgentActivity>         // NEW, outlives idle row
        children: Map<session_id, Map<child_id, …>>      // live children only

broadcast AgentHookEvent (existing channel, new variants)
  agent_hook_state_changed
  agent_activity_updated            // visible-field change only
  agent_activity_cleared            // explicit drop / pane destroy / takeover

GET /hooks/sessions                 existing bootstrap (state chrome)
GET /hooks/activity                 NEW snapshot (graph + footer one-liner)
  justified: same class as GET /hooks/sessions — refresh hydrate before WS

apps/web
  features/agent/store/agent-hooks-store.ts     state (unchanged rules)
  features/agent/store/agent-activity-store.ts  NEW; ignore pane-focus dismiss
  features/agent/lib/agent-activity-graph.ts    tree projection
  features/agent/components/AgentActivityGraphView.tsx
  Launchpad item `agent-observer` → /agent-observer (Center Stage no-host view)
```

## Data model

### `AgentActivity` (Rust + `@atmos/api-types`)

Wire JSON, snake_case. Bind fields are **copied onto activity** so the graph still parents a node after the session row is swept.

```ts
export type AgentToolLine = {
  name: string;
  detail: string;                // truncated path / command / query, max 120
  state: "pending" | "ok" | "error";
  started_at: string;            // ISO-8601
  ended_at?: string | null;
  duration_ms?: number | null;
  repeat: number;                // consecutive same-name aggregation; default 1
};

export type AgentTodoItem = {
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
};

export type AgentChildActivity = {
  child_id: string;
  name?: string | null;
  state: AgentHookState;
  current_tool?: AgentToolLine | null;
  recent_tools: AgentToolLine[]; // cap 8; live child only
  started_at: string;
  last_event_at: string;
};

export type AgentTurn = {
  turn_id: number;               // monotonic per session, from 1
  prompt: string;                // submitted text, max 240; "" if unknown
  started_at: string;
  ended_at?: string | null;      // set when the turn closes
  tools: AgentToolLine[];        // this turn, newest last; cap 32 after aggregation
  todos: AgentTodoItem[];        // snapshot after last TodoWrite in this turn
  spawned_child_ids: string[];   // child ids started during this turn
};

export type AgentActivity = {
  session_id: string;
  tool: AgentHookToolType;
  context_id?: string | null;
  pane_id?: string | null;
  project_path?: string | null;
  terminal_kind?: string | null;
  side_chat_id?: string | null;
  source_pane_id?: string | null;
  last_state: AgentHookState;    // last observed; graph uses this if session row is gone
  current_tool?: AgentToolLine | null;
  todos: AgentTodoItem[];        // latest list (collapsed n/m)
  children: AgentChildActivity[];
  turns: AgentTurn[];            // oldest → newest
  turns_omitted: number;         // oldest dropped beyond TURNS_MAX
  current_turn_id?: number | null;
  last_file?: string | null;     // relative; reserved for N2, unused in v1 UI
  started_at: string;            // first turn
  last_event_at: string;
};
```

Caps (constants, not settings): `TURNS_MAX = 50`, `TOOLS_PER_TURN = 32`, `RECENT_TOOLS_CHILD = 8`, `DETAIL_CHARS = 120`, `PROMPT_CHARS = 240`, `TODO_WIRE = 40` (UI shows 5 + overflow). `TURNS_MAX` is a safety bound, not a product “forget old chats” policy.

### Turn folding

`fold_activity(session_id, child_id, payload)` after the existing state write.

- **Open turn**: on `StateUpdateKind::NewTurn` or prompt-submit event. If a turn is already open, close it (`ended_at = now`) then append. Copy prompt from payload (`prompt` / `content` / `user_prompt` / string `text`). Empty string if the event has no text (must not invent).
- **Tools**: lead traffic with no `agent_id` updates `current_tool` + current turn’s `tools`. Child traffic updates `children[child_id]` only, and does not steal the lead turn’s current tool.
- **Close turn**: `TerminalIdle` / `QuietIdle` / `ForcedIdle` / Stop / AgentEnd. Set `ended_at`, clear `current_tool` and `current_turn_id`. Keep the activity record.
- **Late PostToolUse** inside `RUNNING_SUPPRESS_AFTER_IDLE` (3s): attach to the last closed turn if names match a pending slot; **do not** reopen a turn or force Running (state rules unchanged). If state stays Idle, do not show `current_tool` on the card.
- **Tool takeover** (another tool writes the same `session_id` while Idle): replace the activity record (new `tool`, empty `turns`). Emit `agent_activity_updated` with the new record (not a merge).
- **No session row yet**: existing adapters create the session first; activity fold requires the row to exist on first event, then activity may outlive a later row delete.

### Aggregation

Consecutive **completed** tools on the **same turn** with the same `name` within `RUN_GAP = 8s` collapse into one slot. Slot keeps latest `detail`, increments `repeat` (UI: `bash ×5`). Pending tools never aggregate; they live in `current_tool` until Post / ToolResult / `tool.execute.after`.

### Lifetime

| Trigger | Session row | Activity / turns |
|---------|-------------|------------------|
| Prompt / tools / idle | update | keep; close or append turn |
| `clear_idle_older_than` (APP-051 job, default 30 min) | delete idle rows | **keep** |
| Client `dismissIdleSessionsForPane` | delete idle rows locally | **keep** (store ignores that path) |
| Stale-active force idle | row stays, state Idle | close current turn, **keep** |
| Footer **Clear idle** (`clear_idle_sessions`) | delete | **delete** + `agent_activity_cleared` |
| `remove_session` / graph Remove | delete | **delete** + cleared |
| Pane destroy (`removeSessionsForPane` / teardown) | delete | **delete** + cleared |
| `SessionEnd` | force idle (existing) | close turn, **keep** (same pane may continue) |
| Computer switch / API restart | empty | empty |

`GET /hooks/activity` returns every retained activity record, including those whose session row is gone.

## Adapter fold (v1)

Each adapter keeps its state `match`. After `update_state` / `handle_child_lifecycle`, call `service.fold_activity(...)`.

Shared extractor in `crates/core-service/src/service/agent_hooks/activity.rs`:

| Want | Keys tried (first hit) |
|------|------------------------|
| Event name | `hook_event_name`, `hookEventName`, `type` |
| Tool name | `tool_name`, `toolName`, `tool`, `name` |
| Tool input | `tool_input`, `toolInput`, `input`, `arguments`, `properties` |
| File / detail | `file_path`, `notebook_path`, `command`, `pattern`, `url`, `query`, `prompt` (string) |
| Todos | `tool_input.todos` or `todos` array with `content` + `status` |
| Prompt | `prompt`, `content`, `user_prompt`, `text` (string) |
| Child id | existing `extract_child_agent_id` |

Unknown events: no-op. Malformed fields: skip that field. Never fail the hook HTTP handler.

## Hook install (v5)

`crates/core-engine/src/agent_hooks/mod.rs`: `CURRENT_HOOK_VERSION = 5`.

Startup `sync_installed_hooks` already rewrites installed tools. Users who opted out stay opted out. All tools show outdated until refresh — accepted cost of a global version constant.

| Tool | File | v5 change |
|------|------|-----------|
| Claude Code | `claude_code.rs` | `UserPromptSubmit`: **stdin-forward** (same as PreToolUse). SessionStart/SessionEnd may stay fixed-body. |
| Grok Build | `grok_build.rs` | Already stdin including UserPromptSubmit. **Register** `SubagentStart` / `SubagentStop` stdin entries if the hook schema accepts those names; unknown names are ignored by the product. |
| Codex | `codex.rs` | Replace fixed-body with **stdin-forward**. `UserPromptSubmit` stdin. `PreToolUse` stdin, **no Bash-only matcher**. Add `PostToolUse` stdin if Codex documents the event; otherwise complete tools on the next Stop / next Pre. |
| OpenCode | `opencode.rs` | Plugin hooks: `chat.message` (POST `input` + `output.message/parts`; user text lives in parts, not `message.updated`) and `tool.execute.before/after` (POST `input.tool` + `output.args`). Keep `event:` for session/permission only. Skip `message.part.delta`. |
| Pi | `pi.rs` | `before_agent_start`: POST `event.prompt` as the sole PromptSubmit. `agent_start`: POST with no extras (Progress; do not open a second turn). `tool_call`: pass `toolName` + `input`/`arguments` when present. |

Hooks remain `timeout: 5` (or current per-event timeouts), `|| true`, `ATMOS_MANAGED`, fail-silent. Activity fold must tolerate v4 empty bodies (prompt `""`, no tools) so mixed-version panes do not error.

## APIs

### REST

`GET /hooks/activity` — same auth / Computer scope as `GET /hooks/sessions`. Bootstrap after refresh; not a substitute for WS.

```json
{ "sessions": [ /* AgentActivity */ ] }
```

Empty `sessions: []` is valid. Include records whose hook session row is gone.

Add `agentHooksApi.listActivity()` next to `listSessions` in `apps/web/src/api/rest-api.ts` (relay HTTP gateway already used by hook REST).

### WS (APP-064 catalog)

Extend `AgentHookEvent` in `crates/core-service/src/service/agent_hooks.rs` and the forwarder in `apps/api/src/main.rs` (`spawn_agent_hook_forwarder`). Do **not** open a second broadcast channel.

```ts
agent_activity_updated: { payload: AgentActivity }
agent_activity_cleared: { payload: { session_ids: string[] } }
```

Visible-field equality (skip emit when equal): `tool`, bind ids, `last_state`, `current_tool`, `todos`, `children` (ids + their current_tool/state), `turns` (ids, prompts, tool slots including `repeat`, ended_at), `turns_omitted`. **Exclude** `last_event_at`.

Raise the existing `broadcast::channel(64)` to **256** so tool ticks + activity do not `Lagged` under a handful of concurrent Agents.

No new `WsAction` in v1.

DTO + `WsEvent` extract in the same PR as Rust (`packages/api-types` recipe).

## Graph projection (client)

`buildActivityGraph({ projects, sessions, activity, collapsedIds, expandedAgentIds, expandedTurnIds }) → { nodes, edges }`

Membership:

1. Every `AgentActivity` with `turns.length ≥ 1` → Agent node (idle-with-history included).
2. Every live `AgentHookSession` without activity → state-only Agent node.
3. Bind fields: prefer session row, else activity copies.

Stable ids:

| Node | id |
|------|----|
| Root | `atmos` |
| Project | `project:{projectId}` |
| Fallback | `project:unassigned` |
| Workspace | `workspace:{workspaceId}` |
| Agent | `agent:{sessionId}` |
| Subagent | `child:{sessionId}:{childId}` |

Edges: `parent→child` with `kind: "owns" | "spawn"`. `spawn` is Agent→Subagent and `animated` while child `state === running` or `current_tool` is pending. Honor `prefers-reduced-motion` (no animated edges).

Parent resolution:

1. `context_id` matches a workspace id → that workspace → its project.
2. Else `context_id` matches a project id → that project.
3. Else `project_path` matches a known project `mainFilePath` / local path → that project.
4. Else `project:unassigned`.

`projects` from the existing project bootstrap query. Graph does not fetch git or fs.

Computer switch: `agent-activity-store.resetForConnectionChange` next to the hooks store reset; drop map, re-hydrate REST for the new Computer.

### Layout

- Renderer: `@xyflow/react` (already in `apps/web`). Import `@xyflow/react/dist/style.css` from the JS graph (same as Actions workflow).
- Algorithm: in-house vertical tree layout (no extra dagre/elk dependency). Run on structure change (node add/remove, expand/collapse). **Not** on `current_tool` or in-turn tool ticks.
- Content updates: `setNodes` map to patch `data` in place; node id set stable.
- New nodes: place below parent + sibling offset until Relayout.
- Min zoom 0.2. Fit on first hydrate only.

Custom node types: `atmosRoot`, `project`, `workspace`, `agent`, `subagent`. Cards must not import terminal/xterm.

### Collapse state

React state (not persisted in v1 — N4):

- `collapsedIds`: Project / Workspace collapsed. Default: root, projects, workspaces **expanded**.
- `expandedAgentIds`: Agent expanded (turns in-node + Subagent nodes). Default: **none** (compact).
- `expandedTurnIds`: `${sessionId}:${turnId}` turn rows expanded inside an open Agent. Default: **none**.

In-node turn list: newest first, last **8** rows; `turns_omitted + older than 8` summarized as “+N earlier” which selects the Agent (right panel has the full list).

Elapsed: client 1s tick from current turn `started_at` while `last_state !== idle`. Idle cards show last turn duration (`ended_at - started_at`) or omit.

## Web surfaces

Launchpad page follows Token Usage: `createAppPage` route + Center Stage no-host view. Touch all of:

| Piece | Location |
|-------|----------|
| Route shell | `apps/web/src/app/(app)/agent-observer/page.tsx` |
| View | `features/agent/components/AgentActivityGraphView.tsx` |
| Nodes | `features/agent/components/graph/*-node.tsx` |
| `CurrentView` | `shared/hooks/use-context-params.ts` (`"agent-observer"`) |
| Center Stage | `app-shell/center-stage-support.tsx` |
| Left sidebar expand set | `app-shell/LeftSidebar.tsx` |
| Launchpad id | `LaunchpadItemId` + `LAUNCHPAD_ITEM_IDS`; default **outside**, **enabled** |
| Launchpad defs | `LeftSidebarLaunchpad.tsx` `ITEM_DEF_BY_ID`, `LaunchpadLayoutSettings.tsx` |
| Document title | `app-shell/DocumentTitle.tsx` |
| Command palette | `app-shell/global-search-app-items.tsx` |
| Footer | popover unchanged; one line from activity; “Open Agent Observer” control → `/agent-observer` |
| i18n | `AgentObserver.*` in `apps/web/messages/en.json` + `zh.json` |

Click **Open pane**: existing `navigateToAgentHookSessionPane`. Subagent: lead session’s pane. Display name: existing `uniquePaneTitleForAgentStatus` + `AGENT_TOOL_LABELS`.

Disconnected / no Computer: dedicated empty state (not the “hooks quiet” copy).

## Risks

- **Payload shape drift** — extractors best-effort; commit real fixtures under `crates/core-service/src/service/agent_hooks/fixtures/` (no secrets, strip home paths).
- **v4 hooks still installed until API restart** — cards may have empty prompts; tolerate; do not error.
- **Event storms** (OpenCode deltas) — ignore pure stream deltas; only tool / permission / session / child / todo / prompt events fold.
- **WS lag** — channel 256 + visible-field equality. If a 50-turn payload is large, still send the full `AgentActivity` in v1 (no patch protocol).
- **Path leaking** — `detail` / `last_file` / prompts prefer paths relative to `project_path`; never put `$HOME` prefixes on the card if relativize succeeds. Prompts are user text; truncate, do not log full prompt in debug.
- **Footer idle counts vs graph** — expected: footer can be empty of idle rows while the graph still shows finished Agents. Copy on the graph node is Idle, not “missing.”
- **xyflow CSS** — JS import, not Tailwind `@import`.
- **License** — no new graph-layout dependency. Do not add `elkjs`.

## Rollout

1. Rust activity map + turn fold + REST + WS variants + adapter tests + hook v5 templates. No UI.
2. Client activity store hydrate + Computer-switch reset + footer one-liner + popover link. Additive, no flag.
3. Graph page + Launchpad shell checklist. Compact cards, membership includes idle-with-turns.
4. In-node turn fold + Subagent expand + Relayout.

No feature flag. Empty graph is valid when hooks are quiet.

```mermaid
sequenceDiagram
  participant Agent as Terminal agent
  participant Hook as POST /hooks/tool
  participant Svc as AgentHooksService
  participant WS as /ws
  participant UI as Agent Observer

  Agent->>Hook: UserPromptSubmit stdin JSON
  Hook->>Svc: handle adapter
  Svc->>Svc: update_state(Running, NewTurn)
  Svc->>Svc: fold_activity(open turn with prompt)
  Svc->>WS: agent_hook_state_changed
  Svc->>WS: agent_activity_updated
  WS->>UI: add/patch Agent node
  Agent->>Hook: PreToolUse
  Svc->>Svc: fold_activity(current_tool pending)
  Svc->>WS: agent_activity_updated
  Note over UI: layout unchanged; card line updates
  Agent->>Hook: Stop
  Svc->>Svc: update_state(Idle); close turn
  Svc->>WS: agent_hook_state_changed
  Svc->>WS: agent_activity_updated
  Note over UI: node remains; turn row closed
```
