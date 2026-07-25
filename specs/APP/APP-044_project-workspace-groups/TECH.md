# TECH · APP-044: Project / Workspace Groups

> Technical Design · HOW. Implements PRD APP-044. Addresses M1–M10. N1–N4 deferred.

## Scope summary

Add a first-class **Group** entity with exclusive membership of Projects and Workspaces, expose it over WebSocket, include it in project bootstrap, and add sidebar `groupingMode = "group"` with one-column and two-column UX. No REST. Mobile UI deferred; bootstrap field is additive so mobile can ignore it.

## Architecture overview

```
apps/web (sidebar + bootstrap query + menus)
        ↑
apps/api (WsAction group_* handlers, DTOs)
        ↑
crates/core-service (GroupService business rules)
        ↑
crates/infra (entities, migration, GroupRepo)
```

## Data model

### Tables

**`item_group`** — named container (product copy: “Group”).

| Column | Type | Notes |
|--------|------|--------|
| `guid` | TEXT PK | UUID |
| `created_at` / `updated_at` | DATETIME | base |
| `is_deleted` | BOOL | soft delete |
| `name` | TEXT NOT NULL | trimmed, non-empty |
| `sidebar_order` | INTEGER NOT NULL | group list order |

**`item_group_member`** — exclusive membership.

| Column | Type | Notes |
|--------|------|--------|
| `guid` | TEXT PK | UUID |
| `created_at` / `updated_at` | DATETIME | base |
| `is_deleted` | BOOL | soft delete |
| `group_guid` | TEXT NOT NULL | → item_group.guid |
| `member_type` | TEXT NOT NULL | `"project"` \| `"workspace"` |
| `member_guid` | TEXT NOT NULL | project or workspace guid |
| `sort_order` | INTEGER NOT NULL | order within group |

Indexes / constraints:

- Index `(group_guid, is_deleted, sort_order)` for list-by-group.
- **Logical exclusive membership**: service enforces at most one non-deleted row per `(member_type, member_guid)`. Prefer a unique partial index if SQLite migration style allows; otherwise enforce in `GroupRepo::set_member` transactionally (delete previous active membership, insert/move).

### Migration

- File: `crates/infra/src/db/migration/m20260725_000033_create_item_group_tables.rs`
- Register in `migration/mod.rs`.

### Entities / repo

- `crates/infra/src/db/entities/item_group.rs`
- `crates/infra/src/db/entities/item_group_member.rs`
- `crates/infra/src/db/repo/group_repo.rs` — list groups, list members, create/rename/reorder/soft-delete group, set/remove member, reorder members, purge memberships for project/workspace guid.

### Service DTO (`crates/core-service`)

```rust
pub struct GroupDto {
    pub guid: String,
    pub name: String,
    pub sidebar_order: i32,
    pub members: Vec<GroupMemberDto>,
}

pub struct GroupMemberDto {
    pub guid: String,          // membership row guid
    pub member_type: String,   // "project" | "workspace"
    pub member_guid: String,
    pub sort_order: i32,
}
```

`GroupService` methods:

- `list_groups() -> Vec<GroupDto>` (with members, non-deleted only)
- `create_group(name, sidebar_order?) -> GroupDto`
- `rename_group(guid, name) -> ()`
- `update_group_order(orders: Vec<(guid, order)>) -> ()`
- `delete_group(guid) -> ()` — soft-delete group + soft-delete all its memberships
- `set_member(group_guid, member_type, member_guid) -> GroupMemberDto` — exclusive move
- `remove_member(member_type, member_guid) -> ()`
- `update_member_order(group_guid, ordered_member_guids: Vec<String>) -> ()` where ids are membership guids
- `remove_memberships_for_project(project_guid)` / `for_workspace(workspace_guid)` — called from project/workspace soft-delete paths

Validation:

- Name: trim; reject empty; max length 80.
- `member_type` must be `project` or `workspace`.
- Target project/workspace must exist and not be deleted.
- Adding a workspace that is archived is allowed (membership kept; UI filters archived as today).

Integrity hooks:

- `ProjectService::delete_project` → also clear project membership.
- `WorkspaceService` soft-delete → clear workspace membership.
- Optionally when listing groups, drop members whose project/workspace no longer exists (defensive).

## Transport

### Extend bootstrap

`ProjectWorkspaceBootstrapResponse` gains:

```rust
pub groups: Vec<GroupDto>,
```

`handle_project_workspace_bootstrap` loads groups via `GroupService::list_groups()` (join with projects/labels). Failure to load groups should warn and return `[]` rather than fail the whole bootstrap (same spirit as labels).

### New `WsAction` variants

Snake_case wire names (match existing style):

| Action | Request | Response |
|--------|---------|----------|
| `group_list` | `{}` | `GroupDto[]` |
| `group_create` | `{ name, sidebar_order? }` | `GroupDto` |
| `group_update` | `{ guid, name? }` | `{ success: true }` |
| `group_update_order` | `{ orders: [{ guid, order }] }` | `{ success: true }` |
| `group_delete` | `{ guid }` | `{ success: true }` |
| `group_set_member` | `{ group_guid, member_type, member_guid }` | `GroupMemberDto` |
| `group_remove_member` | `{ member_type, member_guid }` | `{ success: true }` |
| `group_update_member_order` | `{ group_guid, member_guids: string[] }` | `{ success: true }` |

Wire enum locations:

- `apps/api/src/api/ws/message.rs` — `WsAction` variants
- Request structs in `apps/api/src/api/ws/message/workspace.rs` (or new `message/group.rs` re-exported)
- Router: `apps/api/src/api/ws/router/group.rs` + match arms in `router/mod.rs`
- Action string mapping already snake_cases enum names — verify in existing serde rename

No new push events required for v1; clients patch bootstrap cache optimistically then confirm via response (same as labels/projects).

## Frontend

### Domain types — `apps/web/src/shared/types/domain.ts`

```ts
export type GroupMemberType = "project" | "workspace";

export interface GroupMember {
  id: string;           // membership guid
  memberType: GroupMemberType;
  memberId: string;     // project or workspace id
  sortOrder: number;
}

export interface Group {
  id: string;
  name: string;
  sidebarOrder: number;
  members: GroupMember[];
}
```

### Bootstrap — `ProjectBootstrapSnapshot`

- Add `groups: Group[]`.
- Mapper from snake_case WS models in `project-store-mappers.ts` / bootstrap fetch.
- `useGroups()` selector next to `useProjects()`.

### API client — `apps/web/src/api/ws-api.ts`

Thin wrappers: `groupApi.create`, `rename`, `delete`, `setMember`, `removeMember`, `updateOrder`, `updateMemberOrder`.

### Store / mutations

- Prefer TanStack Query bootstrap patches (`patchProjectBootstrapSnapshotAt`) for group mutations, mirroring project/label patterns in `use-project-store` or a small `group` helper module under `features/project/`.
- After create/rename/delete/setMember, update `groups` in the snapshot.

### Sidebar grouping mode

- Extend `SidebarGroupingMode` with `"group"`.
- `SIDEBAR_GROUPING_OPTIONS` + i18n keys `appShell.kanban.grouping.group` (en + zh).
- Persist `workspace_sidebar.grouping_mode = "group"` via existing settings path.
- Type `settings-api.ts` union + parse branches in `LeftSidebar.tsx`.

### Derived data — new `workspace-user-groups.ts` (or extend `workspace-grouping.ts`)

```ts
type UserGroupView = {
  key: string;          // group id or "__ungrouped__"
  label: string;
  groupId: string | null;
  projects: Project[];           // projects whose membership is this group
  workspaces: FlattenedWorkspaceEntry[]; // direct workspace members
};
```

Rules:

- Project is “in” group if a project membership exists.
- Workspace is a **direct** member if a workspace membership exists (regardless of parent project’s group).
- **Ungrouped**: projects with no project membership; also surface workspaces that have workspace membership nowhere when we need ungrouped workspace-only? Direct workspace members always live under their Group; ungrouped section lists projects without group membership (and their nested workspaces as today). Workspaces that are only “extra” paths don’t leave ungrouped project trees.
- When rendering a Group’s project members, show the full project with **all** its non-archived workspaces (M4). Direct workspace members of the Group are listed in a separate subsection (“Workspaces” / “Standalone”) even if their parent project is in another group or ungrouped.

### UI components

1. **One-column** (`GroupedWorkspaceOneColumnContent` pattern): Group headers with collapse; nested project list + direct workspace rows.
2. **Two-column left**: list Groups + Ungrouped (counts optional); selection key = group id or `__ungrouped__`.
3. **Two-column right**: members of selected group — projects (expandable) + direct workspaces; empty state when no members.
4. **Create Group** control: footer or header menu near grouping switcher; dialog or inline rename.
5. **Rename**: double-click / context menu → inline edit (mirror workspace display name patterns where possible).
6. **Context menus** on `ProjectItem` / `WorkspaceItem`:
   - Add to Group → submenu of groups + “New Group…”
   - Remove from Group (if member)
7. Dual-pane: reuse `TwoColumnSidebarContent` with `autoSaveId` / panel ids keyed by `"group"` (already has pattern for non-project modes).

### i18n

Update `apps/web/messages/en.json` and `zh.json`:

- `appShell.kanban.grouping.group`
- `appShell.groups.*` — create, rename, delete, ungrouped, addToGroup, removeFromGroup, empty, etc.

### Mobile

- Bootstrap response adds `groups` (default `[]` on parse if missing).
- No UI requirement this ship; types may be extended for forward compat.

## Module-by-module design

### crates/infra

- Migration, entities, `GroupRepo`, export from `entities/mod.rs` and `repo/mod.rs`.

### crates/core-service

- `service/group.rs` (+ optional `group/` submodule if large).
- Wire into `lib.rs` exports.
- Call membership cleanup from project/workspace delete.

### apps/api

- `router/group.rs` handlers.
- Bootstrap join.
- `AppState` / `WsMessageService` holds `Arc<GroupService>` if not constructed per call from db (match ProjectService pattern).

### apps/web

- Types, mappers, API, bootstrap snapshot, sidebar mode, derived views, menus, dual-pane selection state in `LeftSidebar` / hooks (`use-left-sidebar-workspace-derived` may grow a group branch).

## Security & permissions

- Local single-tenant DB; no new auth. Validate guids exist; no path traversal concerns.

## Rollout plan

1. Migration + entities + `GroupRepo` + unit tests on exclusive membership.
2. `GroupService` + project/workspace delete hooks + service tests.
3. WS actions + bootstrap field + api compile.
4. Frontend types, bootstrap mapper, API client, query patches.
5. Sidebar `group` mode UI (one-column then two-column) + menus + i18n.
6. Playwright e2e + TEST.md coverage status.

## Risks & tradeoffs

- **Tradeoff**: Table prefix `item_group` avoids SQL keyword `group` and product confusion with “grouping mode”.
- **Tradeoff**: No multi-membership keeps unique-member invariant simple for dual-pane selection.
- **Risk**: Large monorepos + many groups could make bootstrap heavier — members are thin rows; acceptable for v1.
- **Rollback**: Soft-delete tables unused if feature flag not needed; shipping without flag is fine (empty groups list is no-op for users who never create one).

## Dependencies & compatibility

- Depends on existing project bootstrap and sidebar grouping settings.
- Additive JSON field `groups` — old clients ignore; new clients default missing to `[]`.

## Open questions

- None blocking; N1 drag-drop deferred.
