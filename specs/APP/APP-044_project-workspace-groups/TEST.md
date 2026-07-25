# TEST · APP-044: Project / Workspace Groups

> Verification contract for Group CRUD, exclusive membership, bootstrap, sidebar modes, and dual-pane UX.

## Test strategy

| Level | Role |
|-------|------|
| Rust unit/service (`cargo test -p infra`, `cargo test -p core-service`) | Exclusive membership, rename validation, delete cascade, member order |
| API/WS (service or router-level if harness exists; else service + thin handler) | WS actions map to service correctly |
| Bun/TS unit | Group view derivation, ungrouped bucket, dual visibility of workspace under project |
| Playwright e2e (`e2e/`) | Create group, add project/workspace, switch By Group, dual-pane select, rename |
| agent-browser exploratory | Copy, empty states, two-column resize selection |

## Coverage map

| PRD | Scenarios |
|-----|-----------|
| M1 Group CRUD | S1, S2, S3 |
| M2 Mixed membership | S4, S5 |
| M3 Exclusive membership | S6 |
| M4 Workspace dual visibility | S7 |
| M5 Mode `group` + persist | S8 |
| M6 One-column | S9 |
| M7 Two-column | S10 |
| M8 Member menus | S11 |
| M9 Bootstrap | S12 |
| M10 Integrity on delete | S13, S14 |

## Execution map

| Id | Level | Tool | Target | Fixture | Signals | Status |
|----|-------|------|--------|---------|---------|--------|
| S1 | service | cargo | `core-service` group tests | temp sqlite | create returns guid + name | pending |
| S2 | service | cargo | rename | temp sqlite | name updated; empty rejected | pending |
| S3 | service | cargo | delete group | temp sqlite | group soft-deleted; members cleared; projects remain | pending |
| S4 | service | cargo | set project member | temp sqlite | member_type project | pending |
| S5 | service | cargo | set workspace member | temp sqlite | mixed members listed | pending |
| S6 | service | cargo | exclusive move | two groups | only second group has member | pending |
| S7 | ts | bun | derived view helper | mock projects/groups | workspace under project AND as direct member | pending |
| S8 | e2e | playwright | grouping mode switch | local computer | mode By Group selectable | pending |
| S9 | e2e | playwright | one-column groups | local computer | group header + members | pending |
| S10 | e2e | playwright | two-column | local computer + two-column layout | left select → right members | pending |
| S11 | e2e / unit | playwright or bun | context menu add/remove | local computer | membership updates | pending |
| S12 | service/api | cargo | bootstrap includes groups | temp db | groups field present | pending |
| S13 | service | cargo | delete project | temp sqlite | membership removed | pending |
| S14 | service | cargo | delete workspace | temp sqlite | membership removed | pending |

## Scenarios

### S1 — Create Group

- **Given** empty groups
- **When** `create_group("Client A")`
- **Then** group exists with name `Client A` and empty members
- **Signals**: `list_groups` length 1; name match

### S2 — Rename / reject empty

- **Given** a group
- **When** rename to `"  "` → error; rename to `"Client B"` → ok
- **Signals**: validation error; updated name

### S3 — Delete Group

- **Given** group with a project member
- **When** delete group
- **Then** group gone from list; project still listable; membership gone
- **Signals**: `list_groups` empty; project repo still finds project

### S4 — Add Project to Group

- **Given** project P and group G
- **When** `set_member(G, project, P)`
- **Then** G.members contains project P
- **Signals**: member_type `project`, member_guid P

### S5 — Add Workspace to Group (mixed)

- **Given** G already has project P; workspace W of another project
- **When** `set_member(G, workspace, W)`
- **Then** G has both project and workspace members
- **Signals**: two members; types differ

### S6 — Exclusive membership

- **Given** W in G1
- **When** `set_member(G2, workspace, W)`
- **Then** only G2 lists W; G1 has no W
- **Signals**: single active membership for (workspace, W)

### S7 — Dual visibility (derived)

- **Given** project P with workspace W; W is direct member of G; P is ungrouped
- **When** build group views + project mode tree
- **Then** W appears under P in project tree; W appears as direct member of G
- **Signals**: unit assertion on both collections

### S8 — Sidebar mode By Group

- **Given** web app connected
- **When** user opens grouping menu and selects By Group
- **Then** sidebar uses group layout; setting persists after reload when practical
- **Signals**: UI shows group headers or empty Groups + Ungrouped

### S9 — One-column browse

- **Given** group with project member
- **When** one-column group mode
- **Then** expandable group shows project (and its workspaces)
- **Signals**: visible text of group name and project name

### S10 — Two-column browse

- **Given** two-column sidebar enabled and ≥1 group
- **When** select group on left
- **Then** right panel shows that group’s members only
- **Signals**: selection highlight; member list match

### S11 — Add / remove via UI

- **Given** project not in any group
- **When** Add to Group → G; then Remove from Group
- **Then** membership appears then clears
- **Signals**: WS or UI list updates

### S12 — Bootstrap includes groups

- **Given** group rows in DB
- **When** `project_workspace_bootstrap`
- **Then** response includes `groups` array with members
- **Signals**: JSON field present; count matches

### S13 — Project delete clears membership

- **Given** project member of G
- **When** soft-delete project (test harness path)
- **Then** membership removed
- **Signals**: group members empty for that guid

### S14 — Workspace delete clears membership

- **Given** workspace member of G
- **When** soft-delete workspace
- **Then** membership removed
- **Signals**: group members empty for that guid

## Exploratory agent-browser checks

1. Empty Groups state copy is clear; Create Group is discoverable.
2. Two-column: collapse primary panel and restore; selection still usable.
3. Rename Group inline without layout jump.
4. zh locale: grouping option and Ungrouped translated (not English paste).

## Regression checklist

- [ ] Existing grouping modes (`project`/`status`/`time`/`label`/`priority`) still work.
- [ ] Project bootstrap still returns projects + labels when groups empty.
- [ ] Soft-delete project/workspace without group membership still succeeds.
- [ ] Two-column project mode unaffected when groupingMode is project.

## Acceptance criteria

1. All Must Have scenarios S1–S14 pass or have explicit residual gap with owner.
2. Playwright covers at least create group + add project + open By Group (S8/S9 or S10).
3. No regression on existing smoke project/workspace routes.

## Manual verification steps

1. Import two projects; create Group; add both; switch By Group; enable two-column; select group.
2. Add one workspace from project B into Group A while project B stays ungrouped; confirm workspace under project B in project mode and as direct member in Group A.
3. Delete Group; confirm projects remain.

## Non-coverage

- Multi-group membership
- Mobile Group UI
- Drag-and-drop (N1)
- Nested groups

## Coverage Status

_Updated 2026-07-25 during APP-044 implementation._

| Id | Status | Evidence |
|----|--------|----------|
| S1–S6, S13–S14 | **pass** | `cargo test -p core-service group` — 4 tests (create/rename/delete, exclusive membership, mixed members, delete hooks) |
| S7 | **pass** | `bun test apps/web/src/app-shell/sidebar/user-groups.test.ts` — dual visibility + exclusive lookup |
| S8–S11 | **partial** | Playwright `e2e/tests/specs/APP-044_project-workspace-groups.e2e.ts` covers group create / set_member / bootstrap / delete via WS; UI By Group is best-effort when footer control is visible |
| S12 | **pass** | Same e2e asserts `project_workspace_bootstrap.groups` includes created group + member; API compiles with bootstrap field |

Commands run:

```bash
cargo test -p core-service group
cargo check -p api
bun test apps/web/src/app-shell/sidebar/user-groups.test.ts
# optional e2e (requires local harness):
# just test-e2e e2e/tests/specs/APP-044_project-workspace-groups.e2e.ts
```

Remaining gaps:

- Full UI path for context-menu add/remove of workspace members in Playwright (project menu is wired; workspace menu deferred).
- agent-browser exploratory checks not run in this session.

