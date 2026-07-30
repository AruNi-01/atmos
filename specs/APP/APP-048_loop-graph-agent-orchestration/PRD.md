# PRD · APP-048: Orchestrator (Loop / Graph Agent Orchestration)

> Product Requirements · WHAT and WHY. Settled direction for a **first-class Orchestrator product surface** that reuses Canvas capabilities for evidence-driven **Loop** and **Graph** multi-step agent work—distinct from the ordinary workspace Canvas.
>
> **Post-review revision**: incorporates multi-agent / harness / maker–checker feedback (auto-topology, Spec integrity, join completeness, role+status chrome, Phase-1 Graph bar). See [TECH](./TECH.md) / [TEST](./TEST.md).

Related: [BRAINSTORM](./BRAINSTORM.md), [APP-014 Canvas](../APP-014_canvas/PRD.md), [APP-015 Canvas Terminal Agent](../APP-015_canvas-terminal-agent-integration/PRD.md), [APP-017 Automations](../APP-017_atmos-automations/PRD.md), [APP-030 Terminal Side Chat](../APP-030_terminal-side-chat/PRD.md), [APP-004 ACP](../APP-004_local-agent-integration-acp/TECH.md) (orthogonal).

---

## Context

- **Problem**: Agentic Builders can run terminal code agents and draw structure on the ordinary Canvas, but Atmos has no dedicated place to **orchestrate multi-step agent work** with (1) an intelligent mode choice between feedback **Loop** and explicit **Graph**, (2) a durable **definition of done**, and (3) enforceable stop/evidence rules.
- **Why now**: Harness (tmux, terminal agents, Canvas, Automations) exists; Foundation Engineering says the scarce work is **setpoints** (what is correct), not another outer prompt shell. Industry consensus: prefer single-agent loops for coherent coding writes; use graphs when routes/dependencies are real; put bugs on edges/verifiers, not on “more agents.”
- **Product decision**: Ship **Orchestrator** as its **own feature**, reusing Canvas **engine**, not ordinary Canvas identity. Intelligence and workers are **Terminal Agents** (not `crates/llm` user API/local models).
- **Related**: APP-014/015 (engine reuse), APP-017 (sibling scheduled thin runs), APP-004 (orthogonal ACP).

---

## Goals

1. **Primary**: Users open **Orchestrator**, state a goal, lock a **Judgment Spec**, run **Loop** or **Graph** (or **auto**), and see **why** the run continued or stopped—with **evidence**, never confidence.
2. **Primary**: Loop and Graph are **peer capabilities** under one Run/Spec/Evidence contract, with a **hard Phase-1 Graph acceptance bar** (not an empty enum).
3. **Primary**: Criteria path authors **done**; verify binds versioned Spec; makers cannot rewrite or game the grade line (including sensors).
4. **Secondary**: Native Terminal Agents; deterministic **Runtime**; scannable multi-pane UX (role + instance + activity).
5. **Secondary**: Prefer **lowest complexity** (Loop by default for linear coding); Graph for real parallel/branch/HITL topology.

### Non-goals

Not a generic workflow studio; not ACP mesh; not keyword-only routing; not ordinary Canvas with extra buttons; not multi-Computer single runs; not token FinOps ledger in M1.

---

## Product surface: Orchestrator vs ordinary Canvas

| | **Ordinary Canvas** | **Orchestrator** |
|--|---------------------|------------------|
| Purpose | Free-form board | Multi-step **runs** + Spec + Loop/Graph |
| Entry | Existing Canvas | Dedicated **Orchestrator** entry |
| Document | `~/.atmos/canvas/` | `~/.atmos/orchestrator/boards/` (separate schema) |
| Widgets | Product widgets OK | **No** ordinary product widgets as flow nodes |
| Mental model | “My board” | “My run(s)” |

Empty state **must** explain multi-step runs + Spec; offer link to ordinary Canvas if needed. Visual chrome should not be confusable with workspace board (header “Orchestrator run”).

---

## Users & Scenarios

- **Primary**: Agentic Builder — multi-step work with clear done-ness.
- **Secondary**: Reviewer — audit Spec, evidence, stop reason without replaying chat.

### Key scenarios

1. Auto → Loop for linear fix; Spec sensors green → `spec_met`.
2. Auto proposes Graph with named units → topology emitted or diamond; compile fails → **force Loop** with reason.
3. Force Graph with two research makers + verify; one branch hangs → join **fails** (not silent partial).
4. Two makers same Codex brand: headers show **role + instance + activity**.
5. `criteria_gap` weakens Spec → user must re-confirm; after max Spec versions → stop.
6. Human criterion open → run **blocked**; sensors green alone cannot complete.
7. Maker edits test file used by Spec sensor → not silent green (fail closed / Spec violation).
8. Cancel mid multi-pane run; wall budget kills long maker mid-flight.
9. User forces `loop` → **skip** planner role (lower multi-agent tax).

---

## User Stories

- As a builder, I want a dedicated Orchestrator surface so runs ≠ free-form diagrams.
- As a builder, I want Loop and Graph both real, with auto preferring Loop when edges would be fake.
- As a builder, I want mode override and forced-mode **without** paying for a planner agent.
- As a builder, I want a Judgment Spec before makers run, and verify that cites clauses + evidence.
- As a builder, I want makers as Terminal Agents I already use.
- As a builder, I want each terminal header to show **who (role), which unit (instance), and what state (activity)**.
- As a reviewer, I want run history with mode reason, Spec version, verdicts, stop reason.
- As a user, I want cancel + hard budgets so loops cannot run away.
- As a user, when auto picks Graph, I want either a **valid topology** or an automatic demotion to Loop—not a broken DAG.

---

## Functional Requirements

### Must Have

#### Product identity & entry

- **M1 · Orchestrator product surface**: First-class entry distinct from ordinary Canvas; no requirement to open default canvas document.
- **M2 · Canvas engine reuse**: Separate Orchestrator board lifecycle/storage; ordinary canvas docs never auto-written by runs.
- **M3 · Context binding (run home)**: Every run is bound to a **Project**, an existing **Workspace**, or an explicit **standalone** orchestrator working directory (TECH). That binding is the run’s **home context** and is always visible on the run.
- **M3a · Default working directory for all roles**: Every Orchestrator-managed Terminal Agent role (Planner, Criteria, Maker, Verify) **defaults its cwd / launch path** to the run home:
  - bound **Workspace** → that workspace worktree path;
  - bound **Project** only → project root (TECH path resolution);
  - **standalone** → run standalone workdir under `~/.atmos/orchestrator/…` (TECH).  
  Agents must **not** invent a random home directory. Sensors, prompts, and `context get` all report this home cwd.
- **M3b · Empty state & identity**: Empty state and run chrome state “this is Orchestrator runs, not free-form Canvas”; optional link to ordinary Canvas.
- **M3c · Dynamic isolated Workspace / worktree**: Roles (or the Planner graph) may decide a task needs **isolation** (risky refactor, parallel makers, speculative experiment) and **create a child Workspace** (git worktree / Atmos workspace) under the run’s Project, execute there, then **merge / promote / abandon**.
  - Isolation is **opt-in and task-driven**, not the default for every role.
  - Default remains: work **in the user-selected Project/Workspace**.
  - Parallel **writers** on the home worktree stay forbidden unless isolation + explicit merge/verify (M8).
  - Child workspaces are Orchestrator-labeled, linked to `run_id`, and user-visible.
  - Product supports **merge back** or **abandon** with a clear outcome—not silent drift.

#### Modes (Loop / Graph / Auto)

- **M4 · Peer modes**: `loop` | `graph` | `auto` under one Run/Spec/Evidence contract.
- **M5 · User mode override**: User `loop`/`graph` always wins; UI shows effective mode.
- **M6 · Auto routing**: Planner Terminal Agent (role chrome label **Planner** in UI; product surface remains “Orchestrator”) proposes mode + reason; prefer Loop when fake edges; never keyword-only.
- **M6b · Auto topology resolution**: When auto (or user) selects **graph**:
  1. Prefer **named units** + diamond template when `topology_hint=diamond`, **or**
  2. Planner emits a **compilable graph proposal** artifact, **or**
  3. Compile fails / units unnamed → **force Loop** with visible reason.  
  Never start Graph with empty or decorative-only edges.
- **M7 · Loop**: maker → evidence → judge vs Spec → retry / complete / stop / criteria refine. Evidence+Spec only.
- **M8 · Graph**: sequence, branch, fan-out/join, bounded cycle, human block. Prefer diamond when parallel is real.
  - **Coding domain default**: **serialize writers** on a shared tree; parallelize **read/research** or **independent verifiable units**. Multiple makers writing the **same worktree** without isolation + explicit merge/verify is **forbidden** (see anti-patterns).
  - Join must not succeed on silent partial fan-in (hang / missing branch = fail).
  - Verify uses **fresh context** (and independence tier—see M16b).
- **M8b · Phase-1 Graph acceptance bar** (merge-blocking product bar, not optional UX): Graph mode must **execute** at least **sequence**, **verify (fresh pane)**, and **join fail-closed** (including hang/missing branch), with stop reasons and CLI/skill path. Full board ShapeUtil polish and diamond template may be thinner; **empty Graph enum is not acceptable**. Nested Loop-in-Graph is **out of M1**.
- **M9 · No mid-run mode teleport**: New run (optional `carry_from`) or within-mode replan only. **Cancel** available; pause is Nice (N3).

#### Criteria & Judgment Spec

- **M10 · Criteria Agent**: Drafts versioned Judgment Spec before makers (unless carry-forward Spec rules apply—TECH).
- **M11 · Spec content**: User-visible Spec includes:
  - **acceptance** criteria (required outcomes),
  - **rejection / forbidden** outcomes where practical,
  - **evidence expectations** per required clause,
  - stop/budget hints (or run budget link),
  - judgment order: **sensors → optional LLM-rubric judge → human** (never confidence-as-pass).
  - Rule: if a clause is sensor-checkable, a **sensor must own it**; `llm_judge` cannot sole-pass a required sensor-checkable outcome.
- **M11b · Sensor integrity**: Makers must not “edit the grader.” Files/commands that implement locked Spec sensors (tests, scripts, named paths) are **protected**: mutation fails closed or forces Spec re-version + user confirm. Acceptance surface is **read-only for executors**.
- **M12 · Completion gate**: `completed` only if:
  - all **required acceptance** pass,
  - no **rejection** criterion fires,
  - no open **human** blocks,
  - no required criterion is **unverified** (sensor/judge error, timeout, missing evidence).  
  Missing grader ⇒ **not passed**.
- **M13 · Confirm policy**:
  - User confirm if any **human** criterion, **high/critical** risk, any required **llm_judge**, or Spec **weakens** vs prior version.
  - Auto-confirm only when **all required** criteria are deterministic sensors and risk is low/medium (user may still edit).
- **M14 · Spec immutability for makers**: Makers cannot edit locked Spec. Only Criteria path version-bumps.
- **M14b · Spec evolution budget**:
  - Max Spec versions per run (default **3**, TECH knobs).
  - **Weakening** (drop/soften failed clause, lower risk controls) always requires user confirm.
  - **Strengthening** may continue under same risk tier without re-confirm when policy allows.
  - Exceeding budget → `criteria_unsatisfiable` (or human Spec edit), not infinite legislate loops.
- **M15 · Verdict binds Spec version**: Every verdict cites `spec_id`, version, criterion ids, evidence refs.

#### Runtime, roles, workers

- **M16 · Runtime guarantees**: lifecycle; **wall + iteration + maker-invocation budgets with mid-flight enforcement**; no-progress; cancel; mode override; confidence ban; maker≠checker; join completeness; artifact I/O discipline (TECH). **M1 budgets are wall/iteration/makers—not token FinOps** (token ledger deferred).
- **M16b · Independence tiers** (maker≠checker):
  - **Tier A (minimum)**: fresh verify context + role chrome + Runtime bans maker self-pass.
  - **Tier B (default when ≥2 agents installed)**: prefer **different agent binary** for `verify` (and ideally `criteria`) vs `maker`; UI shows when same agent is used.
  - **Tier C (high/critical risk)**: independent verify agent **or** human on any non-sensor required criterion; no sole `llm_judge` pass.
- **M17 · Terminal Agent workers**: All intelligent roles + makers are terminal-resident code agents.
- **M17b · Forced-mode fast path**: When user sets `loop` or `graph`, **skip Planner role** entirely (still run Criteria unless carry-forward Spec applies).
- **M18 · Role separation**: Planner (mode/plan), Criteria, Maker, Verify/Judge, Runtime. Do not collapse copy into “the agent.”
- **M18b · Terminal chrome (scan-first)**: Every Orchestrator-managed pane, tab, and board terminal card must show:
  1. **Role** (localized full + short; UI role for planner role: **Planner** to avoid product-name collision),
  2. **Instance** (required when ≥2 panes share a role—e.g. graph `node.label`, Loop `iter N`),
  3. **Agent brand**,
  4. **Activity**: `queued | active | waiting_user | succeeded | failed | cancelled` (at least).
  - Role must not be tooltip-only; **non-color channel** required (glyph/letter badge + optional accent).
  - Truncation keeps Role (and Activity icon) before goal text.
  - Ordinary terminals unchanged.
- **M19 · ACP not primary**.
- **M19b · Intelligence host**: Terminal Agents only for planner/criteria/verify intelligence—not `crates/llm` feature providers.

#### Run UX, evidence, controls

- **M20 · Run object**: goal, modes, Spec version, status, stop reason, evidence summary, budgets, binding, mode_reason.
- **M21 · Run states**: include at least `drafting_spec` | `awaiting_spec_confirm` | `running` | `blocked_human` | `refining_spec` | `completed` | `failed` | `cancelled` | `interrupted`. Terminal statuses always show stop reason when finished.
- **M22 · Live surface & layout intents**:
  - **Setup**: Spec + mode + agents primary; board minimal.
  - **Run · Loop**: active Maker + iteration strip primary; Spec mini; board collapsible.
  - **Run · Graph**: **linear run strip / node checklist** primary; topology board as minimap (not free editor); click step focuses matching terminal.
  - **HITL**: full-width human/Spec action strip; terminals dimmed.
  - **Review**: evidence + Spec + stop reason; terminals collapsed.
  - **Running graph**: palette off / edit locked; highlight only (draft graph edit only when not running).
  - When ≥2 Orchestrator panes open, **follow/focus active worker** is Phase-1 Must (not merely Nice).
- **M22b · Pane density**: Prefer auto-collapse Planner/Criteria after artifacts accepted; cap focused PTYs (e.g. 2) with overflow list of role+status chips (exact caps in TECH).
- **M23 · Evidence visibility**: open evidence; name failed criterion; show unverified errors.
- **M24 · Run controls**: **start**, **cancel**, history. **Pause/resume = N3 only** (M1 cancel-only).
- **M25 · Explainability**: mode_reason; stop_reason enums; which role proposed vs worked vs judged.

#### Agent-facing ops

- **M26 · Skill + CLI (agent-operable Orchestrator)**: Ship system skill **`atmos-orchestrator`** + CLI **`atmos orchestrator`** so Terminal Agents know **when/how** to operate runs without inventing protocols.
  - **Skill**: progressive disclosure (`SKILL.md` + on-demand `references/` for schemas, roles/artifacts, **workspace/isolation**, workflows, full flags)—mirror APP-015 canvas skill structure; teach prerequisites, Loop vs Graph, role boundaries, **default cwd = run home**, when to spawn isolated workspace, merge/abandon, artifact paths, anti-patterns, error recovery, context acquisition.
  - **CLI transport**: authenticated **HTTP** to API (APP-015 pattern)—**not** browser WebSocket; **not** ACP.
  - **Verbs (M1 public)**:
    - Core: `skill-dir` (local); `status`; `run create|list|get|start|cancel`; `spec draft|get|confirm|update`; `evidence attach|list`; `graph compile|get`; `context get`; `agents list`.
    - **Workspace (required)**: `workspace get` (home + active cwd for a role/run); `workspace list` (home + child workspaces for the run); `workspace create` (isolated child under Project—worktree/workspace); `workspace use` / bind role or next maker step to a workspace; `workspace merge` (promote child → home / base branch); `workspace abandon` (discard child). Exact flags/HTTP in TECH.
  - **Not agent-facing**: public `tick` / mid-run `set-mode` (Runtime owns ticks; mode change = new run).
  - **Discoverability**: `skill-dir` + Orchestrator UI **Copy agent instructions** (prompt + skill directory only, not full skill body)—parity with APP-015 M19.
  - **Communication model**: CLI for control/inspect **including workspace lifecycle**; role panes speak to Runtime only via **validated run artifacts**; outer user agent keeps conversation ownership (manager/tools, not free handoff chaos).

### Nice to Have

- **N1 · Diamond one-click template** (Phase-1 may still use diamond via auto M6b without fancy UI).
- **N2 · Spec library** per Project (sensor-first starters encouraged even as lightweight presets in Phase 1 if cheap).
- **N3 · Pause / resume**.
- **N4 · Automations trigger**.
- **N5 · Richer presence follow** beyond M22 minimum.
- **N6 · Export run report**.
- **N7 · Multi-run comparison**.
- **N8 · Optional ACP node**.
- **N9 · Token / cost ledger**.

---

## Out of Scope

- Merging into ordinary Canvas; product widgets as flow nodes.
- ACP / `/ws/agent` default mesh; `crates/llm` as Orchestrator brain.
- Keyword-only auto; generic enterprise workflow marketplace.
- Mid-run Loop↔Graph hot-swap; multi-Computer single run; mobile-first.
- Guaranteed unattended overnight without Computer online.
- Replacing Automations; auto-resume after API process death (M1 marks `interrupted`).
- Nested Loop-inside-Graph composition (post-M1).

### Forbidden product behaviors

Shipping any of these is a **failed** interpretation:

1. Complete because maker said “done” without Spec + evidence.
2. Maker edits acceptance Spec mid-run.
3. Soften Spec after fail without user confirm.
4. Complete when required sensor did not execute successfully (`unverified`).
5. Sole `llm_judge` pass for a criterion that has a declared sensor.
6. Maker mutates sensor implementation files to force green without Spec re-version + policy.
7. Verify that shares maker conversation as only judgment path.
8. Graph join success while required branch **failed, cancelled, hung, or missing**.
9. Fan-out multiple makers **writing the same home worktree** without isolation + explicit merge/verify.
9b. Launching Orchestrator roles with a **cwd outside** the run home / approved child workspace without an explicit bind.
9c. Creating orphan worktrees not linked to the run (untracked isolation).
10. Auto always Graph for any multi-step wording; or start Graph with uncompilable/empty topology.
11. Route Orchestrator primarily through ACP or `crates/llm` providers.
12. Role-less terminal headers when multiple Orchestrator panes share an agent brand.

---

## Success Metrics

- Loop **and** Graph dogfood runs from Orchestrator entry (Graph meets M8b bar).
- Spec version + criterion-linked verdict + stop reason always visible.
- Auto reason visible; override works; auto-Graph demotes to Loop when topology invalid.
- Attempted complete without Spec / with unverified sensors blocked.
- Multi-pane scan: user names role+activity without opening scrollback.
- Qualitative: “criteria + loop/graph with real terminals,” not “another chat.”

---

## Risks & Open Questions

### Risks

- Canvas confusion → M1–M3b.
- Spec ceremony → M13 auto-confirm + sensor templates.
- Graph ceremony / parallel write → M6b, M8 coding defaults, forbidden #9.
- Terminal Agent JSON flake → TECH role_invoke contract.
- Multi-agent cost → M17b forced-mode skip planner; collapse planner/criteria panes.
- Same-agent correlated judgment → M16b tiers.

### Open questions (remaining)

- Default agent when many installed (last-used vs Orchestrator settings) — TECH default OK.
- Exact PTY focus cap numbers — TECH.
- Whether verify uses non-interactive flags by default — TECH.
- Design tokens for role accents — design pass.

### Resolved forks

| Topic | Resolution |
|-------|------------|
| Intelligence host | Terminal Agents only |
| Spec confirm | Risk + weaken + llm_judge/human (M13) |
| Skip Spec complete | Never (M12) |
| Mid-run mode | New run only (M9) |
| Pause M1 | Cancel only (M24); N3 later |
| Phase-1 Graph | Hard bar M8b |
| Parallel makers | Serialize shared-tree writes (M8) |
| Role chrome | Role+instance+activity (M18b) |
| Planner naming | UI role **Planner**; product **Orchestrator** |

---

## Milestones

- **Phase 1 — Ship bar**: Entry + Run home cwd for all roles + optional child workspace create/merge/abandon + Spec gates + Runtime + Terminal chrome M18b + **Loop full path** + **Graph M8b** + CLI/skill **including workspace verbs** + isolation from ordinary canvas. Board topology chrome may be minimal.
- **Phase 2 — Graph UX depth**: Diamond template UI (N1), richer topology editing, Spec library (N2), stronger HITL polish.
- **Phase 3**: Automations trigger, export, optional ACP node, token ledger.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Orchestrator** | Product surface / feature |
| **Planner** | Terminal role that proposes mode/topology (UI label; `ATMOS_ORCH_ROLE=orchestrator`) |
| **Criteria** | Authors Judgment Spec (setpoint) |
| **Judgment Spec** | Versioned definition of done + rejection + evidence |
| **Loop / Graph** | Peer execution modes |
| **Runtime** | Deterministic controller (budgets, gates, joins) |
| **Maker** | Actuator / implementer |
| **Verify** | Independent judgment vs Spec |
| **Sensor** | Deterministic check implementing Spec clauses |
| **Ordinary Canvas** | APP-014 free-form board |
| **Run home** | User-selected Project / Workspace / standalone cwd for the run |
| **Child workspace** | Orchestrator-created isolated worktree/workspace for a role or branch of work; merge or abandon |
