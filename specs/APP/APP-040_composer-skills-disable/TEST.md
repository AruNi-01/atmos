# TEST · APP-040: Composer Skills Disable

## Test strategy

- **Rust unit tests** for workspace disable with copy and parent-symlink compensation,
  project disable regression, and live-path `SKILL_DISABLED.md` marker behavior.
- **Bun / component tests** optional for popover tip / slash command wiring; not required for M1–M5.
- **Manual / agent-browser**: Dynamic Skills slash morph + toggle smoke on Welcome and terminal.

## Coverage map

| PRD | Scenarios |
|-----|-----------|
| M3 / M8 | S1 |
| M4 / M5 copy / M8 | S2 |
| M5 symlink / M8 | S3 |
| M6 | S4 |
| M1 / M2 | S5 |
| N3 | S6 |

## Execution map

| ID | Level | Tool | Target | Status |
|----|-------|------|--------|--------|
| S1 | unit | cargo | `core-service` skill tests | pass |
| S2 | unit | cargo | `core-service` skill tests | pass |
| S3 | unit | cargo | `core-service` skill tests | pass |
| S4 | manual | UI | Dynamic Skills popover tip | pending |
| S5 | manual | UI | Welcome + terminal `/` Dynamic Skills | pending |
| S6 | manual | UI | `/` skill list Disabled badge | pending |

## Scenarios

### S1 — Project disable matches Skills page storage + marker

**Given** a project skill at `<project>/.claude/skills/demo`  
**When** `SkillManager::set_enabled(..., false)`  
**Then** the real entry lives under `<project>/.atmos/skills/.disabled/.claude/skills/demo`,  
live path has `<project>/.claude/skills/demo/SKILL_DISABLED.md` and **no** `SKILL.md`,  
and scan status is `disabled`.  
**When** enabled again  
**Then** `SKILL.md` is restored and `SKILL_DISABLED.md` is gone.

**Signals**: unit assertions on both `.disabled` path and live marker path.

### S2 — Workspace copy disable is workplace-local + marker

**Given** a copied skill under `<workplace>/.claude/skills/demo`  
**When** workspace `set_enabled(false)` with workplace scope root  
**Then** skill moves to `<workplace>/.atmos/skills/.disabled/...`, project tree is unchanged,  
and workplace live path keeps `SKILL_DISABLED.md` without `SKILL.md`.

### S3 — Workspace parent-symlink disable does not mutate project

**Given** `<workplace>/.claude` → `<project>/.claude` and skill `demo` under project  
**When** workspace disable for that skill  
**Then** project `demo/SKILL.md` still exists and project has **no** `SKILL_DISABLED.md`;  
workplace no longer exposes `SKILL.md` at the live path; workplace has `SKILL_DISABLED.md`;  
disabled storage holds the moved workplace entry (after materialization).

### S4 — Dynamic visibility tip

**Given** the Dynamic Skills popover is open  
**When** the user views it  
**Then** copy describes dynamic skill visibility / current-session entrypoint effect  
(not “new Agent session only”).

### S5 — Surfaces wired via `/` Dynamic Skills

**Given** Welcome PromptComposer and a workspace terminal AI Input  
**When** the user runs `/` → **Dynamic Skills**  
**Then** the popover morphs to the disable list for that context and toggling succeeds.

### S6 — Disabled skills in slash insert list

**Given** a disabled manageable skill exists in context  
**When** the user opens `/` skill insert list  
**Then** the skill may still appear with a Disabled badge and cannot be selected as a skill chip.

## Acceptance criteria

- [x] S1–S3 automated and green
- [ ] M6 tip present on Dynamic Skills surfaces (current-session wording)
- [ ] `/` Dynamic Skills wired on Welcome + terminal
- [ ] Project toggle remains visible/consistent on Skills page after refresh
- [ ] S6: disabled skills in the slash insert list show a Disabled badge and cannot be selected as skill chips

## Coverage Status

_Updated 2026-07-22_

| ID | Status | Evidence |
|----|--------|----------|
| S1 | pass | `cargo +stable test -p core-service --lib skill::tests::project_disable_moves_skill_into_disabled_storage` |
| S2 | pass | `…workspace_copy_disable_is_local_to_workplace` |
| S3 | pass | `…workspace_parent_symlink_disable_does_not_mutate_project` |
| S4 | pending | Manual — `skills.composerDisable.sessionTip` / Dynamic Skills title |
| S5 | pending | Manual — `/` command id `dynamic-skills` on Welcome + terminal |
| S6 | pending | Manual — Disabled badge non-selectable in slash skills list |

Regression: `cargo +stable check -p api` green after WS `skills_scan_root` / `skills_set_enabled.scope_root` additions; skill unit suite green after `SKILL_DISABLED.md` marker + macOS path-prefix materialize fix.
