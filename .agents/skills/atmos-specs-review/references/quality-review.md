# Quality Review Reference

Load this reference when the user asks for architecture, maintainability, code size, testability, reliability, security, performance, or non-functional review after implementation.

## Goal

Find design and maintenance risks that make the implementation hard to extend, hard to test, brittle across layers, or likely to regress. This review complements functional correctness; it should not rewrite product scope.

## Inputs

- `TECH.md`: intended architecture, layer boundaries, data ownership, risks.
- `TEST.md`: verification expectations and regression gates.
- `REVIEW.md`: prior review findings and status, if present.
- Current code: module layout, public APIs, event types, state stores, tests, migrations, and build/resource wiring.

## Checklist

### Layering and ownership

- Dependency direction follows Atmos conventions: `infra -> core-engine -> core-service -> apps/api -> apps/web`.
- Business rules live in `core-service`, not `apps/api` handlers or frontend stores.
- Inbound browser WS protocol parsing and routing stay in `apps/api`.
- Shared JS packages are used for genuinely reusable code, not feature-local components.
- Feature-specific backend code is grouped under a coherent module instead of being scattered across the crate.

### Duplication and drift

- Agent catalogs, command templates, status enums, and protocol names have one source of truth.
- Frontend and backend status values are generated, shared, or tightly mapped; no untracked stringly-typed drift.
- Migrations, DTOs, and UI assumptions agree on nullability and defaults.
- Constants for filesystem roots, artifact names, and schedule limits are centralized at the right layer.

### Code size and module shape

- New modules have clear responsibilities and short public surfaces.
- No "manager" or "service" object owns scheduling, persistence, command construction, notification, and UI DTO formatting all at once.
- Long functions are split only when the split clarifies a real domain step.
- Abstractions are justified by reuse, complexity reduction, or established local pattern.

### Testability

- Time, filesystem, process spawning, and notification edges can be faked or isolated.
- Scheduler/recovery logic can be tested without real wall-clock waiting.
- CLI command construction is testable without launching a real agent.
- Tests cover invariants at the layer that owns them; UI tests do not compensate for missing service tests.

### Reliability and recovery

- Startup recovery handles incomplete runs deterministically.
- Locks prevent duplicate starts for the same automation without blocking unrelated automations.
- Partial writes use atomic or otherwise recoverable file behavior where corruption would matter.
- Long-running background tasks have clear cancellation/drop behavior.
- Error paths preserve enough context for the user and logs without leaking secrets.

### Security and privacy

- User prompts, memory, artifacts, and logs stay in the documented local paths.
- Secrets are not written to specs, logs, command files, or frontend-visible payloads.
- Shell command construction avoids accidental injection through names, paths, or user prompts.
- File deletion and cleanup are scoped to automation-owned directories.

### Performance and scale

- Startup does not scan large directory trees when a database query or small manifest would do.
- Lists and dashboards page, filter, or cap expensive data where needed.
- Scheduler loops are event-driven or bounded; they do not busy-wait.
- Frontend subscriptions avoid redundant renders or unbounded memory growth.

### Spec and code drift

- If implementation intentionally differs from TECH, TECH is updated in the same change.
- If acceptance changed, TEST.md is updated.
- If findings were fixed, `REVIEW.md` entries include proof and accurate status.

## Finding shape

Use one finding per maintainability risk. Avoid vague comments like "this is complex"; state the concrete failure mode.

```markdown
## REV-NNN - Duplicate agent command catalog can drift

| Field | Value |
|-------|--------|
| **Status** | open |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Automation command construction maintains a separate built-in agent catalog instead of reusing the existing terminal agent manifest, so third-party command changes can silently break automation runs.

### Evidence

- `crates/core-service/src/service/automation_agents.rs:1` - duplicates command defaults.
- `resources/terminal-agents/builtin_agents.json` - existing source of truth.

### Required fix

Build automation non-interactive commands from the shared terminal agent manifest and append automation-specific flags only at the boundary.

### Acceptance

- [ ] One source of truth remains for built-in agent command metadata.
- [ ] Automation-specific non-interactive args are layered on top in tests.
- [ ] Relevant Rust tests pass.
```

## Anti-patterns to flag

- A second source of truth created for "just automation".
- Feature code extracted into `packages/shared` without cross-app reuse.
- API handlers formatting domain state that should come from `core-service`.
- UI stores that reconstruct backend state machines from loose events.
- Background tasks that infer process state only from stale in-memory maps.
- Review fixes that add configuration surfaces not requested by PRD or TECH.

## Verification suggestions

Choose targeted commands based on risk:

- Architecture or Rust module changes: `cargo check -p <crate>` and targeted `cargo test -p <crate> <filter>`
- API boundary changes: `cargo check -p api`
- Frontend type/state changes: `bun --cwd apps/web typecheck`
- Frontend lint for touched feature: `bun --cwd apps/web lint <paths>`
- Resource/schema changes: targeted tests that parse the resource and validate defaults

For quality findings, explain why the command proves the acceptance condition. A green compile is not proof that an architecture issue is fixed.
