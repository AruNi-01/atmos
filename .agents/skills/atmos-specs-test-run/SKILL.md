---
name: atmos-specs-test-run
description: Implement and execute the real tests for an Atmos spec — turn the scenarios in `specs/<ZONE>/<ZONE>-NNN_.../TEST.md` into actual Rust `#[cfg(test)]` modules, `bun test` specs, and Playwright/E2E tests under `e2e/` where warranted, then run them and report. Also run TEST.md-listed agent-browser exploratory checks when the external Agent Browser CLI/skill and local app are available. Use whenever the user says "write the tests", "实现测试", "跑测试", "run the tests for APP-NNN", "make TEST.md actually executable", or asks to verify that an implemented spec still works. Respect the project's test stack (`just test` = `bun test` + `cargo test --workspace`; E2E = `just test-e2e*`; per-crate/app filters via `cargo test --package <c>` and `bun run --filter <pkg> test`). Writes code in `tests/`, `#[cfg(test)]` mods, `apps/**/*.test.ts[x]`, or `e2e/tests/specs/*.e2e.ts`; may append short status lines to `TEST.md` per scenario. Does not write production code — that's the `atmos-specs-impl` skill.
user-invokable: true
args:
  - name: spec_id
    description: Spec identifier, e.g. `APP-006` or `APP-006_project-wiki`. Required.
    required: true
  - name: scope
    description: Optional filter — a comma-separated list of scenario IDs from TEST.md (e.g. `S1,S3`) or a target ("rust", "web", "e2e"). If omitted, cover every scenario currently marked uncovered.
    required: false
---

# Atmos Specs · Test Run

This skill is the execution side of the TEST lifecycle. The `atmos-specs-test-plan` skill writes scenarios in `TEST.md`; this skill turns those scenarios into real executable tests and runs them against the implementation.

## What this skill owns — and what it does not

- **Owns**: test code — Rust `#[cfg(test)]` modules, integration tests under `crates/**/tests/`, Bun test specs under `apps/**/*.test.ts[x]` or `packages/**/*.test.ts[x]`, and web Playwright specs under `e2e/tests/specs/*.e2e.ts`.
- **Owns**: running the relevant test commands (`cargo test`, `bun test`, `just test`, etc.) and triaging failures.
- **May own**: agent-browser exploratory checks listed in `TEST.md`, when the `agent-browser` CLI/skill is available and a local app can be launched or is already running.
- **May touch `TEST.md`** — only to append a short status line per scenario, e.g. `S1 — ✅ covered by crates/core-engine/tests/github.rs::lists_open_prs`. Never rewrite plan sections here; that's the plan skill's job.
- **Does not own** production code changes in `crates/` / `apps/` / `packages/`. If the scenario fails because production code is missing or broken, stop and hand off to `atmos-specs-impl`.
- **Does not own** BRAINSTORM / PRD / TECH.

Why: separating planning from execution lets TEST.md stay stable while the suite evolves with the code. Separating test-writing from production-code-writing forces an honest check — the tester cannot silently "fix" a failure by relaxing the production contract.

## Read these before you write tests

1. `specs/AGENTS.md` — conventions.
2. The spec's own `TEST.md` — your source of truth. Every Must Have has scenarios here; your job is to make them executable.
3. The spec's `TECH.md` — for the real symbol names, crate boundaries, WS action names, endpoint paths. Don't invent them.
4. The **existing tests** closest to your target, to match style and harness:
   - Rust inline tests: `crates/core-engine/src/git/mod.rs`, `crates/core-engine/src/github/mod.rs`, `crates/core-engine/src/tmux/control.rs`, `crates/core-engine/src/shims/mod.rs`, `crates/llm/src/prompt_template.rs`, `crates/infra/src/db/migration/mod.rs`.
   - Integration tests live under `crates/<name>/tests/` when present.
   - Frontend tests: currently rare — verify with `find apps -name "*.test.ts*"` before assuming a stack is in place.
   - Web E2E tests: `e2e/AGENTS.md`, `e2e/README.md`, `e2e/fixtures/test.ts`, and existing `e2e/tests/**/*.e2e.ts`.
5. Root `AGENTS.md` — Debug Logging section if tests need structured logs.
6. If `TEST.md` includes agent-browser checks, load Agent Browser instructions before browser work: use the installed `agent-browser` skill when present, or run `agent-browser skills get core --full` to read the CLI-served current instructions. If the `agent-browser` CLI/skill is unavailable, read `specs/references/agent-browser-setup.md`; if setup cannot be completed, mark the browser check `not_run` with the reason.

## Project test stack (authoritative)

These come straight from the `justfile`:

- **Full suite**: `just test` → `bun test` + `cargo test --workspace`.
- **Lint (run alongside tests on touched surfaces)**: `just lint` → `bun lint` + `cargo clippy --workspace`.
- **Rust targeted**: `just test-rust` (= `cargo test --workspace`), or `cargo test --package <crate>` / `cargo test --package <crate> <test_name>` for fast iteration.
- **API only**: `just test-api` (= `cargo test --package api`).
- **Web**: `just test-web` (= `bun test`). The JS runner is **Bun's built-in test runner**, not Vitest/Jest. Write `import { describe, it, expect } from "bun:test"`.
- **Web E2E**: `just test-e2e-smoke` for the fast Playwright smoke suite, `just test-e2e` for all Playwright projects, and `just test-e2e -- tests/specs/<file>.e2e.ts` for a spec file. Run `bun run --cwd e2e lint` after editing E2E files. Fresh machines may need `just install-e2e-browsers`.
- **Coverage**: `just test-coverage` (= `cargo test --workspace -- --nocapture` + `cargo tarpaulin --workspace --out Html`). Don't run this by default; it's slow.

The web Playwright harness exists under `e2e/`. Do not add another Playwright config or a Cucumber/Gherkin layer from this skill. If the spec calls for E2E on a target that still has no harness, stop and ask. Use service-level coverage plus agent-browser/manual smoke only when the gap is documented in `TEST.md`.

## Default execution flow

For a normal implemented feature, work in this order:

```text
1. Make deterministic tests executable first: Rust/Bun/service/API.
2. Add or run Playwright E2E for the critical web journey when TEST.md maps scenarios to E2E.
3. Run the relevant smoke/full commands: targeted tests -> `bun run --cwd e2e lint` if E2E changed -> `just test-e2e-smoke` / targeted `just test-e2e -- ...` -> wider `just test` when appropriate.
4. Run TEST.md-listed agent-browser exploratory checks after executable checks pass, if the local app and external Agent Browser are available.
5. Update `TEST.md` Coverage Status with exact commands, scenario coverage, agent-browser result or `not_run` reason, and remaining gaps.
```

## Workflow

### 1. Map scenarios to test files

Open `TEST.md`. For each scenario in scope:

- Pick the cheapest level that actually proves it (scenario already declares its level, but sanity-check against the plan's level hierarchy).
- Decide the file location:
  - **Rust unit** → inline `#[cfg(test)] mod tests { … }` in the same `.rs` file as the code under test.
  - **Rust integration** → new file under `crates/<crate>/tests/<scenario_area>.rs`.
  - **Web/TS unit** → colocated `<file>.test.ts[x]` next to source, or under `apps/<app>/src/**/__tests__/`.
  - **Web E2E** → new spec-owned file under `e2e/tests/specs/<SPEC-ID>_<title>.e2e.ts`, importing `test` and `expect` from `e2e/fixtures/test.ts`. Use `e2e/fixtures/local-api.ts` for no-backend smoke and add narrowly scoped fixtures for data setup instead of ad hoc sleeps or REST-only test setup endpoints.
  - **Exploratory agent-browser** → no test file. Load the `agent-browser` skill or `agent-browser skills get core --full`, then prepare the route, fixture, viewport, prompt, and expected observations listed in TEST.md.

Show the mapping before writing any test code. The user should be able to redirect you cheaply.

### 2. Write tests that match the plan, not the implementation

A good scenario test asserts the observable signal named in TEST.md — DOM text, DB row state, WS message name, log line, exit status. It does **not** assert private internals.

Anti-patterns to avoid:

- Asserting on a `fmt::Debug` representation.
- Snapshotting a huge JSON blob and pretending that's coverage.
- Mocking the thing under test. Mock the I/O edge (HTTP, disk, external CLI), not the business logic.
- Importing `pub(crate)` helpers from deep inside the crate to pre-seed state — prefer the public interface, or an integration test file with the same seed flow a real call would use.

For Rust:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn s1_lists_open_prs_for_head_branch() {
        // Given … When … Then — map the comment to TEST.md S1 wording.
    }
}
```

For Bun test in TS:

```ts
import { describe, expect, it } from "bun:test";

describe("S1 — creates PR from workspace", () => {
  it("emits github_pr_list_updated after creation", async () => {
    // …
  });
});
```

Label the test name or describe block with the scenario id (`S1`, `S3`, …) so grep "S1" jumps to the relevant test.

For Playwright E2E, use the committed fixture wrapper:

```ts
import { expect, test } from "../../fixtures/test";

test.describe("APP-027 — canvas workspace surfaces", () => {
  test("S1 — opens a workspace surface from canvas", async ({ page }) => {
    // Given / When / Then from TEST.md, asserting user-visible signals.
  });
});
```

### 3. Run in widening circles

Don't jump straight to `just test`. Iterate fast.

1. **Narrow**: `cargo test --package <crate> <test_name> -- --nocapture` or `bun test path/to/file.test.ts`. Fix until green.
2. **E2E narrow**: `bun run --cwd e2e lint` and `just test-e2e -- tests/specs/<file>.e2e.ts` when you added or changed Playwright tests.
3. **Medium**: `cargo test --package <crate>` / `bun test` / `just test-e2e-smoke`.
4. **Full**: `just test` and, when E2E is in scope, `just test-e2e` before reporting done. If this is CI-expensive and the change is clearly scoped, note that the targeted run passed and flag the full-suite status.
5. Always run `just lint` on touched surfaces. Clippy warnings on new test code still block merge.
6. **Exploratory**: after executable checks pass, run listed agent-browser checks for UI/workflow changes. Record URL, viewport, prompt summary, pass/fail findings, and any console/network errors.

Capture the actual commands you ran and their outcomes in the hand-off — not "I ran tests, they pass", but the exact command lines.

### 4. Run agent-browser checks honestly

Agent Browser is useful when a scenario has user-facing ambiguity that scripted tests are unlikely to catch: layout overlap, unclear copy, mobile viewport breakage, stale loading states, unexpected console errors, or confusing recovery flows. Use the external `agent-browser` CLI and its installed skill / CLI-served instructions; do not substitute another browser surface for this check unless Agent Browser is unavailable and you record the fallback.

Rules:

- Load and follow the installed `agent-browser` skill before any browser action. If the skill is not installed but the CLI is available, run `agent-browser skills get core --full` and follow that output before using the CLI.
- Do not use agent-browser as the only proof for deterministic business rules, permission checks, persistence, data integrity, or transport contracts.
- Prefer existing local dev commands (`just dev-web`, `just dev-api`, `just dev-desktop`) and existing fixtures. Do not add REST-only test setup endpoints just to make browser checks easier.
- If Agent Browser is unavailable, read `specs/references/agent-browser-setup.md` before giving up. If setup still cannot be completed, the app cannot launch, or the required external service is missing, mark the exploratory check `not_run` with a reason instead of pretending it passed.
- If agent-browser finds a real issue, classify it as a production bug or UX/copy follow-up. Do not weaken automated assertions to make the status look green.

### 5. Handle failures honestly

If a scenario's test fails:

- **Test bug** → fix the test. Common: wrong assumption about async timing, wrong path construction, bad fixture.
- **Plan bug** → the scenario is unprovable as written (ambiguous "Then", wrong signal). Do not "adjust" the production code to make it match. Stop, explain, and hand back to `atmos-specs-test-plan` for a precision pass.
- **Production bug** → the implementation genuinely doesn't satisfy the PRD intent. Do not silently relax the assertion. Stop, document the failure, and hand off to `atmos-specs-impl`. Leave the failing test in place (marked `#[ignore]` with a reason, or `it.skip` with a reason and a reference to the issue/spec) so the gap is visible.

A failing scenario is useful signal; a weakened scenario is dishonest coverage.

### 6. Update TEST.md (lightly)

After a clean run, append or update a status block near the Coverage map (or append a new `## Coverage Status` section below it). Keep it minimal:

```markdown
## Coverage Status

_Last run: 2026-05-06 · `just test` green._

- S1 — ✅ `crates/core-engine/tests/github.rs::lists_open_prs_for_head_branch`
- S2 — ✅ `apps/api/src/ws/github.rs::tests::empty_state_when_no_remote`
- S3 — ✅ `e2e/tests/specs/APP-005_github-pr-flow.e2e.ts` via `just test-e2e -- tests/specs/APP-005_github-pr-flow.e2e.ts`
- S4 — ⏸ deferred: needs integration harness for `gh` auth failure; tracked in <link>.
- Exploratory agent-browser — ✅ local web smoke at `http://localhost:3030/workspaces/...`, desktop viewport + 390px mobile viewport; no console/network failures.
```

Don't rewrite scenario bodies, coverage maps, or acceptance criteria here — that's the plan skill. This status block is the only editable surface for this skill.

### 7. Report

Hand the user a short report:

1. **Scope** — scenario IDs covered this run.
2. **Files added/changed** — test files only (if you edited production code, you're in the wrong skill).
3. **Commands run** — exact lines, with outcome.
4. **Failures** — split by root cause (test / plan / impl). Link to issue or next skill to pick up.
5. **Coverage Status block** appended to `TEST.md`, including agent-browser results when run.
6. **Remaining** — scenarios still uncovered and why.

## Writing rules

- **Mirror scenario wording** in test names and comments — grep from TEST.md to code must work.
- **One observable per assertion** where possible. Tests with ten `expect(...)` calls rot fastest.
- **Use `e2e/fixtures/test.ts` for Playwright** so page errors and console errors are collected consistently.
- **Isolate externalities**. Network, filesystem, tmux, `gh` CLI — stub at the edge using the crate's existing test doubles, or skip the scenario with a named reason.
- **No flaky test shortcuts**. No unconditional `sleep(100ms)`. No "retry 3 times". If a scenario is fundamentally timing-dependent, it goes to integration or E2E level, not unit.
- **Exploratory output stays concise**. Record route, viewport, prompt summary, outcome, and findings. Do not paste full screenshots, raw logs, secrets, or long terminal output into TEST.md.
- **English** for comments and test names; Chinese strings are fine inside fixtures only when the production code explicitly handles i18n there.

## Done criteria

- Every scenario in scope is either green, intentionally `ignore`d with a reason, or handed back to plan/impl with a clear note.
- `just lint` on touched crates/apps is clean.
- E2E changes, when present, pass `bun run --cwd e2e lint` and the relevant `just test-e2e*` command.
- The command-line invocations you claim to have run actually ran (don't guess output).
- `TEST.md` has a Coverage Status block reflecting automated tests, skipped/deferred gaps, and agent-browser/manual checks that actually ran.
- No production code was modified in this skill run.

## Common mistakes to avoid

- Writing a test that always passes regardless of the code under test. Verify by flipping one character in production (locally, don't commit) and confirm the test actually fails.
- Creating a second test harness (another Playwright config, Cucumber/Gherkin layer, Vitest/Jest runner) instead of using the committed Rust/Bun/Playwright stack. That's a discussion, not a silent addition.
- Calling an agent-browser smoke "E2E coverage". It is exploratory verification unless it is backed by a committed automated test.
- Silently weakening an assertion because it was red. Either fix the root cause or stop.
- Skipping `just lint` because "it's just test code". Clippy on test code still matters.
- Updating PRD/TECH from this skill. If the failing test reveals the tech spec is wrong, hand off; don't patch it from here.
