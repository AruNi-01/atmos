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
rooted at the **current workplace directory**. Tip the user that an already-initialized
Agent session has already baked skills into the system prompt.

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

## Decision

Option A.

## Open questions (resolved)

- Disabled storage path → reuse `.atmos/skills/.disabled` under the active root
  (project root or workplace root), not a separate `.disable` name.
- Symlink vs copy → same move API after optional ancestor materialization.
- Session tip → always shown in the composer skills popover.
