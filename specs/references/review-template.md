# REVIEW.md Template

Use this template only when creating or substantially refreshing a spec-level `REVIEW.md`.

````markdown
# REVIEW · <SPEC-ID>: <Title> - Implementation Review

> Post-implementation review log for functional completeness, architecture, maintainability, code size, testability, and follow-up fixes. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: YYYY-MM-DD  
**Review scope**: functional review | quality review | implementation review | architecture review | maintainability review | performance review | security review  
**Related code**: `path/to/code`, `path/to/code`

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After code implementation reaches review or post-review and the findings need durable tracking before cleanup. |
| **Entry id** | `REV-NNN` - zero-padded, monotonic in this file (next: **REV-001**). |
| **Status** | `open` -> `in_progress` -> `fixed` -> `verified` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH/TEST content; link to baseline docs and record only review findings plus fix status. |
| **Fix proof** | Each fixed item should name the code change and the verification command or manual check. |

### Entry template (copy for new findings)

```markdown
## REV-NNN · Short title

| Field | Value |
|-------|--------|
| **Status** | open \| in_progress \| fixed \| verified \| wont-fix |
| **Severity** | P0 \| P1 \| P2 \| P3 |
| **Area** | backend \| frontend \| api \| infra \| test \| docs |
| **Reported by** | internal review \| user review \| code review |
| **Owner** | unassigned |

### Finding

...

### Evidence

- `path/to/file.rs:123` - ...

### Required fix

...

### Acceptance

- [ ] ...

### Fix log

- YYYY-MM-DD - ...
```

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|

---

## REV-NNN · Short title

| Field | Value |
|-------|--------|
| **Status** | open \| in_progress \| fixed \| verified \| wont-fix |
| **Severity** | P0 \| P1 \| P2 \| P3 |
| **Area** | backend \| frontend \| api \| infra \| test \| docs |
| **Reported by** | internal review \| user review \| code review |
| **Owner** | unassigned |

### Finding

...

### Evidence

- `path/to/file.rs:123` - ...

### Required fix

...

### Acceptance

- [ ] ...

### Fix log

- YYYY-MM-DD - ...
````
