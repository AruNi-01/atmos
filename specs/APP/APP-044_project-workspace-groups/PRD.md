# PRD · APP-044: Project / Workspace Groups

> Product Requirements · WHAT and WHY. Settled direction for a user-named top-level Group container over Projects and Workspaces.

## Context

- **Problem**: Multi-repo agentic builders cannot cluster related Projects and selected Workspaces under a durable, custom-named folder. Existing sidebar modes only re-slice workspaces by metadata (status/time/label/priority) or by Project.
- **Why now**: Sidebar dual-pane already supports category → members navigation; users need the same pattern for personal organization (clients, products, experiments).
- **Related specs**: APP-001 (Project/Workspace model), APP-035 (bootstrap query layer). Does not change git/worktree semantics.

## Goals

1. **Primary** — Users can create named Groups, put whole Projects and individual Workspaces into them (mixed), rename Groups, and browse them in one-column and two-column sidebar layouts.
2. **Secondary** — Membership stays exclusive and consistent after deletes/reorders; ungrouped items remain reachable under an Ungrouped bucket in group mode.

## Users & Scenarios

- **Primary persona**: Agentic builder managing 5–30 repos and many worktrees.
- **Key scenarios**:
  1. Create Group “Client A”, add projects `api` and `web`, plus a one-off worktree from another repo for a hotfix.
  2. Switch sidebar grouping to **By Group**; in two-column layout, select a Group on the left and open members on the right.
  3. Rename Group inline; remove a member back to Ungrouped without deleting the Project/Workspace.
  4. Delete a Group — members become ungrouped; Projects/Workspaces themselves are not deleted.

## User Stories

- As a builder, I want to put multiple Projects into a named Group so I can open related repos as one cluster.
- As a builder, I want to put a single Workspace into a Group so a cross-cutting worktree sits next to other work without moving its parent Project.
- As a builder, I want Groups to support custom names so labels match my mental model (client, product, personal).
- As a builder, I want two-column Group browsing so large lists stay scannable like Project mode.

## Functional Requirements

### Must Have

- **M1: Group CRUD** — Create, rename, delete Groups. Names are user-editable strings (trimmed, non-empty). Deleting a Group only removes the Group and membership rows; Projects/Workspaces stay.
- **M2: Mixed membership** — A Group may contain zero or more Projects and zero or more Workspaces. Order of members inside a Group is user-controllable (or at least stable after add).
- **M3: Exclusive membership** — Each Project and each Workspace belongs to **at most one** Group. Adding to a Group moves it out of any previous Group.
- **M4: Workspace dual visibility** — A Workspace that is a Group member **still appears under its parent Project** in project mode and under that Project when the Project is listed inside a Group. Group membership is an extra navigation path, not a hide.
- **M5: Sidebar mode `group`** — Extend workspace sidebar grouping options with **By Group**. Persist via existing `workspace_sidebar.grouping_mode` setting.
- **M6: One-column Group view** — Expandable Group rows; each shows member Projects (with nested workspaces) and direct Workspace members; Ungrouped section for items without a Group.
- **M7: Two-column Group view** — Left column lists Groups (+ Ungrouped). Selecting a row shows that Group’s members in the right column. Collapse/resize of the primary column matches existing two-column sidebar behavior. Selection survives within the current route key like project/group selection today.
- **M8: Member management UI** — From Project/Workspace context menus (or equivalent), user can add/move to a Group, create a new Group with the item, or remove from Group.
- **M9: Persistence & bootstrap** — Groups and memberships load with project bootstrap (or equivalent startup payload) so the sidebar hydrates without a second round-trip when practical.
- **M10: Integrity** — Soft-deleting a Project removes its membership; soft-deleting a Workspace removes its membership. Orphan memberships must not surface in UI.

### Nice to Have

- **N1**: Drag-and-drop Project/Workspace onto a Group row.
- **N2**: Color or icon per Group.
- **N3**: Mobile Group management UI.
- **N4**: Nested Groups.

## Out of Scope

- **Changing Project ↔ Workspace ownership** — Workspace still belongs to exactly one Project for git/worktree.
- **Multi-group membership** — Explicitly deferred.
- **Cloud sync of Groups** — Local DB only, same as Projects.
- **Mobile first-class Group UI** — API may return groups; mobile screens not required this ship.
- **ACL / multi-user sharing of Groups** — Single local tenant.

## Success Metrics

- Leading: Users who create ≥1 Group and put ≥1 member within a session after discovering the mode.
- Lagging: Share of multi-project users with ≥1 non-empty Group after N days (qualitative dogfood first).
- Qualitative: “I can open Client A and see both repos plus that hotfix worktree without scrolling the whole sidebar.”

## Risks & Open Questions

- **Risk**: “Group” collides linguistically with existing *grouping modes* — UI copy should say **By Group** / **Groups** for the container entity.
- **Risk**: Putting a Workspace in a Group while its Project is in another Group may feel dual-homed; mitigated by exclusive membership and dual visibility rule (M4).
- **Open for TECH**: Exact WS action names, table names, empty-state copy keys.

## Milestones

- Phase 1 — Schema, service, WS, bootstrap (M1–M3, M9–M10).
- Phase 2 — Web sidebar one-column + two-column + member menus (M4–M8).
- Phase 3 — Unit/service tests + Playwright e2e + coverage status.
