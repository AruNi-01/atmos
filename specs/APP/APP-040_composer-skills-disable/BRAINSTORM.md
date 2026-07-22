# BRAINSTORM · APP-040: Composer Skills Disable

## Problem

Users who want to temporarily hide skills from an Agent must leave the PromptComposer /
terminal AI Input, open the Skills management page, toggle there, then start a **new**
Agent session. In a workspace worktree the problem is worse: skills often arrive via
Settings → sync dirs (symlink or copy), so a project-level disable is the wrong scope
and may not match what the Agent running in that worktree actually discovers.

## Goal (draft)

Add a dynamic enable/disable control for skills directly in:

1. Welcome / PromptComposer (project-oriented create flow)
2. Terminal AI Input overlay

Behavior must match the Skills management page’s move-to-`.atmos/skills/.disabled`
mechanism for Project, and reuse that same move for Workspace with the disabled storage
rooted at the **current workplace directory**. Because Atmos does not own Agent Runtime,
mid-session effect relies on filesystem entrypoint removal (no `SKILL.md` at the live
path) plus an optional live-path marker file Agents will not treat as a skill.

## Options

### Option A — Reuse SkillManager move + add workspace scope root (chosen)

- Project: call existing `skills_set_enabled`; Skills page and composer stay in sync.
- Workspace: scan/manage skills under the workplace path; store disabled entries under
  `workplace/.atmos/skills/.disabled/...`.
- Symlink sync dirs: if a parent agent dir is a compensated symlink into the project,
  materialize that ancestor into per-child symlinks first so the move only affects the
  workplace. Copy sync dirs: move the local copy as-is.

**Pros**: one disable mechanism; Agents stop discovering the skill the same way.
**Cons**: materialization is a one-way local edit of the compensated tree shape.

### Option B — Session-only “ignore skills” list in Atmos prompt injection

Keep files on disk; strip skill names from Atmos-owned prompts.

**Pros**: no filesystem mutation.
**Cons**: does not stop terminal Agents that load skills themselves; diverges from Skills page.

### Option C — Live-path `SKILL.md` stub / tombstone (rejected as permanent stub)

Leave a real `SKILL.md` at the original path with “disabled” copy so current sessions
that re-read the file see a ban message.

**Pros**: current-session Read path may see explicit ban text.
**Cons**: next Agent scan still discovers the skill (pollutes discovery). Permanent stub
is not worth it.

### Option D — Move to `.disabled` + live-path `SKILL_DISABLED.md` marker (chosen add-on)

After moving the full skill tree into `.disabled`, recreate the original skill directory
with only `SKILL_DISABLED.md` (never `SKILL.md`).

**Pros**: new sessions do not discover the skill (no `SKILL.md`); current sessions that
try to open `SKILL.md` get not-found; marker is human/Atmos-readable; no Agent Runtime
hooks required.
**Cons**: not a hard Runtime gate; models that ignore missing entrypoints or read other
cached copies can still misbehave.

## Decision

Option A + Option D.

## Open questions (resolved)

- Disabled storage path → reuse `.atmos/skills/.disabled` under the active root
  (project root or workplace root), not a separate `.disable` name.
- Symlink vs copy → same move API after optional ancestor materialization.
- Mid-session tip → describe dynamic visibility / current-session entrypoint effect; do
  **not** claim “new session only”.
- Live marker filename → `SKILL_DISABLED.md` (not `SKILL.md`, not `DISABLE_SKILL.md`).
- Composer entry → `/` slash command **Dynamic Skills** (morph popover), not a standalone
  Skills footer button.
