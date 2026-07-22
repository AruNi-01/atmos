# TECH · APP-040: Composer Skills Disable

## Architecture

```text
Composer / Terminal AI Input
  └─ `/` slash command "Dynamic Skills"
       └─ SlashCommandPopover view=disable_skills
            ├─ Project context → skills_list (+ filter) → skills_set_enabled
            └─ Workspace context → skills_scan_root(workplace) → skills_set_enabled(+ scope_root)
                   └─ core-service SkillManager
                        ├─ move live skill tree → <root>/.atmos/skills/.disabled/<rel>
                        ├─ write <original>/SKILL_DISABLED.md marker (no SKILL.md)
                        ├─ enable: remove marker dir, move back from .disabled
                        ├─ ensure_entry_local_to_root (workspace; materialize compensated ancestors)
                        └─ move_entry_without_following_symlink
```

## Data / filesystem

- Disabled storage relative path stays `DISABLED_STORAGE_REL_PATH = ".atmos/skills/.disabled"`.
- Live-path marker filename: `SKILL_DISABLED.md` (constant `SKILL_DISABLED_MARKER`).
- Marker content includes `atmos_skill_disabled: true` frontmatter plus human/Agent-facing
  “do not use / do not search” instructions. Agents that only discover `SKILL.md` will
  **not** treat the marker as a skill.
- Project root = project `main_file_path`.
- Workspace root = workspace `local_path` (git worktree).
- Manageable scope string: `"workspace"`.
- Skill ids: `workspace::{workspace_id}::{name}` (same builder as project/global).

### Disable / enable sequence

**Disable**

1. Resolve placement path; for workspace, `ensure_entry_local_to_root` first.
2. `move_entry_without_following_symlink(live → .disabled/<rel>)` (entire tree:
   `SKILL.md`, `references/`, `scripts/`, …).
3. Recreate `<original_skill_dir>/` and write `SKILL_DISABLED.md` only.

**Enable**

1. Remove `<original_skill_dir>/SKILL_DISABLED.md`; remove the directory if empty.
2. `move_entry_without_following_symlink(.disabled/<rel> → original)`.

## Backend (`crates/core-service`)

1. `is_manageable_scope` includes `"workspace"`.
2. `SkillScanner::scan_roots(roots, mode)` / `scan_all_with_extra_roots`; `scan_all(project_paths)` remains a thin wrapper.
3. `SkillManager::set_enabled` accepts optional extra roots (workspace) merged into path records.
4. `disabled_path_for` handles `scope == "workspace"` like `project` (lookup root by id).
5. Before a **workspace** disable/enable move, call `ensure_entry_local_to_root(root, path)`:
   - If `path` itself is a symlink → no-op (existing move is safe).
   - Else walk ancestors under `root`; for each symlink ancestor `S → T`, replace `S` with a
     real directory and recreate each child of `T` as a symlink `S/child → T/child`
     (absolute target). Repeat until the skill entry itself is a symlink or a real
     local directory under `root`.
   - Path containment must tolerate macOS `/var` vs `/private/var` (normalize before
     `starts_with`); otherwise materialization is skipped and rename can mutate the project.
6. After disable move, `write_skill_disabled_marker(original_path)`.
7. Before enable move, `remove_skill_disabled_marker(original_path)`.

## API (`apps/api` WS)

| Action | Change |
|--------|--------|
| `skills_set_enabled` | Optional `scope_root: { id, name, path, scope }` so workspace roots participate. |
| `skills_scan_root` (new) | Scan a single absolute root with given scope/id/name; no disk-cache (composer freshness). |
| `skills_list` | Unchanged for Skills page / project composer (project disable stays shared). |

## Frontend (`apps/web`)

- Entry: `/` slash command id `dynamic-skills`, label **Dynamic Skills** (Welcome + terminal).
- Selecting the command morphs `SlashCommandPopover` into `view: "disable_skills"` (back + Esc
  return to the command menu), similar to Agent run-config morph.
- Disable list: Switch per skill; Project/Global/Workspace as inline badge; tip from
  `skills.composerDisable.sessionTip` (current-session visibility wording).
- Shared hook: `useComposerDisableSkills` + protocol helpers under `features/skills/`.
- Slash skill-insert list may still show disabled skills as non-selectable with a Disabled badge;
  list data shares the skills query cache where practical.
- On success: `forceRefreshSkillsList` / invalidate; toast only on error.
- i18n: `Welcome.components.slashPopover.disableSkill.*`, `terminal.agentInput.disableSkillCommand.*`,
  `terminal.agentInput.skillDisable.*`, `skills.composerDisable.*` (`en` + `zh`).

## Risks

| Risk | Mitigation |
|------|------------|
| `rename` through a parent symlink mutates the project | Materialize ancestors first; normalize `/private` path prefix on macOS |
| Materialization changes workplace tree shape | Only on toggle; children remain symlinks to project |
| Permanent `SKILL.md` stub re-discovers skill next session | Use `SKILL_DISABLED.md` only; never leave `SKILL.md` at live path while disabled |
| Agent Runtime still holds baked metadata | Entrypoint removal is best-effort for current session; no Runtime API claim |

## Rollout

1. core-service scan/manage + materialize + marker + tests
2. API WS actions
3. `/` Dynamic Skills morph popover on Welcome + terminal AI Input
4. i18n + TEST coverage status

## Post-Implementation Update · 2026-07-22

- Added live-path `SKILL_DISABLED.md` marker write/remove around disable/enable.
- Fixed workspace symlink materialization path-prefix bug (`/var` vs `/private/var`).
- Replaced standalone composer Skills button with `/` **Dynamic Skills** command UX.
- Updated tip/copy away from “new session only”.
