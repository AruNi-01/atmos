# Brainstorm · APP-048: Loop / Graph Agent Orchestration

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.
>
> **Note (post multi-agent review):** PRD/TECH/TEST were hardened for auto-topology, Spec integrity, join completeness, mid-flight budgets, role+status chrome, and Phase-1 Graph bar. Prefer those files as source of truth over older option text when conflicted.

## Context

Atmos already has a strong **Harness**: tmux-backed terminals, terminal code agents (Claude Code, Codex, OpenCode, …), canvas as a diagram + widget surface (`canvas-terminal`, product widgets), `atmos canvas` CLI + skills (APP-015), and thin scheduled runs via Automations (APP-017). What is missing is a first-class way to run **evidence-driven multi-step agent work** on that harness—either as a **Loop** (feedback cycle) or a **Graph** (explicit control flow with branch/parallel/HITL)—with a smart **orchestrator** that can choose mode from the task (or accept a user override), and with a separate agent that **writes the completion criteria** before anyone claims “done.”

Trigger: product desire to add Loop Agent / Graph Agent capabilities on Canvas, informed by vault notes on Harness / Loop / Graph / Foundation Engineering (setpoint, sensors, maker/checker). Deep research confirmed industry patterns (ReAct loops, LangGraph-style graphs, routing) and Atmos boundaries (terminal agents preferred over ACP for execution; no general workflow platform yet).

**Who feels it**: Agentic Builders running multi-step coding work in Atmos who today either babysit a single terminal agent, hack multi-agent structure by hand on canvas, or use Automations for single non-interactive shots.

**Current workarounds**: manual multi-pane terminals; side-chat one-shot fork (APP-030); canvas diagrams that are structural only (arrows are not executable); Automations for scheduled single runs; ad-hoc “keep going until it looks good” without durable acceptance criteria.

**Why it’s hard**: Loop without independent judgment becomes a blind self-congratulating cycle; Graph without real dependencies is ceremony; pure keyword routing is dumb; pure freestyle “meta agent” without a deterministic runtime is unsafe; ACP vs terminal agent is an easy product fork that Atmos has already answered for code work.

## Goals (draft)

- Make **Loop** and **Graph** peer, first-class orchestration modes—not a “ship Loop first, Graph later” product story.
- Provide an **Orchestrator** that is **intelligent** (LLM/agent) for mode selection and planning, with **user override** (`auto | loop | graph`).
- Make **completion criteria** a first-class artifact: a dedicated **Criteria Agent** authors a **Judgment Spec**; all subsequent verify steps bind to that spec (versioned).
- Keep **execution** on **Terminal Agents** (product line: native terminal code agents, not ACP chat as the worker).
- Keep a **deterministic Orchestration Runtime** for budgets, stop rules, edge execution, evidence gates, and maker≠checker—so intelligence cannot silently rewrite the rules of the game.
- Use **Canvas** as the topology + evidence + run-status surface; extend existing terminal/tmux primitives rather than inventing a second agent bus.
- Align with Automations philosophy: **thin orchestration over terminal agents**, not a second full agent runtime or generic enterprise workflow platform.

## Settled direction (from conversation)

These are product/architecture anchors for PRD/TECH—not open options unless a later PRD deliberately reopens them.

### Layer model

```
Orchestrator Agent          → mode, topology, next step, explain "why"
Criteria Agent              → Judgment Spec (setpoint / "what is correct")
Orchestration Runtime       → enforce budget, stop, edges, evidence, user override
Worker Terminal Agent(s)    → maker: write code / run tools in tmux panes
Checker / Judge             → verdict against Spec only (sensors first, then LLM/human)
Canvas                      → edit topology, run highlight, evidence, Spec card
CLI / Skill                 → agent-facing ops (create-run, tick, attach-evidence, compile-graph)
```

| Role | Intelligent? | Responsibility |
|------|----------------|----------------|
| **Orchestrator Agent** | Yes | Choose `loop` / `graph` / ask user; plan topology; schedule steps; explain decisions |
| **Criteria Agent** | Yes | Author and version **Judgment Spec** from goal + risk; may refine on `criteria_gap` only |
| **Orchestration Runtime** | No (by design) | Run lifecycle, budgets, max iterations, no-progress, executable edges, force user `mode`, refuse complete without Spec/evidence |
| **Worker (Maker)** | Yes | Terminal code agent doing the work; **must not** edit Judgment Spec |
| **Checker / Judge** | Sensors + optional LLM | Evaluate **only** against locked Spec; output pass/fail + criterion ids + evidence paths |
| **Harness** | Existing | Terminal, tmux identity, canvas shapes, CLI bus |

### Loop vs Graph (both ship as peers)

- **Loop**: reusable feedback primitive—find work → dispatch maker → collect evidence → judge vs Spec → record state → decide next (retry / pass / stop / refine criteria). Evidence-driven, **not** confidence-driven.
- **Graph**: explicit state machine—nodes (work) + edges (routing) on shared run state; sequence, branch, fan-out/join, bounded cycles, HITL interrupt/resume. Prefer **diamond** when parallel: fan-out → pure-code reduce → **fresh-context** verify → synthesize.
- **Composition**: a Graph node may embed a Loop; Loop is not “phase 1 product” and Graph “phase 2 product.” Shared contracts (Run, Judgment Spec, Evidence, events) are designed once.
- **Upgrade heuristic is a router signal, not a roadmap**: use Graph only when ≥2 independently workable units with **nameable** dependencies (pass the fake-edge test). Otherwise Loop. User can force either mode.

### Orchestrator is an Agent—not keyword matching

- Reject pure keyword/rules routing as the product brain.
- Also reject “one freestyle meta Terminal Agent owns the entire control plane with no runtime.”
- **Intelligence path**: Terminal Agent roles (`orchestrator`, `criteria`, `verify`) emit **structured JSON artifacts** validated by Runtime. Not `crates/llm` cloud/local API providers.
- Orchestrator **proposes**; Runtime **accepts/rejects** illegal proposals (e.g. complete without Spec, exceed budget, maker self-pass).

### Criteria / Judgment Spec is first-class (Loop’s scarce part)

Aligned with Foundation Engineering vault notes: the scarce skill is defining **what counts as correct** (setpoint), not writing another outer loop shell.

- **Criteria Agent** runs before (or at start of) a run and produces a versioned **Judgment Spec**.
- All verify/check steps bind to `spec_id@version`.
- Spec should prefer **falsification paths** and **evidence paths**, not only positive “looks good” checks.
- **Granularity**: verification must be fine enough for the blast radius of the change; coarse “it runs” acceptance is a known failure mode (blind loop).
- **Judgment sink (cost order)**: deterministic sensors (typecheck, tests, lint, policy cmds) → LLM judge with rubric → human. Never start at human or confidence.
- **Maker ≠ Checker**: independent context for verify (new pane / new session / at least different system role). Fresh context for Graph verify nodes.
- **Who may change Spec**: Criteria Agent (version bump + audit). Maker never. Judge never invents new law—only returns `criteria_gap` if Spec is wrong/too coarse.
- **No Spec → Runtime refuses to mark completed** (and ideally refuses to start multi-step run without draft Spec or explicit user skip policy—decide in PRD).

### Execution: Terminal Agent; not ACP as worker

- **Workers** are terminal-resident code agents (same family as Agent Select / APP-015 / APP-017).
- **Orchestration** is Atmos-owned thin runtime + agent brains above—not ACP session graph execution.
- **ACP** remains a separate surface (APP-004 / chat protocol). Optional future Graph node type `acp-session` is not M1; do not route canvas control through `/ws/agent` for this feature (APP-015 already out of scoped that).
- Product quote anchor (PRD-V1.0): prefer running existing code agents in the terminal over ACP-built process UIs for coding work.

### Canvas and edges

- Today: custom shapes `canvas-terminal`, `canvas-widget`; arrows are structural (`fromId`/`toId`), not executable control flow.
- Product widgets (workspace/files/review/browser/agent-chat) are **not** orchestration nodes—do not overload them.
- Direction: Canvas shows run frame, Spec card, evidence, mode control; Graph mode adds flow nodes + executable edge metadata on bound arrows; decorative unbound arrows lint-warn and stay out of execution.
- Map agent edges to proven tmux primitives where possible: observe=`capture-pane`, inject=`send-keys`, fork=side-chat identity, join=orchestrator reduce/verify—not a fictional live A2A bus. Stable identity: `ATMOS_PANE_ID` (not flaky frontend session ids).

### State machines (do not collapse into one table)

| Layer | States (draft) |
|-------|----------------|
| Terminal agent hook | `idle` · `running` · `permission_request` (do not casually expand) |
| Canvas agent presence | `idle` · `active` |
| **Orchestration run (new)** | `running` → `completed` \| `failed` \| `cancelled` \| `interrupted` |
| Node-level (graph) | `pending` · `running` · `blocked` · `succeeded` · `failed` (etc.) |

Stop reasons must be explainable: `spec_met`, `budget`, `no_progress`, `user_cancel`, `criteria_unsatisfiable`, …

### Explicit anti-patterns (design must forbid)

**Loop**: unbounded retry; maker self-declare done; soft “Ralph” completion; missing objective gates / state / token budget; blind looping on judgment-heavy work (auth, payments, architecture) without human criteria; not reading diffs (understanding debt); confidence-as-exit.

**Graph**: formalize too early (trace before formalize); “verifier” sharing maker context; fake independence (shared files/API races); silent fan-in merge; fan-in context collapse; graphing small/linear/exploratory work that fails the fake-edge test.

**Product**: second generic workflow platform; ACP as default control plane; keyword-only orchestrator; product widgets as flow nodes.

### Mode selection UX

- User can set `mode: auto | loop | graph` per run (hard override beats Orchestrator).
- Auto uses Orchestrator Agent structured decision + lowest-complexity-that-works heuristic.
- Mid-run **full topology swap** (loop run → different graph) is **not** required; prefer HITL interrupt, node-level replan, or **new run** carrying evidence. Decide residual UX in PRD.

## Options

### Option A — Peer Loop + Graph + intelligent Orchestrator + Criteria Agent (leaning)

Ship both modes as peers under one Run contract; Orchestrator Agent chooses or user overrides; Criteria Agent authors Judgment Spec; Runtime enforces; workers are Terminal Agents; Canvas is the ops surface.

**Pros**: matches conversation and vault; smart without blind loops; reuses harness; clear roles.  
**Cons**: larger design surface than “just a while loop in a skill”; needs careful MVP slice of UI.  
**Unknown**: exact M1 UI density (frame+status vs full flow shapes on day one)—implementation slice, not product peer-ness.

### Option B — Terminal meta-agent only (skill-driven, no Runtime)

A single Orchestrator Terminal Agent with skills simulates loop/graph via canvas notes and scripts.

**Pros**: fast to demo; no new backend run object.  
**Cons**: weak enforcement; maker can rewrite criteria; hard to observe budgets/stop; conflicts with Foundation Engineering.  
**Decision lean**: reject as sole architecture; optional as Planner implementation of Orchestrator Agent only.

### Option C — ACP graph runtime

Drive multi-agent work through ACP sessions and `/ws/agent` as the orchestrated mesh.

**Pros**: structured protocol events; tool permissions.  
**Cons**: fights terminal-first product line; APP-015/017 explicitly avoid ACP for terminal/canvas/automation workers; poorer native agent UX for coding CLIs.  
**Decision lean**: out of scope as primary path; optional node type later only.

### Option D — Automations expansion only

Grow APP-017 into multi-step graphs without a canvas-facing Loop/Graph product.

**Pros**: reuses scheduler/artifacts.  
**Cons**: Automations are thin scheduled terminal runs, not interactive multi-agent topology UX; under-serves canvas “see the graph / loop” goal.  
**Decision lean**: share Runtime primitives where useful; keep Automations as a **consumer/trigger** of runs, not the only face of Loop/Graph.

### Option E — Phased “Loop MVP then Graph later” as product messaging

**Pros**: smaller first ship story.  
**Cons**: user explicitly rejected “which first” framing; shared contracts would fork if designed sequentially.  
**Decision lean**: **peer capabilities + shared contracts**; engineering may still slice UI (e.g. Loop UI denser first) without dropping Graph from product definition or schema design.

## Key forks in the road

- **Fork 1 — Orchestrator brain host**: structured `crates/llm` vs Terminal Agent — **resolved in TECH: always Terminal Agent roles** (not user API/local-model LLM providers).
- **Fork 2 — Criteria confirm UX**: always human-confirm Spec vs auto-accept when only deterministic sensors — **decide in PRD** (risk-based default likely).
- **Fork 3 — M1 Canvas density**: run frame + Spec + status only vs full flow ShapeUtils on day one — **decide in PRD** (peer modes ≠ equal UI chrome day one).
- **Fork 4 — Run storage**: SQLite + `~/.atmos/` artifacts like Automations vs canvas-document-local only — **decide in TECH**; prefer durable run objects.
- **Fork 5 — Relation to Automations**: shared Runtime module vs separate services — **decide in TECH**; product surfaces stay distinct.
- **Fork 6 — Skip Spec escape hatch**: power-user “no Spec” mode vs always require Spec — **decide in PRD** (default require Spec).
- **Fork 7 — Mid-run mode change**: forbid vs new-run-only vs limited replan — **lean new-run or replan inside mode**; decide in PRD.

## Open questions

- [ ] Primary entry surface for M1: Canvas toolbar, Management Center, composer, CLI-only, or all? — **PRD**
- [ ] Which built-in terminal agents are eligible as workers / criteria / judge (interactive vs non-interactive flags)? — **PRD / TECH**
- [ ] Judgment Spec schema fields and sensor plugin list for M1 — **TECH**
- [ ] Event channel: extend existing WS vs new orchestration WS topic — **TECH** (WebSocket-first)
- [ ] How Orchestrator Agent credentials/model are chosen (user’s terminal agent vs Atmos-managed LLM) — **PRD / TECH**
- [ ] Multi-workspace / multi-computer runs — likely out of M1; confirm — **PRD**
- [ ] Whether document scripts (`atmos canvas` exec) host any loop simulation or stay orthogonal — **TECH**
- [ ] i18n surfaces for Spec card / mode picker copy — **PRD** (follow app i18n rules)
- [ ] Exact fake-edge linter rules and when compile-graph fails closed — **TECH**

## References

### Related Atmos specs / code

- [APP-014 Canvas](../APP-014_canvas/) — board baseline
- [APP-015 Canvas Terminal Agent Integration](../APP-015_canvas-terminal-agent-integration/) — CLI → API → browser bus; terminal agents, not ACP
- [APP-017 Atmos Automations](../APP-017_atmos-automations/) — thin terminal-agent orchestration; non-interactive runs
- [APP-030 Terminal Side Chat](../APP-030_terminal-side-chat/) — one-shot fork / identity metadata
- [APP-002 Terminal Multiplexing](../APP-002_terminal-multiplexing/) — tmux session model
- [APP-004 Local Agent Integration ACP](../APP-004_local-agent-integration-acp/) — orthogonal ACP lane
- Canvas shapes: `apps/web/src/features/canvas/` (`canvas-terminal`, `canvas-widget`, arrow bindings, agent bus)
- Terminal identity: `crates/core-service` / `crates/core-engine` tmux (`ATMOS_PANE_ID`, capture/send)
- Skills: `skills/atmos-canvas-agent/`
- Terminal agents manifest: `resources/terminal-agents/`

### Vault / methodology (external to repo)

- Harness / Loop / Graph layering (clippings under Obsidian vault `_Clippings/`)
- Foundation Engineering (Loop): setpoint, sensor, maker/checker, evidence path, granularity, judgment sink
- Graph Engineering: diamond topology, fake-edge test, formalize after trace

### Industry patterns (background)

- ReAct tool loops; LangGraph nodes/edges/state; Anthropic workflow vs agent; Google ADK LoopAgent; Azure lowest-complexity orchestration ladder

## Ready to promote

### Promote to PRD

- Peer product modes: **Loop** and **Graph**, plus **auto** routing and **user mode override**
- Role model: Orchestrator Agent, Criteria Agent, Runtime, Worker Terminal Agent, Checker
- Judgment Spec as must-have object; verify binds to Spec version; maker cannot edit Spec
- Terminal Agent as default worker; ACP out of scope as primary orchestration path
- Canvas as primary visualization/ops surface for runs (entry points still open)
- Explicit anti-patterns list as non-goals / forbidden behaviors
- Success signals: runs stop with explainable reason; Spec visible; evidence attached; no confidence-only pass
- Out of scope draft: generic workflow marketplace, ACP mesh, mid-run full topology hot-swap, multi-computer orchestration
- **Terminal role chrome**: each Orchestrator-managed terminal must show role in **header/UI** (Orchestrator / Criteria / Maker / Verify), even when agent brand is the same — landed as PRD **M18b**
- **CLI + Skill**: progressive `atmos-orchestrator` skill + HTTP CLI; `context get`; Runtime-owned tick (not public agent verb) — TECH § Agent-facing CLI & Skill
- **Run home cwd + workspace CLI**: all roles default to user Project/Workspace; opt-in child worktree create/use/merge/abandon — PRD M3a/M3c, TECH workspace lifecycle

### Promote to TECH

- Run object + lifecycle states + events (WS-first)
- Judgment Spec schema, versioning, audit, criteria_gap flow
- Orchestrator decision schema (`mode`, `reason`, `topology_hint`, `stop`, …)
- Loop tick pipeline vs Graph compile/execute (shared evidence attach)
- Executable edge metadata on tldraw arrows; flow node ShapeUtils (when in slice)
- tmux edge mapping and `ATMOS_PANE_ID` binding
- Relationship to AutomationService / process supervision reuse
- Skill + CLI: full HTTP/verb tables, skill package layout, skill-dir + UI copy instructions (**not** public tick/set-mode)
- State machine separation (hook / presence / run / node)

### Promote to TEST (later)

- Mode override always wins over Orchestrator
- Run cannot complete without Spec-met (or explicit allowed skip if PRD allows)
- Maker cannot mutate Spec; only Criteria Agent version bump
- Checker fail includes criterion id + evidence path
- Deterministic sensor failure blocks pass even if LLM judge says ok
- Graph fake-edge compile failure
- Budget / max_iter / no_progress stop reasons
- Fresh-context verify does not share maker conversation state
- User cancel → `cancelled` / interrupt semantics
- Canvas shows Spec version and latest verdict
- Regression: APP-015 canvas CLI path and APP-017 automations still work independently
