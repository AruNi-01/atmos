# IMPROVEMENT.md Template

Use this template only when creating or substantially refreshing a spec-level `IMPROVEMENT.md`.

````markdown
# IMPROVEMENT · <SPEC-ID>: <Title> — Operational Log

> Living record of production issues, quality gaps, mitigations shipped, and follow-ups. Complements the frozen planning quartet ([BRAINSTORM](./BRAINSTORM.md) → [PRD](./PRD.md) → [TECH](./TECH.md) → [TEST](./TEST.md)); does not replace them.

**Related code**: `path/to/code`, `path/to/skill-or-doc`

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After fixing a user-reported bug, reliability issue, quality regression, agent ergonomics gap, or deliberate product parity gap. |
| **Entry id** | `IMP-NNN` — zero-padded, monotonic in this file (next: **IMP-001**). |
| **Status** | `open` → `mitigated` → `closed` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH sections; link to TECH/PRD and paste only deltas. |
| **Versions** | If agent-facing behavior changes, note the relevant Skill / CLI / runtime version in the entry. |

### Entry template (copy for new issues)

```markdown
## IMP-NNN · Short title

| Field | Value |
|-------|--------|
| **Date** | YYYY-MM-DD |
| **Status** | open \| mitigated \| closed \| wont-fix |
| **Reported by** | user \| agent \| internal review |
| **Severity** | crash \| reliability \| data-loss \| security \| performance \| ergonomics \| docs |

### Problem
...

### Root cause
...

### Solution
...

### Result
...

### Code / docs touched
- ...

### Follow-ups
- [ ] ...
```

---

## Index

| Id | Title | Status | Date |
|----|-------|--------|------|

---

## IMP-NNN · Short title

| Field | Value |
|-------|--------|
| **Date** | YYYY-MM-DD |
| **Status** | open \| mitigated \| closed \| wont-fix |
| **Reported by** | user \| agent \| internal review |
| **Severity** | crash \| reliability \| data-loss \| security \| performance \| ergonomics \| docs |

### Problem

...

### Root cause

...

### Solution

...

### Result

...

### Code / docs touched

- ...

### Follow-ups

- [ ] ...
````
