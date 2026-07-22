# PRD · APP-040: Composer Skills Disable

## Summary

Users can enable/disable Agent skills from PromptComposer and the terminal AI Input
via a `/` slash command (**Dynamic Skills**), using the same filesystem disable
mechanism as the Skills management page, plus a live-path `SKILL_DISABLED.md` marker.
Project toggles stay in sync with that page. Workspace toggles apply only under the
current workplace directory (where sync dirs land). Toggles change Agent-visible skill
entrypoints immediately: the real skill tree leaves discovery paths, and the live path
no longer has `SKILL.md`.

## Users & jobs

- **Project operator** on Welcome / PromptComposer: quickly mute noisy project skills
  before or while working with Agents, without opening Skills.
- **Workspace operator** in a terminal AI Input: mute skills that were synced into the
  worktree (symlink or copy) for this workplace only.

## Must Have

| ID | Requirement |
|----|-------------|
| M1 | PromptComposer exposes Dynamic Skills via the `/` slash command for manageable skills visible in the current project context. |
| M2 | Terminal AI Input exposes the same `/` Dynamic Skills command. In a project terminal it uses project disable; in a workspace terminal it uses workplace-rooted disable. |
| M3 | Project disable/enable uses Skills Manager move into `project/.atmos/skills/.disabled/...`, stays consistent with the Skills management page, and leaves `SKILL_DISABLED.md` at the original skill directory while disabled. |
| M4 | Workspace disable/enable reuses the same move logic with storage under `workplace/.atmos/skills/.disabled/...`, and the same live-path `SKILL_DISABLED.md` marker under the workplace. |
| M5 | Sync-dir symlink and copy placements can both be disabled by moving the workplace-visible skill entry into `.disabled` so Agents no longer discover `SKILL.md`. Parent compensated symlinks are materialized as needed so the move does not mutate the project tree. |
| M6 | UI copy describes **dynamic skill visibility** that takes effect for the **current session** (entrypoint / discovery), not “new session only”. Tip may still note that Agents do not provide a Runtime API and residual in-memory catalogs are best-effort. |
| M7 | Global skills remain toggleable where `can_toggle` is true (same as Skills page). System / InsideTheProject skills stay non-toggleable. |
| M8 | Enable removes the live-path `SKILL_DISABLED.md` marker (and empty placeholder directory) before restoring the skill from `.disabled`. |

## Nice to Have

| ID | Requirement |
|----|-------------|
| N1 | Show disabled skills in the Dynamic Skills popover so they can be re-enabled without visiting Skills. |
| N2 | After a toggle, refresh slash-command skill lists that are already open. |
| N3 | Disabled skills may still appear in the `/` skill-insert list, but are not selectable and show a Disabled badge. |

## Success metrics

- Project toggle from composer updates Skills page status after refresh without a second API.
- Workspace toggle leaves project skill files untouched when the workplace entry was a compensated symlink/copy.
- After disable, live path has `SKILL_DISABLED.md` and no `SKILL.md`; after enable, `SKILL.md` is restored and the marker is gone.
- Users see Dynamic Skills copy that matches current-session entrypoint behavior.

## Out of scope

- Rewriting Agent Runtime internals or injecting per-Agent hooks to purge in-memory skill catalogs.
- Guaranteeing a model will never mention a skill whose metadata was already baked into an earlier prompt turn.
- Cloud-synced disable state across machines.
- Disabling skills inside the read-only `skills/` (InsideTheProject) tree.

## Post-Implementation Update · 2026-07-22

- Entry UX moved from a standalone footer Skills control to `/` command **Dynamic Skills**
  with a morphing disable popover.
- Filesystem contract extended: `.disabled` storage remains source of truth; live path
  keeps `SKILL_DISABLED.md` only (never a `SKILL.md` stub).
- M6 reframed from “new session only” to “dynamic visibility / current-session entrypoint”.
