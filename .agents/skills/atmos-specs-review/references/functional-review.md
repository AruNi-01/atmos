# Functional Review Reference

Load this reference when the user asks whether an implementation works, matches the spec, covers Must Have behavior, or is ready from a product/correctness perspective.

## Goal

Find mismatches between the implemented behavior and the spec. Focus on user-visible workflows, API/WS contracts, persistence semantics, run lifecycle behavior, error handling, and test coverage.

## Inputs

- `PRD.md`: user stories, Must Have requirements, explicit out-of-scope items.
- `TECH.md`: data model, module boundaries, WS/REST contracts, command flows, rollout steps, risks.
- `TEST.md`: scenarios, acceptance criteria, coverage map, manual checks.
- `PROGRESS.md` / `REVIEW.md`: implementation state and previous findings, if present.
- Current implementation: code, migrations, frontend flows, command output, and tests.

## Checklist

### PRD coverage

- Every Must Have requirement has an implementation path.
- Each user story has an observable start, success, failure, and recovery state where the PRD implies one.
- Explicit out-of-scope items have not leaked into the implementation.
- Product copy, naming, and default behavior match the PRD.

### TECH contract alignment

- Data model fields, migrations, defaults, and serialization match TECH.
- WS actions/events follow the existing protocol shape and are routed through the intended app layer.
- REST endpoints exist only when TECH justifies them or the module is already REST-based.
- Runtime commands, file paths, and environment assumptions match TECH.
- Remote/local behavior matches the deployment model described in TECH.

### Test plan alignment

- Each TEST.md scenario is covered by an automated test, a documented manual check, or a clear gap.
- Tests assert observable behavior rather than private implementation details.
- Coverage Status in `TEST.md` is accurate after any verification run.
- Known untested paths are named; do not hide them behind broad "covered by smoke test" statements.

### Workflow correctness

- Happy path completes end to end.
- Required failure paths produce visible, actionable errors.
- Resume/recovery behavior is deterministic after service restart or app reload.
- Concurrent operations follow the rules in TECH and do not block unrelated work.
- Cancellation, deletion, disabling, and retry behavior are safe and visible.
- Notifications are emitted only when configured and are not silently dropped in supported contexts.

### Frontend behavior

- Entry points are discoverable in the intended navigation area.
- Empty, loading, running, success, failure, disabled, and permission/error states exist where applicable.
- Forms preserve user input through validation failures.
- UI actions map to the correct API/WS actions and handle optimistic updates carefully.
- Labels and icons communicate status without relying on color alone.

### Persistence and artifacts

- Required metadata is persisted in the intended store.
- Local files are written under the intended user-owned paths.
- Run artifacts are minimal, named consistently, and readable by the UI.
- Cleanup/deletion behavior does not remove unrelated user files.

## Finding shape

Use one finding per broken behavior.

```markdown
## REV-NNN - Missing scheduled retry visibility

| Field | Value |
|-------|--------|
| **Status** | open |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Scheduled runs that fail to start are recorded in the backend, but the UI does not surface the restart action required by the PRD.

### Evidence

- `apps/web/src/features/automations/...:123` - renders failed status but no restart affordance.
- `specs/APP/APP-017_atmos-automations/PRD.md` - M4 requires manual recovery from failed scheduled startup.

### Required fix

Show a header-level warning with an action that re-enables or restarts the automation.

### Acceptance

- [ ] A failed scheduled startup appears in the automation header.
- [ ] The user can restart the automation from that state.
- [ ] Relevant frontend check passes.
```

## Verification suggestions

Choose targeted commands based on the surface:

- Rust service behavior: `cargo test -p core-service <filter> -- --nocapture`
- API compile/WS wiring: `cargo check -p api`
- Web type safety: `bun --cwd apps/web typecheck`
- Web lint for touched files: `bun --cwd apps/web lint <paths>`
- UI behavior: local browser smoke or existing E2E harness if one already exists

Record commands actually run; do not imply full coverage from a compile-only check.
