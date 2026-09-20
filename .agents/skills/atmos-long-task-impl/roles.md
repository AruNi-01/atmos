# Roles (hard boundaries)

```
HUMAN (final arbiter for spec and disagreements)
  ▲ when lead agent cannot decide or spec is ambiguous
Lead agent (orchestration / architecture check / kanban / verdict)
  ├── Impl subagent (writes only this slice's code)
  └── Review subagent (read-only; checklist from lead agent)
```

| Role | May | May not |
|------|-----|---------|
| Lead agent | Read specs and code, slice work, write kanban, dispatch, verify architecture matches TECH, verdict review, ask HUMAN | Write feature code, “quick fix” for impl agents, self-review as final gate, invent defaults when spec is silent |
| Impl subagent | Implement within exclusive file scope, run slice verify, stop with BLOCKED | Edit others' files, guess spec, leave TODO/mock/stubs, expand scope, declare pass |
| Review subagent | Read-only diff + spec, report against lead checklist | Edit code, unrelated style review, treat “nice refactor” as P0 unless spec requires |
| HUMAN | Product calls, cross-slice contracts, spec conflicts, architecture with no unique TECH answer | — |

If the lead agent edits feature code, global context is lost and the impl → review → rework loop is skipped. Even a one-line product fix goes through an impl agent, then review. Kanban / PROGRESS index / dispatch briefs are not feature code.

## Why this shape

**Context explosion:** When the parent writes all modules at once, the second half loses invariants from the first. Slice briefs must be self-contained because subagents cannot see the parent session.

**Parallel writes in one worktree:** Cursor impl subagents share the current workspace by default. Two agents editing one file is last-write-wins. Parallel only when disjoint — a physical constraint, not style.

**Continuing under uncertainty:** Gaps get filled with different defaults per agent; drift only grows. Stopping is cheaper than shipping wrong.

**Author self-review:** Authors miss their own spec drift. Review must be a different agent with lead-specified “what logic to check.”

## Lead agent: orchestration vs feature code

**Orchestration (lead agent may write)**

- `specs/<ZONE>/<SPEC>/PROGRESS.md` kanban, slice index, handoff notes
- Dispatch briefs (Task prompt only, or optionally appendix in PROGRESS Slice Briefs)
- Read-only verify: `git diff -- <owns>`, run existing tests, read TECH/PRD/TEST

**Feature code (must dispatch impl subagent)**

- Product code under `crates/`, `apps/`, `packages/`, `e2e/`, `resources/`
- Locale JSON, WS contract/DTO, schema/migration, UI components
- Changing test assertions or adding stubs to “make green”
- One-line product fixes, P0/P1 code changes from review

**Not a fifth role**

Wave scheduling, hot-file reservation, integration slices, and collision checks are lead-agent slicing work, not new roles. Integration slices are still written by impl subagents.
