---
name: atmos-specs-review
description: Review an implemented Atmos spec and write or update `specs/<ZONE>/<ZONE>-NNN_.../REVIEW.md` with actionable post-implementation findings. Use this whenever the user asks to review whether a spec implementation is complete, ready to ship, functionally correct, aligned with PRD/TECH/TEST, or architecturally maintainable. Choose the functional review reference, quality review reference, or both based on the user's wording; if the request is ambiguous or asks for release readiness, use both.
user-invokable: true
args:
  - name: spec_id
    description: Spec identifier, e.g. `APP-017` or `APP-017_atmos-automations`. Required.
    required: true
  - name: mode
    description: Optional review mode: `functional`, `quality`, or `both`. Infer from the user request when omitted.
    required: false
---

# Atmos Specs Review

This skill turns a post-implementation review into durable, actionable `REVIEW.md` entries. It is for checking shipped code against a spec and recording fix status; it is not a requirements-writing skill and it does not implement fixes unless the user explicitly asks to continue into implementation.

## Mode selection

Pick the smallest review mode that answers the user's request.

| User asks for... | Load |
|------------------|------|
| Functionality, completeness, spec coverage, PRD/TECH/TEST alignment, behavior, acceptance, regressions, user flows | [`references/functional-review.md`](./references/functional-review.md) |
| Architecture, maintainability, code size, layering, duplication, testability, reliability, security, performance, "non-functional" quality | [`references/quality-review.md`](./references/quality-review.md) |
| "review it", "is this done", "ready to ship", "functionality and code quality", or anything ambiguous after implementation | Both references |

If the user asks to fix existing `REVIEW.md` findings rather than review, read `REVIEW.md` first, update statuses as you work, and use the relevant reference only to validate that the fixes are complete.

## Read order

1. Root `AGENTS.md` for repository architecture, transport rules, and workflow.
2. `specs/AGENTS.md` for `REVIEW.md` conventions and template location.
3. The target spec directory:
   - `PRD.md` for product intent and Must Have scope.
   - `TECH.md` for the intended architecture and contracts.
   - `TEST.md` for acceptance scenarios and coverage expectations.
   - `REVIEW.md` if it exists, to preserve prior findings and statuses.
   - `PROGRESS.md` if it exists, for implementation handoff facts.
4. Package-level `AGENTS.md` files for every code area you inspect.
5. The current implementation: git diff, touched files, tests, and nearby existing patterns.

For `QUALITY-*` specs, `TECH.md` and `TEST.md` are enough unless `PRD.md` / `BRAINSTORM.md` exist.

## Workflow

### 1. Resolve scope

- Resolve `spec_id` to exactly one directory under `specs/`.
- Confirm whether the review is `functional`, `quality`, or `both`.
- Identify the implementation surface from `TECH.md`, `PROGRESS.md`, existing `REVIEW.md`, and `git diff --name-only`.
- Do not assume a file is in scope just because it is dirty; separate unrelated user changes from the reviewed implementation.

### 2. Inspect before writing findings

- Read the relevant reference checklist(s) on demand.
- Map findings to evidence: files, functions, WS actions, tests, UI flows, or command output.
- Prefer source-backed findings over speculation. If a risk is inferential, label it as an inference and name the missing proof.
- Run targeted verification only when it is cheap and directly answers a review question. Do not run broad suites just to look busy.

### 3. Review stance

Report findings first, ordered by severity. Use this severity scale:

| Severity | Meaning |
|----------|---------|
| P0 | Release blocker: data loss, security exposure, crash loop, migration corruption, or cannot start core workflow |
| P1 | Must fix before merge/ship: required spec behavior missing, serious reliability hole, broken API contract, or high-maintenance architecture |
| P2 | Should fix soon: maintainability, testability, edge-case, or UX issue with bounded impact |
| P3 | Polish or follow-up: useful cleanup that should not block the current delivery |

Do not pad the review. If there are no findings for a mode, say so and note any verification gaps.

### 4. Write or update REVIEW.md

When durable findings exist:

- Create `REVIEW.md` from `specs/references/review-template.md` if missing.
- Use monotonic `REV-NNN` ids within the file.
- Keep the index table current.
- Each entry must include:
  - Status: `open`, `in_progress`, `fixed`, `verified`, or `wont-fix`.
  - Severity and area.
  - Finding: one concrete problem.
  - Evidence: source path and line, command result, or observable behavior.
  - Required fix: what change is expected.
  - Acceptance: how to prove it is fixed.
  - Fix log: code/doc changes and verification commands after fixes land.
- Do not duplicate PRD/TECH/TEST. Link to those files when the baseline matters.

When no durable findings exist, do not create an empty `REVIEW.md` unless the user explicitly asked for a review log.

### 5. Handling fixes

If the user asks to fix review findings in the same turn:

1. Mark selected entries `in_progress`.
2. Implement the smallest fix that satisfies the entry acceptance.
3. Run the relevant verification.
4. Update the entry fix log.
5. Mark `fixed` after code is changed, and `verified` only after the named check passes.

If the fix changes product scope, stop and update `PRD.md` first. If it changes technical contracts, update `TECH.md`. If it changes acceptance coverage, update `TEST.md`.

### 6. Final report

Use the user's language for the final response. Keep it concise and include:

- Review mode used.
- Findings count by severity.
- `REVIEW.md` entries created or updated.
- Verification commands run and results.
- Remaining risks or verification gaps.

When findings are present, lead with them. When no findings are present, state that clearly and list residual test gaps.

## Common mistakes to avoid

- Writing only a chat summary and failing to update `REVIEW.md` when findings need tracking.
- Treating `REVIEW.md` as a new requirements source. Requirements stay in `PRD.md`, architecture in `TECH.md`, acceptance in `TEST.md`.
- Mixing functional correctness and architecture quality into one vague finding. Split them so fixes are accountable.
- Marking an entry `verified` because the code "looks right". Verification requires a command or explicit manual check.
- Creating broad abstractions while fixing a review item. The review should reduce risk and complexity, not expand scope.
