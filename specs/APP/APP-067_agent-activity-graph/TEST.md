# TEST · APP-067: Agent Observer

> Test Plan · how we verify hook **turns** + retained finished Agents + the Atmos → Project → Workspace → Agent → Subagent graph. References PRD APP-067 and TECH APP-067.

## Test strategy

- **Unit / Rust**: turn open/close, prompt extract, tool aggregation (`repeat`), child nest, idle-sweep **does not** drop activity, explicit clear **does**, adapter fixtures for the five v1 tools, visible-field WS emit, late PostToolUse after idle.
- **Unit / Bun**: graph membership (session ∪ activity-with-turns), parent resolution, sibling agents, unassigned fallback, Agent/turn fold, compact view-model, Computer-switch reset.
- **WS / API**: REST snapshot includes activity whose session row is gone; `agent_activity_updated` / `cleared` catalog types (APP-064).
- **E2E (Playwright)**: Launchpad exposes Agent Observer; empty state on a connected Computer; `e2e/tests/specs/APP-067_agent-activity-graph.e2e.ts`.
- **Exploratory agent-browser**: compact vs expanded turns, collapse project, idle node stays, permission color, no horizontal overflow at 1280 and a narrow desktop width (~390 window, not a mobile product claim).
- **Manual-only**: live Claude Code two-prompt conversation + TodoWrite + child spawn; OpenCode tool.execute after v5 plugin; Grok permission notification.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2, S3, S4, S12, S23, S24, S25 |
| M2 | S5, S6, S7, S8, S9, S26, S30 |
| M3 | S10 |
| M4 | S11, S13, S14, S27 |
| M5 | S15, S16, S28 |
| M6 | S17 |
| M7 | S18, S19 |
| M8 | S20 |
| M9 | S10 |
| M10 | S21, S22, S29 |
| N1–N5 | deferred |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Rust | `cargo test` | Pre then Post tool on open turn | Claude PreToolUse then PostToolUse | `current_tool` pending then tools on current turn + current null | planned |
| S2 | Rust | `cargo test` | consecutive same-name tools | 3× Bash within 8s | one slot, `repeat === 3` | planned |
| S3 | Rust | `cargo test` | TodoWrite replace | todos array | session `todos` + current turn snapshot replaced | planned |
| S4 | Rust | `cargo test` | child start/stop | SubagentStart + child Pre + SubagentStop | live `children`; after stop child gone; `spawned_child_ids` remains on turn | planned |
| S5 | Rust | `cargo test` | Claude fixture | `fixtures/claude_code/*.json` including UserPromptSubmit **with prompt** | turn prompt + tools + child | planned |
| S6 | Rust | `cargo test` | Codex fixture | stdin Pre/Post + prompt | tools + turn prompt; children empty | planned |
| S7 | Rust | `cargo test` | Grok aliases | `pre_tool_use`, `user_prompt_submit` | same fold as Claude for tools/prompt | planned |
| S8 | Rust | `cargo test` | OpenCode `chat.message` + `tool.execute.*` | vendor `output.parts` + `input.tool`/`output.args` | turn prompt + tool line | planned |
| S9 | Rust | `cargo test` | Pi before_agent_start then agent_start | vendor sequence, prompt on before_agent_start only | one turn with prompt; AgentStart does not append | planned |
| S10 | Bun + E2E | `bun test` / Playwright | launchpad id + `/agent-observer` | connected Computer, no members | item `agent-observer`; empty-state copy; no blank xyflow | planned |
| S11 | Bun | `bun test` | `buildActivityGraph` | 1 project, 2 workspaces, 2 agents | root→project→ws→agents | planned |
| S12 | Rust | `cargo test` | idle sweep vs activity | idle row older than TTL, activity has turns | session gone; activity **present**; no cleared event | planned |
| S13 | Bun | `bun test` | two agents same workspace | two session ids | two sibling agent nodes | planned |
| S14 | Bun | `bun test` | missing catalog | session path unknown | parent `project:unassigned` | planned |
| S15 | Bun | `bun test` | collapse workspace | collapsedIds has ws | agent nodes omitted | planned |
| S16 | Bun | `bun test` | expand agent children | default vs expandedAgentIds | child nodes only when Agent expanded | planned |
| S17 | Bun | `bun test` | compact card data | activity with 2 turns, todos, current tool | collapsed: one line + turn count; no turn rows | planned |
| S18 | Rust | `cargo test` | no emit if unchanged | duplicate PostToolUse | no second broadcast | planned |
| S19 | Bun | `bun test` | patch current_tool | same sessions | node id set stable | planned |
| S20 | Bun | `bun test` | navigate helper | existing nav tests | pane target unchanged; child uses lead | planned |
| S21 | Rust + Bun | tests | state notification shape | existing APP-058 tests | still pass; no new required fields | planned |
| S22 | Rust | `cargo test` | late PostToolUse after idle | suppress window | state stays idle; `current_tool` cleared; last turn may gain the finish | planned |
| S23 | Rust | `cargo test` | second prompt | turn 1 idle then UserPromptSubmit | `turns.length === 2`; turn 1 prompt intact | planned |
| S24 | Rust | `cargo test` | Stop keeps activity | TerminalIdle | `ended_at` set; record remains | planned |
| S25 | Rust | `cargo test` | explicit clear vs sweep | Clear idle vs `clear_idle_older_than` | Clear idle emits `cleared`; sweep does not | planned |
| S26 | Rust | `cargo test` | v4 empty UserPromptSubmit | fixed-body `{hook_event_name}` | turn opens with `prompt === ""`; HTTP ok | planned |
| S27 | Bun | `bun test` | membership union | activity with turns, session row missing | Agent node still present, `last_state` idle | planned |
| S28 | Bun | `bun test` | in-node turn fold | 10 turns, Agent expanded, no turn expanded | 8 rows + “+N earlier”; expand one turn shows tools | planned |
| S29 | Bun | `bun test` | Computer switch | resetForConnectionChange | activity map empty until rehydrate | planned |
| S30 | Rust | `cargo test` | v5 install templates | generated Claude/Codex/OpenCode/Pi/Grok hook text | UserPromptSubmit stdin or extras; Codex PreToolUse not Bash-only; OpenCode `chat.message` + `tool.execute` hooks; Pi `before_agent_start` prompt | planned |

## Scenarios

### S1 — Pending then complete tool

- **Given**: a Claude session already Running with an open turn.
- **When**: PreToolUse `{tool_name: "Edit", tool_input: {file_path: "/repo/a.ts"}}` then PostToolUse same id.
- **Then**: after Pre, `current_tool.state === pending` and detail is relative `a.ts` if cwd is `/repo`. After Post, `current_tool` is null and the current turn’s last tool is `ok` with `repeat === 1`.
- **Signals**: activity struct fields.

### S2 — Aggregate consecutive tools

- **Given**: three PostToolUse `Bash` 1s apart on the same turn.
- **When**: fold.
- **Then**: that turn’s `tools` length is 1, `name` Bash, `repeat === 3`.
- **Signals**: `tools[0].repeat`.

### S3 — Todos replaced

- **Given**: existing todos on the session and current turn.
- **When**: PostToolUse TodoWrite with a new array.
- **Then**: session `todos` and the current turn’s `todos` are the new list.
- **Signals**: todos contents.

### S4 — Child lifecycle

- **Given**: lead session with an open turn.
- **When**: SubagentStart `agent_id=c1`, child PreToolUse, SubagentStop.
- **Then**: during run, `children` contains `c1` with pending/current tool; after stop, `c1` is absent from `children` but present in the turn’s `spawned_child_ids`. Lead state still follows existing child_lifecycle (does not Idle while child active).
- **Signals**: children array; spawned_child_ids; lead state.

### S5–S9 — Per-tool fixtures

- **Given**: committed JSON payloads per adapter (v5-shaped, plus one v4 empty-body case in S26).
- **When**: `handle_event`.
- **Then**: fidelity matches PRD M2; missing features are empty arrays / `""` / null, not errors.
- **Signals**: activity + session.state.

### S10 — Launchpad + empty graph

- **Given**: connected Computer, no graph members.
- **When**: open Agent Observer.
- **Then**: Launchpad item visible; page shows Atmos root and empty-state copy, not a blank xyflow pane; copy is not the disconnected-Computer state.
- **Signals**: heading + empty copy; no console errors.
- **E2E path**: `e2e/tests/specs/APP-067_agent-activity-graph.e2e.ts` via `just test-e2e -- tests/specs/APP-067_agent-activity-graph.e2e.ts`.

### S11 / S13 / S14 — Topology

- **Given**: catalog + sessions as in the table.
- **When**: `buildActivityGraph`.
- **Then**: ids and parent edges match M4; two agents under one workspace are siblings; unknown bind → `project:unassigned`.
- **Signals**: node ids, edge pairs.

### S12 / S24 / S25 — Retention vs clear

- **Given**: idle session with one closed turn, timestamp older than idle TTL.
- **When**: `clear_idle_older_than`.
- **Then**: session row gone; activity still GET-able; no `agent_activity_cleared`.
- **And**: Footer Clear idle / `clear_idle_sessions` **does** drop activity and emit cleared.
- **And**: Stop/Idle closes the turn (`ended_at`) without deleting the record.
- **Signals**: maps + WS event presence/absence.

### S15 / S16 / S28 — Folding

- **Given**: graph with workspace agents, one agent with children, one agent with 10 turns.
- **When**: collapse workspace; expand agent; expand one turn.
- **Then**: collapsed workspace omits descendants; default agent hides child nodes and turn rows; expand agent shows last 8 turn headers + overflow and child nodes; expand a turn shows that turn’s tools.
- **Signals**: node id sets; view-model turn rows.

### S17 — Compact vs expanded data

- **Given**: activity with current tool, 2 turns, 7 todos.
- **When**: collapsed view model is built.
- **Then**: one tool or prompt line; turn count visible; todos as `n/m`; no seven todo rows; expanded node lists ≤5 todos + overflow.
- **Signals**: view-model fields.

### S18 / S19 — Live updates without relayout churn

- **Given**: hydrated graph.
- **When**: `current_tool` changes; separately, a new session appears.
- **Then**: tool change keeps node ids; new session adds a node id. Duplicate fold does not emit WS.
- **Signals**: id set diff; emit count.

### S20 — Open pane

- **Given**: session with pane_id; child node selected.
- **When**: Open pane.
- **Then**: same target as today’s footer session click (`navigateToAgentHookSessionPane`); child uses the lead session.
- **Signals**: context_id + tmux window / side_chat_id.

### S21 — APP-058 / footer state untouched

- **Given**: existing grouping and footer tests.
- **When**: activity fields exist on the service.
- **Then**: `agent_hook_state_changed` payload still matches `AgentHookStateNotification` without required new fields; grouping tests pass; footer popover still opens the list (does not route to `/agent-observer` on count click).
- **Signals**: type + tests green.

### S22 — Idle suppress vs activity

- **Given**: TerminalIdle then a PostToolUse 1s later.
- **When**: fold.
- **Then**: state remains idle (existing suppress); `current_tool` does not force Running; pending line is not shown on an idle card.
- **Signals**: state + current_tool.

### S23 — Second prompt is a new turn

- **Given**: turn 1 closed after Stop, prompt `"fix the footer"`.
- **When**: UserPromptSubmit `"also add tests"` on the same session_id.
- **Then**: `turns.length === 2`; turn 1 prompt unchanged; turn 2 is current and running.
- **Signals**: turns array.

### S26 — v4 empty prompt body

- **Given**: Claude v4 fixed-body `UserPromptSubmit`.
- **When**: fold.
- **Then**: a turn still opens; `prompt === ""`; hook HTTP remains `{ ok: true }`.
- **Signals**: prompt string; handler success.

### S27 — Graph membership without session row

- **Given**: activity with turns; session map empty (swept or client-dismissed).
- **When**: `buildActivityGraph`.
- **Then**: Agent node exists under the activity bind fields; state badge uses `last_state`.
- **Signals**: node present.

### S29 — Computer switch

- **Given**: activity hydrated for Computer A.
- **When**: `resetForConnectionChange`.
- **Then**: activity map is empty until REST hydrate for Computer B; no A nodes remain.
- **Signals**: store size.

### S30 — v5 install actually forwards activity fields

- **Given**: hook install templates after `CURRENT_HOOK_VERSION = 5`.
- **When**: generate commands / plugin source.
- **Then**: Claude `UserPromptSubmit` is stdin-forward (`cat | curl` / `-d @-`), not a fixed `hook_event_name` body. Codex PreToolUse is not matcher-limited to Bash. OpenCode plugin registers `chat.message` and POSTs `tool.execute.before/after` with `input`/`output`. Pi POSTs `event.prompt` from `before_agent_start` and posts `agent_start` with no prompt extra. Grok still stdin-forwards prompt; Subagent entries exist if registered.
- **Signals**: substring assertions on generated install text.

## Exploratory agent-browser checks

Load Agent Browser instructions before running (`agent-browser` skill, or `agent-browser skills get core --full`). If unavailable, record `not_run` per `specs/references/agent-browser-setup.md`.

- Compact cards: one tool or prompt line, no wrap explosion at 1280×800.
- Idle Agent with turns still visible after the footer idle list is empty.
- Expand an Agent: foldable turns; expand one turn’s chips; graph relayouts once, not on every tick.
- Collapse a Project: children hide; Relayout recenters remaining.
- Permission badge readable in light and dark.
- Narrow desktop ~390: graph pan/zoom works, Launchpad still opens the page, no horizontal **page** scroll. Open pane in the detail panel ≥ 44px.

## Regression checklist

- Hook HTTP still returns success on unknown events and v4 empty bodies.
- Idle / stale session **jobs** still clear **session rows**; they do not emit `agent_activity_cleared`.
- Footer counts still follow session state, not turn count or child count.
- Pane-focus `dismissIdleSessionsForPane` still drops idle **session** rows; activity store unchanged.
- Canvas, Token Usage, Disk Analyzer, Launchpad **Agents** (manager) unchanged.
- GitHub Actions React Flow page still loads stylesheet (no global CSS regression).
- `CURRENT_HOOK_VERSION` bump does not break `sync_installed_hooks` opt-out.

## Acceptance criteria

- v1 tools produce turns/tools for the fields in M2 after the v5 install; other tools can sit on the graph as state-only cards while their session row exists.
- A Stop/Idle does not remove the Agent node; a second prompt appends a turn.
- Time-based idle sweep does not delete activity; explicit Clear idle / remove / pane destroy does.
- Graph root is the connected Computer; branching is Project → Workspace → Agent → Subagent; multiple agents per workspace work.
- Collapsed UI is scannable; turns and children are behind Agent expand; full history is in the detail panel.
- Existing hook state consumers do not require activity fields.
- Empty graph is an intentional empty state, not a blank pane.

## Performance & load budgets

- Visible-field equality: a no-op duplicate PostToolUse emits **zero** extra WS notifications.
- Tool tick on an existing node does not recompute dagre (node id set unchanged).
- `TURNS_MAX = 50` drop oldest; `turns_omitted` increments; process stays in-memory only.

## Manual verification steps

1. Claude Code in a workspace pane: one prompt that uses Edit + Bash, wait until Idle, open Agent Observer — node present with that prompt. Second prompt — two turns.
2. Confirm footer popover still lists sessions and does not navigate on count click; use “Open Agent Observer” / Launchpad.
3. OpenCode after API restart (v5 plugin): a tool.execute pair appears as a tool line.
4. Quit the API process: graph empty after reconnect (no SQLite). Restart API + new hook events refill it.

## Non-coverage

- Real vendor CLI binaries in CI.
- Replay / transcript parsers.
- Remote Computer **picker** (Relay as the connected Computer is in scope for hydrate/reset, not APP-063 All computers).
- Permission approve from the graph.
- N1–N5.

## Coverage Status

Not run. Fill after implementation with exact `cargo test` / `bun test` / `just test-e2e` commands and remaining gaps.
