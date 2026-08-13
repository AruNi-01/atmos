# Brainstorm · APP-058: Agent Status Workspace Grouping

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

The left sidebar workspace list can already group by Project, Group, workflow Status, Time, Label, and Priority. Those modes slice **workspace metadata**. They do not slice **live Agent activity**.

Users scanning many worktrees cannot see which ones are idle, running, waiting on permission, or sitting in post-run “need attention” after the agent goes idle (“down”). The Task kanban already mirrors sidebar grouping modes; a new Agent grouping must land in both places or the two surfaces drift.

Existing list-surface agent marks (`WorkspaceAgentStatusMark`) already encode a shared priority used by sidebar, kanban, and search. Grouping should reuse that domain, not invent a second status model.

## Goals (draft)

- Primary: add a sidebar grouping mode that buckets workspaces by Agent activity so users can find work that needs them.
- Secondary: keep Task kanban columns in lockstep with the same mode and the same bucket rules.
- Non-goal: invent new Agent runtime states, change hook protocol, or make Agent status a persisted workspace field.

## Current Agent states (audit)

Live hook states (`AGENT_STATE` in `apps/web/src/features/agent/store/agent-hooks-store.ts`):

| Wire value | Meaning |
|------------|---------|
| `idle` | No live generation |
| `running` | Agent is generating |
| `permission_request` | Agent is blocked on a permission prompt |

Sticky attention reasons (`AttentionReason` in `agent-attention-store.ts`):

| Reason | When it latches |
|--------|-----------------|
| `permission_request` | Permission prompt raised (may remain after live state leaves `permission_request`) |
| `task_complete` | Running → idle (“down”). User has not focused/acknowledged the pane yet |

List-surface view kinds (`WorkspaceAgentStatusView`): `none` / `running` / `permission` / `attention`.

No other first-class list statuses exist today (no connecting, error, paused, crashed, or queued bucket). Attention filter mode is an overlay that hides non-attention rows; it is not a fifth status.

## Options

### Option A — New grouping mode `agent` (“By Agent”)
Add a seventh sidebar/kanban grouping mode. Four buckets derived from live hooks + sticky attention. Persist via existing `workspace_sidebar.grouping_mode`.

**Pros**: Matches every other grouping mode; Task kanban already switches on the same enum; no backend schema.
**Cons**: Another mode in an already long Group By menu; name must not collide with workflow “By Status”.
**Unknown**: Empty-bucket policy; two-column layout toggle.

### Option B — Reuse / overload workflow “By Status”
Map Agent activity onto existing workflow statuses (`in_progress`, `blocked`, …).

**Pros**: No new mode.
**Cons**: Workflow status is user-assignable and persisted; Agent status is live and derived. Dragging a kanban card would overwrite the wrong field. Rejected.

### Option C — Filter chips only (no grouping)
Keep grouping as-is; add Agent-status filters next to workflow status filters.

**Pros**: Smaller UI change.
**Cons**: Does not give the requested grouped list / kanban columns. Can be a later Nice to Have.

## Key forks in the road

- **Fork 1**: New mode vs overload workflow status — **lock Option A** (`agent` / “By Agent”). Decide remaining details in PRD.
- **Fork 2**: Bucket count — four user-facing buckets vs also splitting sticky permission vs live permission. Decide in PRD.
- **Fork 3**: Column order — action-first (permission → attention → running → idle) vs the user’s enumeration order (idle first). Decide in PRD.
- **Fork 4**: Kanban drag — derived live state is not assignable. Decide in TECH (must not be drag-assignable).
- **Fork 5**: Two-column sidebar parity — every other grouping mode has a layout toggle. Decide in PRD.

## Open questions

- [x] Are there Agent states beyond idle / running / permission / post-down attention? **No** in current list-surface model. Do not invent extras in v1.
- [x] Should sticky permission latch live in “Need permission” or “Need attention”? **Need permission** — the user still has to grant access. “Need attention” is specifically post-run `task_complete`.
- [ ] Filter-by-agent-status chips — defer unless PRD promotes it.

## References

- Existing grouping: `apps/web/src/app-shell/sidebar/workspace-grouping.ts`, `workspace-status.tsx`, `kanban-columns.ts`
- Agent list status: `apps/web/src/features/agent/lib/workspace-agent-status.ts`
- Related spec: [APP-044 Project / Workspace Groups](../APP-044_project-workspace-groups/PRD.md) (added `group` mode; same persistence key)

## Ready to promote

- Promote to PRD: new `agent` grouping mode; four buckets; sidebar + Task kanban parity; no new Agent states.
- Promote to TECH: derive buckets from hooks + attention stores; extend `SidebarGroupingMode`; not drag-assignable; persist `grouping_mode`.
