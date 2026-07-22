# TECH · APP-040: Composer Skills Disable

## Architecture

```text
Composer / Terminal AI Input
  └─ ComposerSkillsControl (shared UI)
       ├─ Project context → skills_list (+ filter) → skills_set_enabled (existing)
       └─ Workspace context → skills_scan_root(workplace) → skills_set_enabled(+ scope_root)
              └─ core-service SkillManager
                   ├─ disabled_path = <root>/.atmos/skills/.disabled/<rel>
                   ├─ ensure_local_movable (workspace only; materialize compensated ancestors)
                   └─ move_entry_without_following_symlink
```

## Data / filesystem

- Disabled storage relative path stays `DISABLED_STORAGE_REL_PATH = ".atmos/skills/.disabled"`.
- Project root = project `main_file_path`.
- Workspace root = workspace `local_path` (git worktree).
- New manageable scope string: `"workspace"`.
- Skill ids: `workspace::{workspace_id}::{name}` (same builder as project/global).

## Backend (`crates/core-service`)

1. `is_manageable_scope` includes `"workspace"`.
2. `SkillScanner::scan_roots(roots, mode)` where each root is `(scope, id, name, path)`.
   Existing `scan_all(project_paths)` remains a thin wrapper (global + system + projects).
3. `SkillManager::set_enabled` accepts optional extra roots (workspace) merged into path records.
4. `disabled_path_for` handles `scope == "workspace"` like `project` (lookup root by id).
5. Before a **workspace** disable/enable move, call `ensure_entry_local_to_root(root, path)`:
   - If `path` (or the path being restored) is a symlink → no-op (existing move is safe).
   - Else walk ancestors under `root`; for each symlink ancestor `S → T`, replace `S` with a
     real directory and recreate each child of `T` as a symlink `S/child → T/child`
     (absolute target). Repeat until the skill entry itself is a symlink or a real
     local directory under `root`.
   - Then `move_entry_without_following_symlink` as today.

## API (`apps/api` WS)

| Action | Change |
|--------|--------|
| `skills_set_enabled` | Optional `scope_root: { id, name, path, scope }` so workspace roots participate. |
| `skills_scan_root` (new) | Scan a single absolute root with given scope/id/name; no disk-cache (composer freshness). |
| `skills_list` | Unchanged for Skills page / project composer (project disable stays shared). |

## Frontend (`apps/web`)

- Shared `ComposerSkillsControl` under `features/skills/components/`.
- Mount in Welcome PromptComposer chrome (project id + project path).
- Mount in `TerminalAgentInputShell` footer:
  - If `localPath` equals a workspace worktree → workspace mode.
  - Else → project mode (use `activeProjectId` / project root).
- Popover: list toggleable skills, Switch per skill, muted tip about new sessions.
- On success: `forceRefreshSkillsList` / invalidate; toast only on error (inline state for success).
- i18n keys in `Welcome` / `terminal.agentInput` / shared `skills.composerDisable` namespaces (`en` + `zh`).

## Risks

| Risk | Mitigation |
|------|------------|
| `rename` through a parent symlink mutates the project | Materialize ancestors first in workspace mode |
| Materialization changes workplace tree shape | Only on toggle; children remain symlinks to project |
| Stale Agent session still sees skill | Explicit UI tip (M6) |

## Rollout

1. core-service scan/manage + materialize + tests
2. API WS actions
3. Shared UI control + wire PromptComposer + terminal AI Input
4. i18n + TEST coverage status
