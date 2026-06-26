# QUALITY-002 Spec Test Execution Loop Test Plan

## Status

- Date: 2026-06-26
- Scope: docs and agent-skill verification for the spec test execution loop
- Objective: prove the workflow documentation consistently defines TEST.md execution mapping, post-implementation test-run, and agent-browser exploratory verification

## Test Strategy

- **Documentation audit**: grep the updated specs guide and skills for required sections and terminology.
- **Skill contract audit**: confirm `test-plan`, `test-run`, and `impl` describe distinct responsibilities and do not make agent-browser a substitute for executable tests.
- **Manual review**: read the rendered Markdown sections for lifecycle clarity and stale section references.

## Coverage Map

| Requirement | Scenario IDs |
|-------------|--------------|
| TEST.md has an execution-oriented structure | S1, S2 |
| Implementation hands off to test-run after production code | S3 |
| agent-browser is integrated but bounded | S4, S5 |
| Existing repo test stack remains authoritative | S6 |

## Execution Map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Documentation audit | `rg` | `rg -n "Execution map|Coverage Status" specs/AGENTS.md .agents/skills/atmos-specs-test-plan/SKILL.md` | updated docs | both docs mention execution map and coverage status | planned |
| S2 | Documentation audit | `rg` | `rg -n "Exploratory agent-browser checks" .agents/skills/atmos-specs-test-plan/SKILL.md` | updated skill | test-plan template includes exploratory checks | planned |
| S3 | Skill contract audit | `rg` + manual review | `rg -n "test-run|implemented, awaiting test-run|Test hand-off" .agents/skills/atmos-specs-impl/SKILL.md` | updated impl skill | impl skill requires test-run hand-off after production code | planned |
| S4 | Skill contract audit | `rg` + manual review | `rg -n "agent-browser|agent-browser skills get core --full" .agents/skills/atmos-specs-test-run/SKILL.md specs/AGENTS.md` | updated docs | Agent Browser is available through its skill or CLI-served instructions and recorded in Coverage Status | planned |
| S5 | Documentation audit | `rg` | `rg -n "not a substitute|only proof|E2E coverage" specs/AGENTS.md .agents/skills/atmos-specs-test-*.md` | updated docs | docs warn against treating agent-browser as deterministic automated coverage | planned |
| S7 | Documentation audit | `rg` | `rg -n "Agent Browser|agent-browser install|npx skills add vercel-labs/agent-browser|doctor" specs/references/agent-browser-setup.md` | setup reference | optional Agent Browser setup is documented separately | planned |
| S6 | Documentation audit | `rg` | `rg -n "Bun|cargo test|Playwright" .agents/skills/atmos-specs-test-run/SKILL.md .agents/skills/atmos-specs-test-plan/SKILL.md` | updated skills | Bun/Rust are documented as active stack; Playwright is conditional on a harness | planned |

## Scenarios

### S1 - TEST.md structure is documented in specs guide and test-plan skill

- **Level**: Documentation audit
- **Given**: the updated specs lifecycle docs and test-plan skill.
- **When**: an agent searches for `Execution map` and `Coverage Status`.
- **Then**: both concepts appear in the specs guide and test-plan template.
- **Signals**: `rg` results include `specs/AGENTS.md` and `.agents/skills/atmos-specs-test-plan/SKILL.md`.

### S2 - Test-plan template includes agent-browser exploration

- **Level**: Documentation audit
- **Given**: a new or refreshed spec needs UI/workflow verification.
- **When**: `atmos-specs-test-plan` writes `TEST.md`.
- **Then**: the template offers `Exploratory agent-browser checks` with guidance to record findings without replacing executable tests.
- **Signals**: skill text includes the section heading and anti-substitution language.

### S3 - Implementation skill no longer stops at production code

- **Level**: Skill contract audit
- **Given**: `atmos-specs-impl` finishes production code for a complete spec.
- **When**: the skill prepares its final report.
- **Then**: it must either run/hand off to `atmos-specs-test-run` or label the state `implemented, awaiting test-run`.
- **Signals**: impl skill includes `implemented, awaiting test-run`, `Test hand-off`, and `atmos-specs-test-run` instructions.

### S4 - Test-run can record agent-browser exploratory results

- **Level**: Skill contract audit
- **Given**: TEST.md lists agent-browser checks and a browser tool is available.
- **When**: `atmos-specs-test-run` runs verification.
- **Then**: it must load the installed `agent-browser` skill or `agent-browser skills get core --full`, may run the browser exploration after automated checks, and appends concise results to Coverage Status.
- **Signals**: test-run skill mentions `agent-browser`, `agent-browser skills get core --full`, URL, viewport, prompt summary, findings, console/network errors, and Coverage Status.

### S5 - Agent-browser is bounded away from deterministic correctness

- **Level**: Documentation audit
- **Given**: a feature has persistence, permissions, or WS/business rules.
- **When**: an agent reads the specs guide or test-run skill.
- **Then**: docs prohibit using agent-browser as the only proof for those deterministic contracts.
- **Signals**: docs contain explicit "not a substitute" / "only proof" language.

### S6 - Active test stack remains Rust + Bun first

- **Level**: Documentation audit
- **Given**: the repo has no committed Playwright harness.
- **When**: an agent reads test-plan and test-run.
- **Then**: Rust `cargo test`, Bun test, and service/API tests are the default automated layers, while Playwright is conditional on a harness.
- **Signals**: skills mention Bun's built-in runner, `cargo test`, and warn not to add Playwright silently.

### S7 - Optional Agent Browser setup is separate from TEST.md

- **Level**: Documentation audit
- **Given**: a machine does not have a working `agent-browser` CLI or skill.
- **When**: an agent needs to run TEST.md exploratory browser checks.
- **Then**: the agent can read `specs/references/agent-browser-setup.md` for install, doctor, skill installation, and smoke-check steps without bloating every TEST.md.
- **Signals**: setup reference includes CLI install, `agent-browser install`, `agent-browser doctor`, `npx skills add vercel-labs/agent-browser`, and `agent-browser skills get core --full`.

## Regression Checklist

- [ ] No new REST-only testing path is recommended for WebSocket-first features.
- [ ] No instruction says agent-browser replaces automated assertions.
- [ ] Agent-browser execution instructions name `agent-browser` and `agent-browser skills get core --full` so future agents load the Agent Browser skill/instructions before testing.
- [ ] Optional Agent Browser setup steps live in `specs/references/agent-browser-setup.md`, not in every spec TEST.md.
- [ ] No instruction says Playwright must be added silently when no harness exists.
- [ ] `atmos-specs-impl` still separates production implementation from systematic TEST.md scenario authoring.
- [ ] `atmos-specs-test-run` still prohibits production code changes.

## Acceptance Criteria

- [ ] `specs/AGENTS.md` documents TEST.md as an executable verification contract.
- [ ] `atmos-specs-test-plan` includes Coverage map, Execution map, exploratory agent-browser checks, and Coverage Status in the template.
- [ ] `atmos-specs-test-run` can load Agent Browser instructions, run and record agent-browser exploratory checks, and avoid calling them E2E coverage.
- [ ] `specs/references/agent-browser-setup.md` documents missing Agent Browser setup and smoke checks.
- [ ] `atmos-specs-impl` requires a test-run hand-off or an explicit `implemented, awaiting test-run` state.
- [ ] Verification commands in TECH.md run successfully.

## Manual Verification Steps

1. Read `specs/AGENTS.md` lifecycle and confirm it is clear that `test-run / agent-browser` happens after implementation and before ship.
2. Read the three updated skill files and confirm their responsibilities do not overlap in a way that lets the implementation agent weaken tests.

## Non-Coverage

- This quality spec does not retrofit older APP specs to the new TEST.md structure.
- This quality spec does not add a Playwright harness.
- This quality spec does not add a CI rule for missing Execution maps.

## Coverage Status

_Last run: 2026-06-26._

- S1 — ✅ `rg -n "Execution map|Exploratory agent-browser checks|Coverage Status" specs/AGENTS.md .agents/skills/atmos-specs-test-plan/SKILL.md`
- S2 — ✅ `rg -n "Exploratory agent-browser checks" .agents/skills/atmos-specs-test-plan/SKILL.md`
- S3 — ✅ `rg -n "test-run|implemented, awaiting test-run|Test hand-off" .agents/skills/atmos-specs-impl/SKILL.md`
- S4 — ✅ `rg -n "agent-browser|agent-browser skills get core --full" .agents/skills/atmos-specs-test-run/SKILL.md specs/AGENTS.md`
- S5 — ✅ `rg -n "not a substitute|only proof|E2E coverage" specs/AGENTS.md .agents/skills/atmos-specs-test-plan/SKILL.md .agents/skills/atmos-specs-test-run/SKILL.md`
- S6 — ✅ `rg -n "Bun|cargo test|Playwright" .agents/skills/atmos-specs-test-run/SKILL.md .agents/skills/atmos-specs-test-plan/SKILL.md`
- S7 — ✅ `rg -n "Agent Browser|agent-browser install|npx skills add vercel-labs/agent-browser|doctor" specs/references/agent-browser-setup.md`
- Regression — ✅ `rg -n "QUALITY-002" specs/README.md specs/APP/QUALITY-002_spec-test-execution-loop`
- Regression — ✅ `git diff --check`
- Exploratory agent-browser — not run; this was a docs/skill workflow change with no runnable UI surface.
