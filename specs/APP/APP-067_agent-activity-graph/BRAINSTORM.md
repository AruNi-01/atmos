# Brainstorm · APP-067: Agent Activity Graph

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos already installs per-tool hooks and tracks live Agent **state** (`idle` / `running` / `permission_request`) per session, bound to `context_id` / `pane_id`. Sidebar grouping (APP-058) and the footer overview can tell the user *which* panes are busy. They cannot tell the user *what* those Agents are doing: current tool, recent tools, todos, or child agents.

The hook HTTP handlers already receive that richer payload (`PreToolUse` / `PostToolUse` / `SubagentStart` / `ToolCall` / `tool.execute.before`, …) and currently fold it down to a state enum. Child ids already live in `active_children` so a lead session does not go Idle while background work continues — but the UI never sees those children.

Users run many terminals across many projects and worktrees. There is no single surface that shows the whole computer as a graph.

## Goals (draft)

- Primary: fold every useful hook field (tools, children, todos, permission) into a live **activity** model, without changing the existing state machine used by sidebar / footer / attention.
- Secondary: render that model as a React Flow graph: Atmos → Project → Workspace → Agent → Subagent.
- Non-goal: replace Canvas, replace the footer, parse vendor session transcripts, or invent a second hook install path.

## Current hook surface (audit)

Live session row today (`AgentHookSession`):

| Field | Role |
|-------|------|
| `session_id`, `tool`, `state`, `timestamp` | Identity + coarse lifecycle |
| `project_path`, `context_id` | Bind to project or workspace |
| `pane_id`, `terminal_kind`, `side_chat_id`, `source_pane_id` | Navigate back to the pane |
| `hook_version` | Install freshness |

States stay `idle` / `running` / `permission_request`. Sticky attention (`permission_request`, `task_complete`) is unchanged.

Adapters already ingest, then discard, tool and child events:

| Tool (v1) | Lifecycle | Tool events | Children | Permission | Todos |
|-----------|-----------|-------------|----------|------------|-------|
| Claude Code | SessionStart, UserPromptSubmit, Stop, SessionEnd | Pre/PostToolUse, PostToolUseFailure | SubagentStart/Stop + `agent_id` on child traffic | PermissionRequest / Notification | TodoWrite in PostToolUse input |
| Codex | SessionStart, UserPromptSubmit, Stop, SessionEnd | Pre/PostToolUse | none | none | none observed |
| Grok Build | same family as Claude, plus name aliases | Pre/PostToolUse (+ snake/camel) | SubagentStart/Stop aliases | notification `permission_prompt` / `elicitation_dialog` | same as Claude if payload carries TodoWrite |
| OpenCode | `session.*`, `agent.running` | `tool.execute.before` / `after` | none in current adapter | `permission.asked` / `question.asked` | none observed |
| Pi | SessionStart, AgentStart, AgentEnd, SessionShutdown | ToolCall / ToolResult | none | none | none observed |

Other installed tools (Cursor, Gemini, …) keep updating **state** as they do today. v1 activity fold is the five tools above.

## Options

### Option A — Extend `agent_hook_state_changed` with activity fields
Put `current_tool`, `recent_tools`, `children`, `todos` on the existing notification.

**Pros**: One WS event.
**Cons**: Footer and sidebar re-render on every tool tick. Event size grows. APP-058 grouping does not need these fields.
**Rejected.**

### Option B — Parallel activity model + dedicated WS event
Keep `AgentHookSession` / `agent_hook_state_changed` as the coarse lifecycle. Add an in-memory activity ring per session and push `agent_activity_updated`. Graph, footer popover, and sidebar rows that *opt in* subscribe to activity.

**Pros**: Existing surfaces stay cheap. Activity can drop on idle sweep with the session. Matches “enhance hooks, don't replace them.”
**Cons**: Two stores on the client.
**Lock.**

### Option C — Per-workspace Canvas widgets only
Pin activity onto the existing tldraw Canvas.

**Pros**: No new route.
**Cons**: Canvas is a user-composed board; this graph is derived and computer-scoped. Layout would fight user-placed cards. Rejected as the primary surface (Canvas may later host a read-only widget; not v1).

## Key forks

- **Fork 1**: One event vs parallel activity model — **lock Option B**.
- **Fork 2**: Graph root — **Atmos (this Computer)**, not the current workspace. The point is a fleet view across projects.
- **Fork 3**: Hierarchy — **Atmos → Project → Workspace → Agent → Subagent**. Project-level sessions (no workspace `context_id`) hang off the Project. Multiple agents under one workspace are sibling Agent nodes.
- **Fork 4**: Subagents as nodes vs in-card list — **nodes**, folded by default into a count on the parent Agent card. Expanding the parent reveals child nodes and spawn edges.
- **Fork 5**: Card density — **compact by default** (name, state, current tool). History tools, todos, prompt preview live behind in-card expand / selected detail. Do not put every hook field on the collapsed card.
- **Fork 6**: v1 agent set — **Claude Code, Codex, Grok Build, OpenCode, Pi**. Other tools still appear as state-only cards if they have a live session.

## Open questions

- [x] Is this a workspace-scoped center tab or a computer-scoped Launchpad page? **Computer-scoped Launchpad page** (same class as Token Usage / Disk Analyzer).
- [x] Do idle sessions with no activity belong on the graph? **Only while the in-memory session still exists** (same idle / stale sweep as APP-051). Empty projects with zero sessions are omitted.
- [ ] Footer popover: show current tool line in v1, or wait for the graph? **PRD: yes, cheap win from the same activity model.**
- [ ] Click Agent node: always focus the pane, or only from a button so graph selection stays? **PRD: select expands detail; primary button / double-click focuses the pane.**

## References

- Hook service: `crates/core-service/src/service/agent_hooks.rs` (+ per-tool adapters)
- Hook install: `crates/core-engine/src/agent_hooks/`
- Child lifecycle: `crates/core-service/src/service/agent_hooks/child_lifecycle.rs`
- Client store: `apps/web/src/features/agent/store/agent-hooks-store.ts`
- Related: [APP-058](../APP-058_agent-status-workspace-grouping/PRD.md) (state grouping; unchanged), [APP-014](../APP-014_canvas/PRD.md) (Canvas; not this surface), [APP-064](../APP-064_api-contract-hardening/PRD.md) (typed WS events)
