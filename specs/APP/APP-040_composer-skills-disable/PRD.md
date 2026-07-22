# PRD · APP-040: Composer Skills Disable

## Summary

Users can enable/disable Agent skills from PromptComposer and the terminal AI Input,
using the same filesystem disable mechanism as the Skills management page. Project
toggles stay in sync with that page. Workspace toggles apply only under the current
workplace directory (where sync dirs land), so Agents in that worktree stop discovering
the skill. The UI warns that changes apply to **new** Agent sessions only.

## Users & jobs

- **Project operator** on Welcome / PromptComposer: quickly mute noisy project skills
  before launching a workspace Agent, without opening Skills.
- **Workspace operator** in a terminal AI Input: mute skills that were synced into the
  worktree (symlink or copy) for this workplace only.

## Must Have

| ID | Requirement |
|----|-------------|
| M1 | PromptComposer exposes a skills enable/disable control for manageable skills visible in the current project context. |
| M2 | Terminal AI Input exposes the same control. In a project terminal it uses project disable; in a workspace terminal it uses workplace-rooted disable. |
| M3 | Project disable/enable uses the existing Skills Manager move into `project/.atmos/skills/.disabled/...` and stays consistent with the Skills management page. |
| M4 | Workspace disable/enable reuses the same move logic with storage under `workplace/.atmos/skills/.disabled/...`. |
| M5 | Sync-dir symlink and copy placements can both be disabled by moving the workplace-visible skill entry into `.disabled` so Agents no longer discover it. Parent compensated symlinks are materialized as needed so the move does not mutate the project tree. |
| M6 | UI copy warns that disable takes effect on a **new** Agent session; already-initialized sessions keep skills already loaded into the system prompt. |
| M7 | Global skills remain toggleable where `can_toggle` is true (same as Skills page). System / InsideTheProject skills stay non-toggleable. |

## Nice to Have

| ID | Requirement |
|----|-------------|
| N1 | Show disabled skills in the composer popover so they can be re-enabled without visiting Skills. |
| N2 | After a toggle, refresh slash-command skill lists that are already open. |

## Success metrics

- Project toggle from composer updates Skills page status after refresh without a second API.
- Workspace toggle leaves project skill files untouched when the workplace entry was a compensated symlink/copy.
- Users see the new-session tip before or when toggling.

## Out of scope

- Retroactively rewriting an already-running Agent session’s system prompt.
- Cloud-synced disable state across machines.
- Disabling skills inside the read-only `skills/` (InsideTheProject) tree.
