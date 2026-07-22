# TEST · APP-040: Composer Skills Disable

## Test strategy

- **Rust unit tests** for workspace disable with copy and parent-symlink compensation,
  and for project disable regression.
- **Bun / component tests** optional for popover tip visibility; not required for M1–M5.
- **Manual / agent-browser**: composer + terminal AI Input toggle smoke.

## Coverage map

| PRD | Scenarios |
|-----|-----------|
| M3 | S1 |
| M4 / M5 copy | S2 |
| M5 symlink | S3 |
| M6 | S4 |
| M1 / M2 | S5 |

## Execution map

| ID | Level | Tool | Target | Status |
|----|-------|------|--------|--------|
| S1 | unit | cargo | `core-service` skill tests | pending |
| S2 | unit | cargo | `core-service` skill tests | pending |
| S3 | unit | cargo | `core-service` skill tests | pending |
| S4 | manual | UI | composer popover tip | pending |
| S5 | manual | UI | Welcome + terminal AI Input | pending |

## Scenarios

### S1 — Project disable matches Skills page storage

**Given** a project skill at `<project>/.claude/skills/demo`  
**When** `SkillManager::set_enabled(..., false)`  
**Then** the entry lives under `<project>/.atmos/skills/.disabled/.claude/skills/demo` and scan status is `disabled`.

### S2 — Workspace copy disable is workplace-local

**Given** a copied skill under `<workplace>/.claude/skills/demo`  
**When** workspace `set_enabled(false)` with workplace scope root  
**Then** skill moves to `<workplace>/.atmos/skills/.disabled/...` and project tree is unchanged.

### S3 — Workspace parent-symlink disable does not mutate project

**Given** `<workplace>/.claude` → `<project>/.claude` and skill `demo` under project  
**When** workspace disable for that skill  
**Then** project `demo` still exists; workplace no longer exposes an enabled skill at the original path (entry under workplace `.disabled` as a moved symlink after materialization).

### S4 — New-session tip

**Given** the composer skills popover is open  
**When** the user views it  
**Then** copy states disable applies to new Agent sessions only.

### S5 — Surfaces wired

**Given** Welcome PromptComposer and a workspace terminal AI Input  
**When** the skills control is opened  
**Then** toggleable skills for that context are listed and toggling succeeds.

## Acceptance criteria

- [ ] S1–S3 automated and green
- [ ] M6 tip present in both surfaces
- [ ] Project toggle remains visible/consistent on Skills page after refresh

## Coverage Status

_Updated 2026-07-22_

| ID | Status | Evidence |
|----|--------|----------|
| S1 | pass | `cargo +stable test -p core-service --lib service::skill::tests::project_disable_moves_skill_into_disabled_storage` |
| S2 | pass | `…workspace_copy_disable_is_local_to_workplace` |
| S3 | pass | `…workspace_parent_symlink_disable_does_not_mutate_project` |
| S4 | pending | Manual — composer popover shows `skills.composerDisable.sessionTip` |
| S5 | pending | Manual — Welcome PromptComposer + terminal AI Input skills control |

Regression: `cargo +stable check -p api` green after WS `skills_scan_root` / `skills_set_enabled.scope_root` additions.
