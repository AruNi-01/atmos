---
name: atmos-long-task-impl
description: Orchestrate complex multi-file Atmos implementation as the parent lead agent — slice TECH into file-disjoint waves, write a PROGRESS.md kanban, dispatch impl and read-only review subagents, escalate spec gaps to HUMAN, and never write feature code in the parent session. Use when the user asks for parallel implementation, long-task orchestration, kanban-style tracking, wave splitting, dispatch subagents, split a large APP-NNN spec across agents, or when a single atmos-specs-impl session would overflow context or collide on the same files.
user-invokable: true
args:
  - name: spec_id
    description: Spec identifier, e.g. `APP-068` or `APP-068_agent_chat_arch_optimize`. Required for spec-backed work.
    required: true
  - name: wave
    description: Optional wave id to run next (e.g. `0`, `1`). If omitted, run the next incomplete wave on the kanban.
    required: false
---

# Atmos Long-Task Implementation

Parent session = **lead agent**. Feature code is written only by **impl subagents**; **review subagents** are read-only; spec ambiguity is escalated only to **HUMAN**. Hard boundaries are in [roles.md](roles.md).

This skill **replaces the parent writing code**, not the coding rules in `atmos-specs-impl`. Each impl subagent still follows that skill (layer order, WebSocket-first, regression gate).

## When to use

Use this skill if **any** of these hold:

- The user wants parallel work, wave splitting, kanban tracking, subagent dispatch, or long-task implementation
- One TECH phase spans multiple crates or apps and a single session would lose invariants from the first half
- Two workflows would edit the same files if started at once

## When not to use

- A small change fits in one `atmos-specs-impl` session with regression green
- PRD/TECH/TEST are still templates or TECH does not admit a single architecture (stop, ask HUMAN, or return to `atmos-specs-tech`)
- The user only wants a few files edited in the parent session

Scenario testing still belongs to `atmos-specs-test-run`. Full spec review belongs to `atmos-specs-review`. This skill's review subagent is a **slice-level, checklist-driven gate**, not a replacement for those skills.

## Architecture (optimal cut vs “everyone parallel”)

Four roles are enough. Do not add planner / integrator / tester.

```
HUMAN  ←—— sole product / contract / ambiguity arbiter
  ▲
Lead agent  wave split · collision check · kanban · dispatch · architecture check · review verdict
  ├── Wave 0 serial impl subagent: compile contracts on disk
  ├── Wave N parallel impl subagents: disjoint Owns and contracts already landed
  ├── Per-slice review subagent: read-only, checklist from lead agent
  └── Final serial impl subagent: hot files + glue
```

Scheduling constraints (not preference):

1. Cursor impl subagents **share the current workspace**. Do not use isolated worktrees by default (merge conflicts become new spec invention).
2. Parallel iff `Owns` sets are disjoint **and** imported types / WS rows exist from a prior wave. Folder-based splitting is not enough.
3. Default at most **3** impl subagents per wave. Review is read-only; pipeline review after each impl returns.
4. Kanban single writer = lead agent. Impl and review agents do not edit `PROGRESS.md`.

Kanban and collision rules: [kanban.md](kanban.md). Splitting examples: [examples.md](examples.md).

## Lead agent loop

Copy and track progress:

```
- [ ] 0. Read PRD / TECH / TEST (and existing PROGRESS); stop if TECH is ambiguous
- [ ] 1. Architecture check: layers, WS-first, module boundaries unique?
- [ ] 2. Slice waves + Owns; collision check; reserve hot files for serial wave
- [ ] 3. Write/update PROGRESS.md kanban (lead agent only)
- [ ] 4. Gaps → HUMAN (A/B); do not dispatch related slices before reply
- [ ] 5. Dispatch impl subagents for this wave (multiple Tasks in one parent message; self-contained briefs)
- [ ] 6. Collect reports; scope breach or BLOCKED → stop wave; do not patch code in parent
- [ ] 7. Dispatch review (different agent; concrete logic checklist)
- [ ] 8. Verdict: pass → may mark done; fail → rework impl same Owns + review again
- [ ] 9. Re-check TECH; next wave; final glue still via impl agent
- [ ] 10. All done → hand off to atmos-specs-test-run (or stop if user only wanted production code)
```

### 0–1 Read specs and architecture check

Read: `PRD.md`, `TECH.md`, `TEST.md`, existing `PROGRESS.md`, and `AGENTS.md` for touched areas.

Confirm in the parent session:

- Each slice has a unique module boundary from TECH, not “two stories both work”
- New API is WS (or TECH documents a REST exception)
- Layer order: infra → core-engine → core-service → api → apps; parallel work must not break **compile** order (parallel UI/API before contract on disk = invalid)

The lead agent **reads, slices, and asks only** at this step. Need to change product code → that is a slice, not now.

### 2–3 Slice and write kanban

Every slice card must have: Goal, Out of scope, Owns, Forbids, Depends, **copied** invariants from TECH, one Verify command, and a **lead-written** review checklist.

Write the table into the spec's `PROGRESS.md`. Template: [kanban.md](kanban.md).

### 4 Ask HUMAN

When the spec is silent, contracts conflict across slices, or architecture has no unique TECH answer: **stop dispatch** and ask HUMAN. Do not invent defaults in silence.

```markdown
HUMAN decision needed
Slices: S1, S2
Conflict: <one sentence>
Options:
A. …
B. …
Recommendation: A, because <TECH citation, or “TECH silent — preference only”>
Until you reply: S1/S2 stay blocked; no dispatch.
```

### 5 Dispatch impl

Open one `generalPurpose` Task per ready slice. The prompt must be self-contained (subagent **has no** parent context):

1. “Read `.agents/skills/atmos-long-task-impl/impl.md` first”
2. Full slice card (Owns as absolute or repo-root-relative paths)
3. Spec excerpts verbatim — not “see TECH §2”
4. Read-only neighbor paths allowed
5. Verify command
6. “Do not edit outside Owns; do not write PROGRESS.md; do not commit”

Multiple impl agents in one wave: **multiple Tasks in one parent message**. Run collision check first.

### 6–8 Collect, review, verdict

After impl returns:

- `FILES` must ⊆ `Owns`. Out of scope = failure. Do not “fix” out-of-scope diff in the parent as feature work; dispatch a **cleanup impl slice** (Owns = polluted paths) or ask HUMAN to allow `git checkout -- <path>`.
- `BLOCKED` → mark kanban blocked with QUESTION for HUMAN.
- `ok` → dispatch a **different** review agent. Prompt reads [review.md](review.md), `git diff` scope = Owns, spec excerpts, **this slice's review checklist**.

Lead agent review verdict:

| Review | Lead agent |
|--------|------------|
| pass, no P0/P1 | Mark `done` if architecture still matches TECH |
| fail | Rework impl same Owns, brief = `REWORK` list; review again |
| refactor framed as P0 | Downgrade or ignore; do not expand slice |
| conflicts with TECH | Ask HUMAN; do not rewrite PRD to match code |

Even a one-line product fix goes impl → review. Parent self-review as final gate = violation.

### 9–10 Next wave and handoff

After each wave, read-only architecture check (layers, duplicate DTOs, contract drift). Final-wave glue / i18n / barrels are still impl slices.

When all slices are `done`, hand off to `atmos-specs-test-run`. Parent delivers: kanban state, slice list, open HUMAN questions, TEST.md scenarios for test-run. Do not claim the spec is fully verified.

## Subagent selection

| Work | `subagent_type` | Writes disk |
|------|-----------------|-------------|
| Impl / rework / cleanup | `generalPurpose` | Owns only |
| Slice review | `generalPurpose` | No |
| Lead agent path discovery | Parent Grep/Read, or `explore` | No |

Do not use `best-of-n-runner` as default parallel impl (isolated worktree + merge bypasses file mutex). Do not replace checklist-driven slice review with `bugbot` / `security-review`.

## Lead agent prohibitions (repeated because most often broken)

- No feature code, including “just one line” or “tests are red let me fix”
- Do not treat impl `STATUS: ok` as final review
- Do not pick silent spec defaults to keep waves moving
- Do not dispatch parallel impl with intersecting Owns
- Do not send non-self-contained briefs like “continue our earlier plan”

## Done

- Planned slices are `done`, or `blocked` items are with HUMAN and not pretended complete
- No unreviewed impl diff
- `PROGRESS.md` kanban reflects current truth
- TECH remains source of truth; drift was escalated not silently coded
- Handed off to test-run, or user explicitly wanted production code only

## Additional resources

- Hard boundaries: [roles.md](roles.md)
- Kanban / waves / hot files: [kanban.md](kanban.md)
- Impl subagent: [impl.md](impl.md)
- Review subagent: [review.md](review.md)
- Splitting examples: [examples.md](examples.md)
- In-slice coding: [../atmos-specs-impl/SKILL.md](../atmos-specs-impl/SKILL.md)
- `PROGRESS.md` skeleton: `specs/references/progress-template.md`
