# PROGRESS.md Template

Use this template only when creating or substantially refreshing a spec-level `PROGRESS.md`.

```markdown
# PROGRESS · <SPEC-ID>: <Title>

> Implementation Progress · current state, handoff notes, blockers, and verification status. This file is not a requirements source.

## Status

- **State**: not_started | in_progress | blocked | ready_for_review | shipped
- **Branch**: ...
- **Last updated**: YYYY-MM-DD
- **Current owner**: ...
- **Current phase**: schema | service | api | web | tests | review

## Snapshot

Short current-state summary:
- what is done
- what is next
- what is blocked
- what must not be touched

## Implementation Checklist

- [ ] Infra migration/entities/repos
- [ ] Core service logic
- [ ] API / WebSocket routing
- [ ] Web UI
- [ ] Tests
- [ ] Manual verification

## Progress Log

### YYYY-MM-DD

- Completed ...
- Changed ...
- Verified ...
- Blocked by ...

## Decisions Since TECH

| ID | Decision | Why | Source update |
|----|----------|-----|---------------|
| D1 | ... | ... | Updated TECH.md section ... |

## Verification Status

| Area | Command / Method | Last result | Notes |
|------|------------------|-------------|-------|
| Rust tests | `cargo test ...` | not_run | ... |
| Web tests | `bun test ...` | not_run | ... |
| E2E / manual | Playwright/manual | not_run | ... |

## Known Blockers

- [ ] ...

## Handoff Notes

> Follow [`agents/references/compact-instructions.md`](../../../agents/references/compact-instructions.md). Keep this section compact, current, and implementation-oriented.

### Task goal

...

### Current progress

...

### Completed work

...

### Key decisions

...

### Constraints

...

### Open issues

...

### Next steps

...

### Relevant files/symbols

...

## Changed Areas

- `crates/infra`: ...
- `crates/core-service`: ...
- `apps/api`: ...
- `apps/web`: ...
```
