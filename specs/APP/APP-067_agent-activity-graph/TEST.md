# TEST · APP-067: Agent Activity Graph

> Test Plan · how we verify hook activity fold + the Atmos → Project → Workspace → Agent → Subagent graph. References PRD APP-067 and TECH APP-067.

## Test strategy

- **Unit / Rust**: activity extractors, aggregation, child nest, idle sweep drop, adapter fixtures for the five v1 tools, equality-gated WS emit.
- **Unit / Bun**: graph projection (parent resolution, sibling agents, fold/expand, unassigned fallback), tool-line formatting, todo cap.
- **WS / API**: REST snapshot shape; `agent_activity_updated` / `cleared` catalog types (APP-064 style).
- **E2E (Playwright)**: Launchpad exposes Agent Graph; empty state renders on a connected computer.
- **Exploratory agent-browser**: card compact vs expanded, collapse project branch, permission color, no horizontal overflow at 1280 and 390.
- **Manual-only**: live Claude Code child spawn + TodoWrite; OpenCode tool.execute; Grok Build permission notification (real agents).

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2, S3, S4, S12 |
| M2 | S5, S6, S7, S8, S9 |
| M3 | S10 |
| M4 | S11, S13, S14 |
| M5 | S15, S16 |
| M6 | S17 |
| M7 | S18, S19 |
| M8 | S20 |
| M9 | S10 (copy keys) |
| M10 | S21, S22 |
| N1–N5 | deferred |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Rust | `cargo test` | `fold_activity` Pre/Post tool | Claude PreToolUse then PostToolUse | `current_tool` pending then recent_tools + current null | planned |
| S2 | Rust | `cargo test` | consecutive same-name tools | 3× Bash within 8s | one recent slot, UI count 3 | planned |
| S3 | Rust | `cargo test` | TodoWrite replace | todos array | `todos` replaced wholesale | planned |
| S4 | Rust | `cargo test` | child start/stop | SubagentStart + child PreToolUse + SubagentStop | child in `children`; removed after stop | planned |
| S5 | Rust | `cargo test` | Claude adapter fixture | `fixtures/claude_code/*.json` | tools + child + prompt | planned |
| S6 | Rust | `cargo test` | Codex adapter fixture | Pre/Post only | tools; children empty | planned |
| S7 | Rust | `cargo test` | Grok aliases | `pre_tool_use`, `subagent_start` | same fold as Claude | planned |
| S8 | Rust | `cargo test` | OpenCode `tool.execute.*` | before/after + permission.asked | tool line + state permission | planned |
| S9 | Rust | `cargo test` | Pi ToolCall/ToolResult | pair | pending then recent | planned |
| S10 | Bun + E2E | `bun test` / Playwright | launchpad id + `/agent-graph` | none | item `agent-graph`; page empty state | planned |
| S11 | Bun | `bun test` | `buildActivityGraph` | 1 project, 2 workspaces, 2 agents | root→project→ws→agents | planned |
| S12 | Rust | `cargo test` | idle sweep | session dropped | activity gone; cleared event ids | planned |
| S13 | Bun | `bun test` | two agents same workspace | two session ids | two sibling agent nodes | planned |
| S14 | Bun | `bun test` | missing catalog | session path unknown | parent `project:unassigned` | planned |
| S15 | Bun | `bun test` | collapse workspace | collapsedIds has ws | agent nodes omitted | planned |
| S16 | Bun | `bun test` | expand agent children | collapsed default vs expanded | child nodes appear only when expanded | planned |
| S17 | Bun | `bun test` | compact card data | activity with todos + recent | collapsed flags: tool line yes, todos only `n/m` | planned |
| S18 | Rust | `cargo test` | no emit if unchanged | duplicate PostToolUse | no second broadcast | planned |
| S19 | Bun | `bun test` | patch current_tool does not change node ids | same sessions | node id set stable | planned |
| S20 | Bun | `bun test` | navigate helper still keyed by session | existing nav tests | pane target unchanged | planned |
| S21 | Rust + Bun | tests | state notification shape | existing APP-058 tests | still pass; no new fields required | planned |
| S22 | Rust | `cargo test` | late PostToolUse after idle | suppress window | state stays idle; current_tool cleared | planned |

## Scenarios

### S1 — Pending then complete tool

- **Given**: a Claude session already Running.
- **When**: PreToolUse `{tool_name: "Edit", tool_input: {file_path: "/repo/a.ts"}}` then PostToolUse same id.
- **Then**: after Pre, `current_tool.state === pending` and detail is relative `a.ts` if cwd is `/repo`. After Post, `current_tool` is null and `recent_tools[0].state === ok`.
- **Signals**: activity struct fields.

### S2 — Aggregate consecutive tools

- **Given**: three PostToolUse `Bash` 1s apart.
- **When**: fold.
- **Then**: `recent_tools` length 1 with name Bash (count is a UI concern; store may keep `repeat` or let UI count — pick one in impl and assert it).
- **Signals**: recent_tools length and name.

### S3 — Todos replaced

- **Given**: existing todos on the session.
- **When**: PostToolUse TodoWrite with a new array.
- **Then**: previous todos are gone; new list is stored.
- **Signals**: todos contents.

### S4 — Child lifecycle

- **Given**: lead session.
- **When**: SubagentStart `agent_id=c1`, child PreToolUse, SubagentStop.
- **Then**: during run, `children` contains `c1` with pending/current tool; after stop, `c1` absent. Lead state still follows existing child_lifecycle (does not Idle while child active).
- **Signals**: children array; lead state.

### S5–S9 — Per-tool fixtures

- **Given**: committed JSON payloads per adapter.
- **When**: `handle_event`.
- **Then**: fidelity matches PRD M2 table; missing features are empty arrays/null, not errors.
- **Signals**: activity + session.state.

### S10 — Launchpad + empty graph

- **Given**: connected computer, no live sessions.
- **When**: open Agent Graph.
- **Then**: Launchpad item visible; page shows Atmos root and empty-state copy, not a blank xyflow pane.
- **Signals**: heading + empty copy; no console errors.

### S11 / S13 / S14 — Topology

- **Given**: catalog + sessions as in the table.
- **When**: `buildActivityGraph`.
- **Then**: ids and parent edges match M4; two agents under one workspace are siblings; unknown bind → `project:unassigned`.
- **Signals**: node ids, edge pairs.

### S15 / S16 — Folding

- **Given**: graph with workspace agents and one agent that has children.
- **When**: collapse workspace; expand agent.
- **Then**: collapsed workspace omits descendants; default agent hides child nodes; expand adds `child:{session}:{id}` and a spawn edge.
- **Signals**: node id sets.

### S17 — Compact vs expanded data

- **Given**: activity with current tool, 6 recent, 7 todos.
- **When**: collapsed view model is built.
- **Then**: current tool line present; todos shown as `3/7` style summary not seven rows; expanded view lists ≤5 todos + overflow.
- **Signals**: view-model fields.

### S18 / S19 — Live updates without relayout churn

- **Given**: hydrated graph.
- **When**: current_tool changes; separately, a new session appears.
- **Then**: tool change keeps node ids/positions contract (projection returns same structural ids); new session adds a node id.
- **Signals**: id set diff.

### S20 — Open pane

- **Given**: session with pane_id.
- **When**: Open pane action.
- **Then**: same target as today's footer session click (`navigateToAgentHookSessionPane`).
- **Signals**: context_id + tmux window / side_chat_id.

### S21 — APP-058 / footer state untouched

- **Given**: existing grouping and footer tests.
- **When**: activity fields exist on the service.
- **Then**: `agent_hook_state_changed` payload still matches `AgentHookStateNotification` without required new fields; grouping tests pass.
- **Signals**: type + tests green.

### S22 — Idle suppress vs activity

- **Given**: TerminalIdle then a PostToolUse 1s later.
- **When**: fold.
- **Then**: state remains idle (existing suppress); `current_tool` does not force Running; pending line is not shown on an idle card.
- **Signals**: state + current_tool.

## Exploratory agent-browser checks

- Compact cards: one tool line, no wrap explosion at 1280×800.
- Expand an Agent: todos + recent chips; graph does not jump the viewport wildly.
- Collapse a Project: children hide; Relayout recenters remaining.
- Permission badge readable in light and dark.
- Mobile 390: graph usable (pan/zoom), Launchpad still opens the page, no horizontal page scroll. Tap targets on Open pane ≥ 44px in the detail panel.

## Regression checklist

- Hook HTTP still returns success on unknown events.
- Idle / stale session jobs still clear sessions.
- Footer counts match session state, not child count.
- Canvas, Token Usage, Disk Analyzer Launchpad items unchanged.
- GitHub Actions React Flow page still loads stylesheet (no global CSS regression).

## Acceptance criteria

- v1 tools produce activity for the fields in M2; other tools can sit on the graph as state-only cards.
- Graph root is Atmos; branching is Project → Workspace → Agent → Subagent; multiple agents per workspace work.
- Collapsed UI is scannable; details are behind expand / selection.
- Existing hook state consumers do not require activity fields.
- Empty graph is an intentional empty state, not a blank pane.

## Non-coverage

- Real vendor CLI binaries in CI.
- Replay / transcript parsers.
- Remote Computers / relay fleet.
- Permission approve from the graph.
- N1–N5.

## Coverage Status

Not run. Fill after implementation with exact `cargo test` / `bun test` / `just test-e2e` commands and remaining gaps.
