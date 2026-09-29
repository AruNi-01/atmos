# Brainstorm · APP-067: Agent Observer

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos already installs per-tool hooks and tracks live Agent **state** (`idle` / `running` / `permission_request`) per session, bound to `context_id` / `pane_id`. Sidebar grouping (APP-058) and the footer overview can tell the user *which* panes are busy. They cannot tell the user *what* those Agents are doing, or *what they already did*.

A session is a multi-turn conversation in one terminal pane. Today the product treats Idle as “throw away the row”: time-based sweep (~30 min), and the client even drops idle rows when the user focuses the pane. That is correct for **attention chrome**. It is wrong for a **fact graph** of the Computer: after an Agent stops, the next prompt is still the same Agent, and the previous prompts / tools must still be on the node.

The hook HTTP handlers already receive some of that payload (`PreToolUse` / `PostToolUse` / `SubagentStart` / `ToolCall` / `tool.execute.before`, …) and fold it down to a state enum. Child ids already live in `active_children`. The UI never sees children, tools, or prompts. Several v1 tools also **never send** those fields (fixed-body curl / plugin coalescing) — an adapter-only fold would show empty cards.

Users run many terminals across many projects and worktrees. There is no single surface that shows the whole Computer as a graph.

## Goals (draft)

- Primary: a computer-scoped **fact graph** (Atmos → Project → Workspace → Agent → Subagent) of every Agent that has run on this Computer’s open panes, not only the ones currently spinning.
- Primary: fold hook payloads into a live **activity** model whose unit of history is a **turn** (prompt submit → tools → idle). Keep every turn on the Agent node. Do not change the existing state machine used by sidebar / footer / attention.
- Secondary: Agent nodes compact by default and **foldable** — expand to see turns and child nodes.
- Non-goal: replace Canvas, replace the footer popover, parse vendor session transcripts, persist to SQLite, or invent a second hook install path.

## Current hook surface (audit)

Live session row today (`AgentHookSession`):

| Field | Role |
|-------|------|
| `session_id`, `tool`, `state`, `timestamp` | Identity + coarse lifecycle |
| `project_path`, `context_id` | Bind to project or workspace |
| `pane_id`, `terminal_kind`, `side_chat_id`, `source_pane_id` | Navigate back to the pane |
| `hook_version` | Install freshness |

States stay `idle` / `running` / `permission_request`. Sticky attention (`permission_request`, `task_complete`) is unchanged.

Two different things were mixed in the first draft: **what the adapter can parse** vs **what the installed hook actually POSTs**.

| Tool | Adapter can parse | Installed command today (v4) | Gap for activity / turns |
|------|-------------------|------------------------------|---------------------------|
| Claude Code | Pre/PostToolUse, Subagent*, Permission, TodoWrite, UserPromptSubmit | Tool + child + permission are stdin-forward. **`UserPromptSubmit` is fixed-body** (`hook_event_name` only) | Prompt text missing until install bump |
| Grok Build | Same family + name aliases | Stdin-forward including UserPromptSubmit. **No SubagentStart/Stop registered** | Children empty unless install adds those events |
| Codex | Pre/Post + UserPromptSubmit as state | **All fixed-body.** PreToolUse matcher is **Bash only**. No PostToolUse hook | No tool name, no prompt, almost no tools |
| OpenCode | `tool.execute.before/after`, permission.* | Plugin **swallows** tool.execute into occasional `agent.running` | No tool events on the wire |
| Pi | ToolCall / ToolResult, AgentStart | Posts tool **name** only; AgentStart has **no prompt extra** | Detail + prompt missing unless extras added |

Other installed tools (Cursor, Gemini, …) keep updating **state**. They can sit on the graph as state-only cards while the session row exists; they do not get a turn list until an adapter + install exists.

## Options

### Option A — Extend `agent_hook_state_changed` with activity fields
Put `current_tool`, `turns`, `children` on the existing notification.

**Pros**: One WS event.
**Cons**: Footer and sidebar re-render on every tool tick. Event size grows. APP-058 grouping does not need these fields.
**Rejected.**

### Option B — Parallel activity model + dedicated WS event
Keep `AgentHookSession` / `agent_hook_state_changed` as the coarse lifecycle. Add an in-memory activity record per session (turns + live children) and push `agent_activity_updated`. Graph subscribes; footer popover may opt in for one current-tool / latest-prompt line.

**Pros**: Existing surfaces stay cheap. Matches “enhance hooks, don't replace them.”
**Cons**: Two stores on the client.
**Lock.**

### Option C — Per-workspace Canvas widgets only
Pin activity onto the existing tldraw Canvas.

**Pros**: No new route.
**Cons**: Canvas is a user-composed board; this graph is derived and computer-scoped. Rejected as the primary surface (Canvas may later host a read-only widget; not v1).

### Option D — Drop activity when the session goes Idle (first draft)
Reuse APP-051 idle sweep as the activity TTL.

**Pros**: Small memory.
**Cons**: A finished turn is exactly when the user wants to read the graph and send the next prompt. Client `dismissIdleSessionsForPane` would also wipe history when they look at the pane.
**Rejected.** Activity lifetime is **not** the idle sweep.

## Key forks

- **Fork 1**: One event vs parallel activity model — **lock Option B**.
- **Fork 2**: Graph root — **the connected workbench Computer** (local or Relay). Not “this laptop regardless of connection,” and not Token Usage’s All-computers picker.
- **Fork 3**: Hierarchy — **Atmos → Project → Workspace → Agent → Subagent**. Project-level sessions hang off the Project. Multiple agents under one workspace are siblings.
- **Fork 4**: Subagents as nodes vs in-card list — **nodes**, hidden while the parent Agent is collapsed.
- **Fork 5**: History unit — **turns**, not a single `prompt_preview` + `recent_tools` ring. `UserPromptSubmit` / equivalent opens a turn with the submitted text; tools attach to that turn; Idle/Stop closes it. The next prompt appends a new turn on the same Agent node.
- **Fork 6**: Finished sessions on the graph — **keep**. Time-based idle sweep and pane-focus dismiss still apply to the **state** map (footer / APP-058). They must **not** delete activity/turns. Drop activity only on pane destroy, explicit remove / Clear idle, tool takeover, or API process restart.
- **Fork 7**: Card density — **compact by default**. Expanding the Agent node reveals (1) turn rows inside the node, each row foldable, and (2) Subagent nodes on the graph. Selected node also fills a right detail panel for the full turn list.
- **Fork 8**: v1 agent set — **Claude Code, Codex, Grok Build, OpenCode, Pi**, with **hook-install upgrades** so prompt + tool payloads actually arrive. Other tools: state-only cards while the session row exists.
- **Fork 9**: Footer running-count vs graph — **keep the footer popover**. Launchpad **Agent Observer** is the board. Popover may show current tool / latest prompt from activity. Do not replace the session list with a route change.

## Open questions

- [x] Workspace-scoped center tab vs computer-scoped Launchpad page? **Computer-scoped Launchpad page** (same class as Token Usage / Disk Analyzer).
- [x] Do idle sessions belong on the graph? **Yes, if they have turns (or are still live).** Empty projects with zero graph members are omitted.
- [x] Footer popover: current tool line in v1? **Yes, one line from activity; popover itself stays.**
- [x] Click Agent node: always focus the pane? **Select fills detail; primary button / double-click focuses the pane.**
- [x] In-card turns vs right panel only? **Both: foldable turns in the expanded Agent node (last 8); full list in the right panel.**
- [x] Persist to SQLite so turns survive API restart? **No in v1.** Browser refresh hydrates via REST. Process restart is empty.

## References

- Hook service: `crates/core-service/src/service/agent_hooks.rs` (+ per-tool adapters)
- Hook install: `crates/core-engine/src/agent_hooks/` (`CURRENT_HOOK_VERSION` is global)
- Child lifecycle: `crates/core-service/src/service/agent_hooks/child_lifecycle.rs`
- Client store: `apps/web/src/features/agent/store/agent-hooks-store.ts` (`dismissIdleSessionsForPane`, `resetForConnectionChange`)
- Related: [APP-058](../APP-058_agent-status-workspace-grouping/PRD.md) (state grouping; unchanged), [APP-014](../APP-014_canvas/PRD.md) (Canvas; not this surface), [APP-051](../APP-051_infra-jobs/PRD.md) (idle job still runs; must not wipe turns), [APP-064](../APP-064_api-contract-hardening/PRD.md) (typed WS events), [APP-063](../APP-063_token-usage-computer-scope/PRD.md) (Computer picker is **not** copied)

## Ready to promote

- Promote to PRD: fact graph; turn-based history; keep finished Agents; foldable Agent nodes; honest v1 fidelity + install bumps; footer popover stays.
- Promote to TECH: activity lifetime decoupled from idle sweep; `AgentTurn` wire type; hook v5 install diffs; visible-field WS equality; Launchpad shell checklist; `@dagrejs/dagre`.
