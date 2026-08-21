# REVIEW · APP-058: Agent Status Workspace Grouping - Implementation Review

> Post-implementation review log for functional completeness, architecture, maintainability, code size, testability, and follow-up fixes. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: 2026-08-13  
**Review scope**: functional review + quality review  
**Related code**: `apps/web/src/features/agent/`, `apps/web/src/app-shell/sidebar/`, `crates/core-service/src/service/agent_hooks/workspace_agent_group.rs`, `apps/api/src/api/hooks/mod.rs`

---

## Review Summary

Cross-review after the By Agent Status implementation. Mapping, empty buckets, drag-disabled Agent columns, two-column layout, and API-memory snapshot projection matched PRD/TECH. Two P1 hydrate bugs blocked merge: the grouping snapshot was applied in the same `set()` as `hooksHydrated: true` (so it never painted), and an in-flight attention GET could resurrect latches the user already acknowledged. Those are fixed. Remaining items are test-gap / polish and do not block merge.

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P1 | frontend | Grouping snapshot never used on refresh | verified |
| REV-002 | P1 | frontend | In-flight attention hydrate can resurrect acked latches | verified |
| REV-003 | P2 | test | Missing Rust cases for running + sticky permission / two panes | verified |
| REV-004 | P3 | frontend | Hidden kanban columns used color swatches instead of bucket icons | verified |
| REV-005 | P1 | frontend | Stale Agent sessions leak across Computer switch | verified |

---

## REV-001 · Grouping snapshot never used on refresh

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`useWorkspaceAgentGroupKeyMap` only prefers `serverWorkspaceGroupKeys` while `!hooksHydrated`. `init()` applied the snapshot and `hooksHydrated: true` in the same Zustand `set()`, so the snapshot branch never ran. Until sessions + attention finished, every workspace grouped as Idle.

### Evidence

- `apps/web/src/features/agent/store/agent-hooks-store.ts` — previous `Promise.all` then one `set({ sessions, serverWorkspaceGroupKeys, hooksHydrated: true })`.
- `apps/web/src/features/agent/hooks/use-workspace-agent-status.ts` — hydrate helper gated on `!hooksHydrated`.

### Required fix

Apply the grouping snapshot first while `hooksHydrated` remains `false`. Live non-idle keys still win. Mark hydrate complete only after sessions + attention land.

### Acceptance

- [x] Snapshot keys can paint before sessions/attention finish.
- [x] Live non-idle grouping still beats the snapshot.
- [x] After hydrate, live stores are the source of truth.

### Fix log

- 2026-08-13 - Split hydrate: groups first, then sessions + attention, then `hooksHydrated: true`. Extracted `resolveHydratedWorkspaceAgentGroupKey`.
- 2026-08-13 - Verified with `bun test src/features/agent/lib/__tests__/workspace-agent-status.test.ts`.

---

## REV-002 · In-flight attention hydrate can resurrect acked latches

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`hydrateFromServer` replaces the whole attention map. If the user focused/acked a pane during the snapshot `GET`, the response started before the ack and could restore Need permission / Need attention. The grouping snapshot could also keep that workspace out of Idle until hydrate finished.

### Evidence

- `apps/web/src/features/agent/store/agent-attention-store.ts` — `hydrateFromServer` replaces `panes`.
- `apps/web/src/features/agent/store/agent-hooks-store.ts` — `init()` applied the snapshot after `Promise.all` with no ack filter.

### Required fix

Record panes acknowledged during hydrate. Strip them from the attention snapshot (pane id and session-id alias). Drop the grouping snapshot key for that context when live state is idle and no remaining local attention.

### Acceptance

- [x] Ack during hydrate does not resurrect the latch from the in-flight GET.
- [x] Grouping snapshot does not keep an acked idle workspace in Need permission / Need attention.

### Fix log

- 2026-08-13 - `ackedDuringHydrate` set wired through `setAgentPaneAcknowledgedHandler`; filtered attention hydrate; drop stale server group keys when live is idle.
- 2026-08-13 - Verified by code inspection plus grouping helper tests; hydrate race is covered by the ack-filter path in `agent-hooks-store.ts`.

---

## REV-003 · Missing Rust cases for running + sticky permission / two panes

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | test |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`resolve_workspace_agent_group_key` already prefers sticky `PermissionRequest` over live `Running`, and `list_workspace_agent_groups` rolls up two sessions on the same `context_id`. Neither path had a dedicated test.

### Required fix

Add resolver + snapshot tests for running + sticky permission, and two sessions (permission beats running) on one context.

### Acceptance

- [x] `cargo +stable test -p core-service workspace_agent_group` covers both cases.

### Fix log

- 2026-08-13 - Added `running_plus_sticky_permission` resolver assertion, `snapshot_keeps_permission_when_running_with_sticky_latch`, and `snapshot_permission_beats_running_on_same_context`.

---

## REV-004 · Hidden kanban columns used color swatches instead of bucket icons

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P3 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Visible Agent Status column headers use distinct bucket icons. The hidden-column list still rendered a color swatch, so hidden Need permission / Need attention / Running / Idle columns did not match.

### Required fix

Reuse status / priority / agent group icons in the hidden-column list; keep color swatches for label/project/group/time.

### Acceptance

- [x] Hidden Agent Status columns show the same bucket icons as visible headers.

### Fix log

- 2026-08-13 - `WorkspaceKanbanView.tsx` hidden-column list uses `getWorkspaceAgentGroupMeta` / status / priority icons.

---

## REV-005 · Stale Agent sessions leak across Computer switch

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | Greptile review |
| **Owner** | unassigned |

### Finding

`init()` is idempotent and `cleanup()` is never called on reconnect. Switching Computers that share a workspace id kept the previous Computer's hook sessions and grouping snapshot, so By Agent Status could show Running / Need permission for the new target until a later event overwrote the row.

### Evidence

- `apps/web/src/providers/app/websocket-provider.tsx` — `init()` on connect, no cleanup.
- `apps/web/src/app-shell/bootstrap/connection-target-lifecycle.ts` — Computer-scoped stores reset here; agent hooks were missing.

### Required fix

Add `resetForConnectionChange()` that clears sessions, grouping snapshot, and attention, then re-hydrates from the new Computer. Call it from `resetLegacyServerStateForConnectionChange`. Invalidate in-flight hydrate with a generation counter so the previous GET cannot land after the switch.

### Acceptance

- [x] Computer switch empties sessions / grouping keys / attention immediately.
- [x] `hooksHydrated` goes false so the new snapshot can paint.
- [x] WS listeners are not torn down.

### Fix log

- 2026-08-13 - `resetForConnectionChange` on `agent-hooks-store`; wired through `legacy-server-state-reset.ts`. Test: `agent-hooks-store.reset.test.ts`.

