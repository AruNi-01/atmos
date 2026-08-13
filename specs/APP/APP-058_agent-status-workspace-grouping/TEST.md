# TEST · APP-058: Agent Status Workspace Grouping

> Test Plan · how we verify By Agent Status sidebar + kanban grouping. References PRD APP-058 and TECH APP-058.

## Test strategy

- **Unit / Bun**: bucket helper, `groupWorkspaces("agent")`, kanban column build/resolve, drag-assignable false, grouping-mode parse fallback.
- **Unit / Rust**: `list_workspace_agent_groups` snapshot from in-memory sessions + attention, including after idle sweep.
- **E2E (Playwright)**: Group By menu exposes By Agent Status on a connected local computer (soft check, same style as APP-044).
- **Exploratory agent-browser**: visual scan of sidebar groups and Task kanban columns.
- **Manual-only**: live permission prompt and running→idle attention latch across real Agents (hook events are hard to fake end-to-end without a running Agent).

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S8 |
| M2 | S2, S3, S4, S5 |
| M3 | S2 (only four keys) |
| M4 | S3 |
| M5 | S6, S10 |
| M6 | S7 |
| M7 | S9 |
| M8 | S1 (copy keys present) |
| N1–N3 | deferred |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Bun test | `bun test` | `workspace-status` / grouping options | none | `agent` in `SIDEBAR_GROUPING_OPTIONS`; parse accepts `agent`, unknown → `project` | planned |
| S2 | Bun test | `bun test` | `resolveWorkspaceAgentGroupKey` | hook + attention combos | permission > running > attention > idle | planned |
| S3 | Bun test | `bun test` | `groupWorkspaces(..., "agent")` | flattened workspaces + key map | four groups always; membership matches map | planned |
| S4 | Bun test | `bun test` | sticky permission vs task_complete | idle + each latch | permission latch → `permission`; complete → `attention` | planned |
| S5 | Bun test | `bun test` | running + leftover `task_complete` | running + complete latch | `running` | planned |
| S6 | Bun test | `bun test` | map change rebuckets | same items, updated map | workspace moves group | planned |
| S7 | Bun test | `bun test` | `buildKanbanBoardColumns` / `resolveKanbanColumnKeys` / `isKanbanDragAssignable` | groupingMode `agent` | four columns; key match; drag false | planned |
| S8 | E2E | Playwright | `just test-e2e -- tests/specs/APP-058_agent-status-workspace-grouping.e2e.ts` | local computer smoke | Group By includes By Agent Status | planned |
| S9 | Bun test | `bun test` | layout store default / key name | none | `workspaceSidebarAgentTwoColumn` defaults false | planned |
| S10 | Rust test | `cargo test` | `list_workspace_agent_groups` | running / permission / running→idle + idle sweep | snapshot keys survive in API memory | planned |

## Scenarios

### S1 — Group By includes By Agent Status

- **Level**: Bun test
- **Given**: `SIDEBAR_GROUPING_OPTIONS` and `parseSidebarGroupingMode`.
- **When**: the options list is read; parse is called with `"agent"`, `"status"`, and `"nope"`.
- **Then**: `agent` is present; parse(`agent`) = `agent`; parse(`nope`) = `project`.
- **Signals**: option value + parse results.

### S2 — Bucket priority

- **Level**: Bun test
- **Given**: the combinations in PRD M2.
- **When**: `resolveWorkspaceAgentGroupKey` runs.
- **Then**: live permission or sticky permission → `permission`; live running (no permission) → `running`; idle + `task_complete` → `attention`; idle + null → `idle`.
- **Signals**: returned key.

### S3 — Sidebar groups always show four buckets

- **Level**: Bun test
- **Given**: two workspaces mapped to `permission` and `idle`.
- **When**: `groupWorkspaces(..., "agent", { agentGroupKeyByWorkspaceId })`.
- **Then**: keys are `[permission, attention, running, idle]`; empty groups have `items: []`.
- **Signals**: group keys and item ids.

### S4 — Sticky permission vs post-down attention

- **Level**: Bun test
- **Given**: idle + `permission_request` latch; idle + `task_complete` latch.
- **When**: resolve group key.
- **Then**: first is `permission`, second is `attention`.
- **Signals**: keys.

### S5 — Running wins leftover complete latch

- **Level**: Bun test
- **Given**: `running` + `task_complete`.
- **When**: resolve group key.
- **Then**: `running`.
- **Signals**: key.

### S6 — Rebucket when map updates

- **Level**: Bun test
- **Given**: a workspace in `running`, then map changes to `idle`.
- **When**: `groupWorkspaces` is called again.
- **Then**: it leaves Running and appears in Idle.
- **Signals**: item ids per group.

### S7 — Kanban columns match; drag disabled

- **Level**: Bun test
- **Given**: `groupingMode === "agent"`.
- **When**: columns are built and a workspace key is resolved; drag-assignable is queried.
- **Then**: four columns in the same order; workspace lands in its bucket; `isKanbanDragAssignable("agent") === false`.
- **Signals**: column keys, resolved keys, boolean.

### S8 — Sidebar Group By shows By Agent Status

- **Level**: E2E (Playwright)
- **Given**: local computer connected; workspace sidebar visible.
- **When**: user opens Group By.
- **Then**: **By Agent Status** is listed alongside By Status / By Project.
- **Signals**: menu text `By Agent Status`.

### S9 — Two-column setting exists and defaults off

- **Level**: Bun test
- **Given**: layout settings store initial state.
- **When**: store is created.
- **Then**: `workspaceSidebarAgentTwoColumn === false`.
- **Signals**: store field.

### S10 — API memory snapshot survives idle sweep (refresh hydrate)

- **Level**: Rust test
- **Given**: a running session that goes idle (task_complete latch) and idle sessions are swept.
- **When**: `list_workspace_agent_groups` is called.
- **Then**: that `context_id` is still `attention`. Running and sticky permission contexts are present without waiting for a new hook event.
- **Signals**: snapshot `group_key` values.

## Performance & load budgets

Re-grouping on hook ticks must not add extra network. Cost is in-memory map + existing list render. No new budget beyond current sidebar render.

## Regression checklist

- [ ] Workflow **By Status** still groups by `workflowStatus`, not Agent state.
- [ ] Unknown persisted `grouping_mode` still falls back to `project`.
- [ ] Kanban drag still works for status / priority / group.
- [ ] Attention list filter still hides non-attention rows independently of grouping.
- [ ] Pinned section still extracts pinned workspaces from grouped lists.
- [ ] English labels are not ALL CAPS.

## Exploratory agent-browser checks

Use `agent-browser` after implementation. Load Agent Browser instructions first (`agent-browser skills get core --full` if no skill).

1. Open the app, switch sidebar Group By to By Agent Status, confirm four section headers and sentence-case labels.
2. Open Task (`/kanban` or Launchpad Workspaces), switch Group By to By Agent Status, confirm four columns and that cards cannot be dropped across columns.
3. Narrow viewport: Group By menu still lists By Agent Status without clipped text.
4. Watch console for errors when toggling grouping modes.

## Acceptance criteria

- [ ] All Must Have PRD items have at least one passing scenario.
- [ ] No failing scenarios at the declared level.
- [ ] `GET /hooks/workspace-agent-groups` is bootstrap-only (projection of existing in-memory maps).
- [ ] `atmos-specs-test-run` has updated Coverage Status.
- [ ] Targeted `bun test` on touched files passes.

## Manual verification steps

1. Start an Agent until it requests permission → workspace appears under Need permission in sidebar and kanban.
2. Let an Agent finish without focusing the pane → Need attention.
3. Focus the pane → workspace returns to Idle.
4. Enable Settings → Layout → By Agent Status second column; confirm two-column browse.

## Non-coverage

- Real ACP/hook protocol (owned by APP-004).
- Mobile grouping (N3).
- Agent-status filter chips (N1).
- Multi-session rollup beyond existing `getAgentStateForContextId` / `getContextReason`.

## Coverage Status

> Updated 2026-08-13 after By Agent Status rename + API-memory hydrate.

| Scenario | Status | Proof |
|----------|--------|-------|
| S1 | covered | `apps/web/src/app-shell/sidebar/workspace-grouping.test.ts` `parseSidebarGroupingMode` |
| S2 | covered | `apps/web/src/features/agent/lib/__tests__/workspace-agent-status.test.ts` `resolveWorkspaceAgentGroupKey` |
| S3 | covered | `workspace-grouping.test.ts` `always emits four agent buckets` |
| S4 | covered | `resolveWorkspaceAgentGroupKey` live/sticky permission vs idle+complete |
| S5 | covered | `keeps a running agent in running even with a leftover complete latch` |
| S6 | covered | `rebuckets a workspace when the agent map changes` |
| S7 | covered | `apps/web/src/app-shell/sidebar/kanban-columns.test.ts` |
| S8 | planned | `e2e/tests/specs/APP-058_agent-status-workspace-grouping.e2e.ts` (Playwright; not run in this pass) |
| S9 | covered | `apps/web/src/features/settings/store/layout-settings-store.agent-grouping.test.ts` |
| S10 | covered | `crates/core-service/src/service/agent_hooks/workspace_agent_group.rs` (`snapshot_survives_idle_sweep_via_attention_latch` and siblings) |

Commands:

```bash
cd apps/web && bun test \
  src/features/agent/lib/__tests__/workspace-agent-status.test.ts \
  src/app-shell/sidebar/workspace-grouping.test.ts \
  src/app-shell/sidebar/kanban-columns.test.ts \
  src/features/settings/store/layout-settings-store.agent-grouping.test.ts
# 21 pass

cd apps/web && bun run typecheck
# pass

cargo +stable test -p core-service workspace_agent_group
# 5 pass
```

Agent-browser exploratory checks: not_run (no browser session in this implementation pass).

Remaining gaps: S8 Playwright smoke; manual live Agent permission / running→idle latch.
