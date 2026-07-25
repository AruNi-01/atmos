# Brainstorm · APP-044: Project / Workspace Groups

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos organizes work as **Project** (git repo) → **Workspace** (worktree). Power users accumulate many repos and worktrees across clients, monorepos, and personal experiments. The sidebar’s existing *grouping modes* (`project` / `status` / `time` / `label` / `priority`) only **view-filter** workspaces; they do not let users invent a durable top-level container.

Pain today:

- Related projects (e.g. `api` + `web` + `infra`) cannot sit under one named folder.
- A single long-lived worktree cannot be “pinned” into a personal/client group without dragging the whole parent project.
- Dual-pane layout already teaches left = category / right = members for project and status modes; users expect a similar path for custom folders.

## Goals (draft)

- Introduce **Group** as a user-named, highest-level organizational container.
- A Group can hold **whole Projects** and **individual Workspaces** in the same list.
- Membership is **exclusive** (each Project/Workspace belongs to at most one Group).
- Workspace membership in a Group is an **additional view path** — the workspace still appears under its parent Project.
- Ship with full backend persistence, sidebar one-column + **two-column** UX, unit/service tests, and Playwright e2e.

## Options

### Option A — First-class DB Group + membership table (chosen)

`item_group` + `item_group_member` in SQLite; WS CRUD; bootstrap includes groups; `SidebarGroupingMode` gains `"group"`.

**Pros**: Durable, queryable, consistent with labels/projects; works offline/local-first.  
**Cons**: Migration + multi-layer wiring.  
**Unknown**: How aggressive empty-state / onboarding copy should be.

### Option B — Frontend-only folders in function_settings.json

JSON map of group id → member ids in settings file.

**Pros**: No migration.  
**Cons**: No integrity with soft-delete; hard to share across surfaces; poor for mobile later. Rejected.

### Option C — Always-on Group hierarchy replacing Project as default top level

Force every project under a Group (or synthetic Ungrouped).

**Pros**: One mental model.  
**Cons**: Breaks existing project-mode muscle memory. Rejected for v1; Group is an **opt-in grouping mode**.

## Key forks in the road

- **Fork 1: Membership exclusivity** — Exclusive (at most one Group) vs multi-group. **Decided: exclusive.**
- **Fork 2: Entry surface** — New `groupingMode = "group"` vs always-on hierarchy. **Decided: grouping mode.**
- **Fork 3: Workspace dual visibility** — Still under Project vs “lifted out”. **Decided: still under Project.**
- **Fork 4: Ungrouped bucket** — Synthetic “Ungrouped” row vs hide ungrouped in group mode. **Decide in PRD: show Ungrouped.**
- **Fork 5: Member ordering** — Mixed project/workspace sort order inside a group. **Decide in TECH: explicit `sort_order`.**

## Open questions

- [x] Multi-membership? → No (exclusive).
- [x] Dual-pane semantics? → Left: groups (+ ungrouped); right: members of selection.
- [ ] Nice-to-have: drag Project row onto Group in project mode without switching mode — defer to N*.
- [ ] Mobile Group UI — out of scope for this APP (bootstrap may still return groups).

## References

- Existing sidebar: `apps/web/src/app-shell/LeftSidebar.tsx`, `workspace-grouping.ts`, two-column controls.
- Project bootstrap: `project_workspace_bootstrap` + `ProjectWorkspaceBootstrapResponse`.
- Label pattern: `workspace_label` entity + WS label CRUD.
- Related: APP-001 core project/workspace model; APP-035 TanStack Query bootstrap.

## Ready to promote

- Promote to PRD: exclusive Group container; mixed Project + Workspace members; custom rename; groupingMode `group`; dual-pane UX; workspace remains under project.
- Promote to TECH: SQLite tables, WS actions, bootstrap field, frontend mode + selection state, cascade on project/workspace soft-delete.
