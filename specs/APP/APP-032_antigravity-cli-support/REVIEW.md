# REVIEW · APP-032: Antigravity CLI Support - Implementation Review

> Post-implementation review log for functional completeness, architecture, maintainability, code size, testability, and follow-up fixes. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: 2026-07-04  
**Review scope**: functional review | quality review  
**Related code**: [antigravity.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/crates/core-engine/src/agent_hooks/antigravity.rs), [antigravity.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/crates/core-service/src/service/agent_hooks/antigravity.rs), [runtime.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/crates/ai-usage/src/runtime.rs), [antigravity.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/crates/ai-usage/src/providers/antigravity.rs)

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After code implementation reaches review or post-review and the findings need durable tracking before cleanup. |
| **Entry id** | `REV-NNN` - zero-padded, monotonic in this file (next: **REV-003**). |
| **Status** | `open` -> `in_progress` -> `fixed` -> `verified` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH/TEST content; link to baseline docs and record only review findings plus fix status. |
| **Fix proof** | Each fixed item should name the code change and the verification command or manual check. |

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P2 | backend | Silent failure to write hooks if hooks.json is not an object | open |
| REV-002 | P2 | test | Scenario-3 test gap in core-engine | open |

---

## REV-001 · Silent failure to write hooks if hooks.json is not an object

| Field | Value |
|-------|--------|
| **Status** | open |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

If the user's `~/.gemini/antigravity-cli/hooks.json` file is empty or corrupted such that it parses as a non-object JSON value (e.g., a list or a string), `antigravity::install` will silently skip inserting the hook and return success.

### Evidence

- [antigravity.rs:93-95](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/crates/core-engine/src/agent_hooks/antigravity.rs#L93-L95):
  ```rust
  let new_atmos_namespace = build_atmos_hook_namespace(port);
  if let Some(config_obj) = hooks_config.as_object_mut() {
      config_obj.insert("atmos".to_string(), new_atmos_namespace);
  }
  ```

### Required fix

Ensure `hooks_config` is forced to a valid JSON object (resetting it to `json!({})` if it isn't one) prior to inserting the `atmos` hook namespace.

### Acceptance

- [ ] Non-object structures in `hooks.json` are auto-reset/converted to objects during installation.
- [ ] Atmos hooks namespace is successfully written to the file.

### Fix log

- 2026-07-04 - Pending implementation.

---

## REV-002 · Scenario-3 test gap in core-engine

| Field | Value |
|-------|--------|
| **Status** | open |
| **Severity** | P2 |
| **Area** | test |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`TEST.md` Scenario-3 specifies that we verify checking, installing, and uninstalling the hook triggers via `cargo test --package core-engine`. However, no unit tests were implemented for the `antigravity` hook manager under the `core-engine` package.

### Evidence

- [TEST.md:16](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/specs/APP/APP-032_antigravity-cli-support/TEST.md#L16)
- Absence of unit tests in [antigravity.rs](file:///Users/aarynlu/.gemini/antigravity/worktrees/atmos/add-antigravity-cli-support/crates/core-engine/src/agent_hooks/antigravity.rs).

### Required fix

Add a `tests` module to `crates/core-engine/src/agent_hooks/antigravity.rs` to mock the configuration path and verify `install`, `check`, and `uninstall` functionality.

### Acceptance

- [ ] Test coverage for checking, installing, and uninstalling hooks inside `core-engine`.
- [ ] Tests run and pass via `cargo test`.

### Fix log

- 2026-07-04 - Pending implementation.
