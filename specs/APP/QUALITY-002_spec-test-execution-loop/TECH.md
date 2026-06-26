# QUALITY-002 Spec Test Execution Loop

## Status

- Date: 2026-06-26
- Scope: specs lifecycle guidance and spec-related agent skills
- Goal: make Atmos spec implementation verifiable with a repeatable loop: TEST.md plan -> production implementation -> executable test-run -> optional agent-browser exploration -> Coverage Status

## Problem

Atmos specs already had `TEST.md` and a separate `atmos-specs-test-run` skill, but the workflow left too much room for an agent to stop after implementation with only ad hoc regression checks. Several specs also named Playwright as an intended E2E layer even though the repository's active test stack is currently Rust `cargo test` plus Bun test, with no committed Playwright harness.

The result was a gap between "code appears implemented" and "the spec's completion criteria were proven by runnable checks."

## Design

### TEST.md becomes the verification contract

New and refreshed `TEST.md` files should include:

- `Test strategy`
- `Coverage map`
- `Execution map`
- `Scenarios`
- `Exploratory agent-browser checks`
- `Regression checklist`
- `Acceptance criteria`
- `Manual verification steps`
- `Non-coverage`
- `Coverage Status`

The `Execution map` is the key addition. It maps each scenario to the expected tool, target command or method, fixture/data, observable signals, and current status.

### Tool responsibilities

| Layer | Role |
|-------|------|
| Rust tests | Business rules, DB/repo behavior, WS/service contracts, backend edge cases |
| Bun tests | Frontend store/hooks/lib behavior, mobile client logic, shared TS utilities |
| Service/API tests | WS action routing, DTO normalization, authorization, cross-layer behavior |
| Playwright/E2E | Future committed harness for a few core user journeys; not assumed to exist |
| agent-browser | Exploratory UI/workflow smoke checks through Vercel Agent Browser (`agent-browser`): copy, layout, responsive behavior, console/network failures, recovery flows |
| Manual | External services or OS/device states that remain too expensive to automate |

### Agent-browser boundary

`agent-browser` is intentionally not a pass/fail oracle for business correctness. It should be used after executable checks, or when E2E harness coverage is missing, to explore:

- obvious broken UI states
- copy that is unclear or misleading
- mobile viewport clipping or overlap
- stale loading/error states
- failed network/WS calls visible from the browser
- workflow rough edges scripted tests did not anticipate

It must not replace automated assertions for data integrity, authorization, persistence, concurrency, or transport contracts.

Before running these checks, the test-run agent must read and follow the installed `agent-browser` skill, or run `agent-browser skills get core --full` to load the current CLI-served instructions. If the `agent-browser` CLI/skill is not available in the session, the check is recorded as `not_run` with the reason.

### Implementation lifecycle

The updated lifecycle is:

```text
BRAINSTORM -> PRD -> TECH -> TEST -> implement -> test-run / agent-browser -> ship
```

After `atmos-specs-impl`, a complete spec implementation should either:

- run `atmos-specs-test-run` for the unlocked scenarios and update `TEST.md` Coverage Status, or
- explicitly report `implemented, awaiting test-run` with the scenario hand-off and any blocked verification.

## Files Changed

- `specs/AGENTS.md`
- `.agents/skills/atmos-specs-test-plan/SKILL.md`
- `.agents/skills/atmos-specs-test-run/SKILL.md`
- `.agents/skills/atmos-specs-impl/SKILL.md`
- `specs/references/agent-browser-setup.md`
- `specs/APP/QUALITY-002_spec-test-execution-loop/TECH.md`
- `specs/APP/QUALITY-002_spec-test-execution-loop/TEST.md`
- `specs/README.md`

## Verification Commands

```bash
rg -n "Execution map|Exploratory agent-browser checks|Coverage Status" specs/AGENTS.md .agents/skills/atmos-specs-test-plan/SKILL.md
rg -n "agent-browser|agent-browser skills get core --full|Coverage Status" .agents/skills/atmos-specs-test-run/SKILL.md .agents/skills/atmos-specs-impl/SKILL.md specs/AGENTS.md
rg -n "Agent Browser|agent-browser install|npx skills add vercel-labs/agent-browser|doctor" specs/references/agent-browser-setup.md
rg -n "QUALITY-002" specs/README.md specs/APP/QUALITY-002_spec-test-execution-loop
git diff --check
```

## Risks

- Existing older specs will not automatically gain an `Execution map`; refresh them opportunistically when work resumes.
- Agent-browser checks can become vague if TEST.md does not specify route, fixture/data, viewport, and expected observations.
- Playwright should remain a future explicit harness decision, not a silent dependency added by a test-run pass.

## Follow-Ups

- Refresh high-priority active specs to the new TEST.md shape before their next implementation pass.
- Add a committed browser E2E harness only through a dedicated TECH/TEST plan.
- Consider adding a lint/check script later that flags new TEST.md files missing `Execution map` or `Coverage Status`.
