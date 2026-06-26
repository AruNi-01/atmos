---
name: atmos-specs-test-plan
description: Author the scenario-level test plan for an Atmos spec at `specs/<ZONE>/<ZONE>-NNN_.../TEST.md`. Use whenever the user wants to define WHAT to verify for a feature — Given/When/Then scenarios, acceptance criteria, regression checklist, performance budgets, Playwright/E2E coverage, agent-browser exploratory checks, or manual steps. Trigger on "test plan", "测试方案", "acceptance criteria", "验收标准", "how do we verify", "QA checklist", or after PRD/TECH has stabilized and you need to pin down what "done" looks like. This skill only writes the plan document; actually writing and running test code lives in the `atmos-specs-test-run` skill. Cover happy path, edge cases, and failure recovery at the scenario level — not individual unit tests. Only touch `TEST.md`.
user-invokable: true
args:
  - name: spec_id
    description: Spec identifier, e.g. `APP-007` or `APP-007_wiki-incremental-update`. Required.
    required: true
---

# Atmos Specs · Test Plan

Define observable, executable proof that a feature is done. The audience is the engineer who will later implement the tests (via `atmos-specs-test-run`) and the reviewer checking the feature before merge.

## What this skill owns — and what it does not

- **Owns**: `TEST.md` in one spec directory — the scenario-level plan.
- **Does not own**: actual test code (Rust `#[cfg(test)]`, `bun test` specs, Playwright specs). That belongs to `atmos-specs-test-run`.
- **Does not own**: running `just test` / `cargo test` / `bun test`, Playwright, or agent-browser. Also `atmos-specs-test-run` or a manual/browser verification pass.
- **Does not own**: BRAINSTORM, PRD, TECH.

Why: TEST.md is a scenario-level contract, not a test harness. A stable plan lets implementation churn (new helpers, refactored imports, renamed symbols) without invalidating the "what we promise to verify" section. Keeping authoring and execution in separate skills prevents the planner from prematurely committing to brittle assertions tied to today's internals.

## Read these before you write

1. `specs/AGENTS.md`.
2. The spec's `PRD.md` — every Must Have must have at least one scenario that would fail if it regressed.
3. The spec's `TECH.md` — gives you the failure surfaces (new WS messages, new tables, new endpoints, new frontend components).
4. If the plan includes web E2E, read `e2e/README.md` and `e2e/AGENTS.md` for the committed Playwright harness, commands, file placement, and fixture conventions.
5. A comparable existing `TEST.md` once the first few land (right now most are templates — that's expected).

## Default verification loop to encode

For new features and old-feature regression hardening, write `TEST.md` so the later execution pass can follow this order:

```text
deterministic unit/service/API tests
  -> Playwright E2E for critical web journeys
  -> agent-browser exploratory checks for UI/UX unknowns
  -> Coverage Status with exact commands and remaining gaps
```

Do not duplicate this whole flow in every scenario. Use the `Test strategy`, `Execution map`, `Exploratory agent-browser checks`, and `Coverage Status` sections to make the expected proof explicit.

## Workflow

### 1. Map PRD Must Haves → scenarios

Open PRD.md and list M1, M2, … N1, N2. For each:

- Write at least one **happy-path** scenario.
- Write at least one **edge or failure** scenario (empty state, permission denied, race, offline, slow network, conflicting updates, interrupted operation).

If a Must Have has no plausible failure scenario, question whether it's really a requirement.

### 2. Extract observable signals

A scenario is only testable if it has observable outputs. Good signals in Atmos:

- UI text, state, or route — verifiable in Playwright or by eye.
- WebSocket message sent / received — verifiable in client logs or a WS test harness.
- DB row state — verifiable by query.
- File system side effects (worktree created, script executed) — verifiable by path check.
- Terminal output / tmux pane state.
- Log line / structured event in `./logs/debug/`.

For each scenario, name the signal explicitly: "the workspace card shows a `PR #42 · Open` badge" is testable; "it looks right" is not.

### 3. Decide the test level

Not every scenario needs an E2E test. Suggest the cheapest level that actually proves the behavior:

- **Unit / integration** (Rust `#[cfg(test)]`, Bun test) — pure logic, single crate/module, frontend store/hooks/lib logic, and mobile/client helpers.
- **Service-level** (`apps/api` in-memory, `crates/core-service` with stubs) — business rules that span a couple of layers.
- **WebSocket/API-level** — protocol behavior, DTO normalization, authorization, and handler routing through existing WS/service harnesses.
- **End-to-end** (Playwright) — user-visible web flow across frontend + API/crates wiring. The web harness exists under `e2e/`; spec-owned tests should usually be planned for `e2e/tests/specs/<SPEC-ID>_<title>.e2e.ts`, with `just test-e2e-smoke` for broad smoke and `just test-e2e` / `just test-e2e -- tests/specs/<file>.e2e.ts` for spec coverage. Use E2E for critical journeys, not for exhaustive backend rules.
- **Exploratory agent-browser** — Vercel Agent Browser (`agent-browser`, https://agent-browser.dev/) checks UI comprehension, copy, layout, responsive behavior, obvious console/network failures, and workflow rough edges. Mention Agent Browser in TEST.md so the later test-run agent loads the installed `agent-browser` skill or runs `agent-browser skills get core --full` before browser work. Use it as a smoke/exploration layer, not as the only proof for deterministic business rules.
- **Manual** — reserved for things genuinely expensive to automate (GPU, real external APIs). Name why automated isn't feasible.

Each scenario in TEST.md gets a tag indicating the level.

### 4. Add the execution map

After the Coverage map, add an `Execution map` so implementation and test-run agents know how to turn the plan into commands.

Each row should include:

- **Scenario**: `S1`, `S2`, ...
- **Level**: Rust unit, Rust integration, Bun test, WebSocket/API-level, E2E, agent-browser, manual.
- **Expected tool**: `cargo test`, `bun test`, `just test-api`, Playwright, `agent-browser`, manual.
- **Target command / method**: the likely command or named method, if known. Use `TBD by test-run` only when the correct file/harness cannot be known before implementation.
- **Fixture / data**: test repo, DB state, fake CLI, seeded settings, running dev server, viewport, auth state.
- **Signals**: observable outputs that prove the scenario.
- **Status**: always `planned` while authoring TEST.md. `atmos-specs-test-run` owns later status updates.

### 5. Pin acceptance criteria

Acceptance criteria are the "we will not ship without this" list. They should be:

- **Binary**: met or not met.
- **Observable**: someone other than the author can check.
- **Short**: usually 5–12 items for a feature-scoped spec.

Separately, list any **performance / load budgets** if the feature is on a hot path (terminal, WS, diff view, agent stream).

### 6. Write TEST.md

```markdown
# TEST · <ZONE>-NNN: <Title>

> Test Plan · how we verify <one-sentence summary>. References PRD <ZONE>-NNN and TECH <ZONE>-NNN.

## Test strategy

What levels we rely on and roughly why. Two or three sentences.

- Unit / integration: ...
- Service-level: ...
- WebSocket/API-level: ...
- End-to-end (Playwright): web critical journeys go under `e2e/tests/specs/`; smoke belongs under `e2e/tests/smoke/`; use `just test-e2e*` commands.
- Exploratory agent-browser: ...
- Manual-only: <list, each with a reason>

## Coverage map

Cross-reference PRD requirements to scenarios so nothing is missed.

| PRD item | Scenario IDs |
|----------|--------------|
| M1       | S1, S2       |
| M2       | S3           |
| N1       | S4 (deferred) |

## Execution map

This table is the hand-off from plan to implementation/testing. Keep `Status` as `planned` until `atmos-specs-test-run` updates Coverage Status after implementation.

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | E2E | Playwright | `just test-e2e -- tests/specs/APP-005_github-pr-flow.e2e.ts` | local app with authenticated `gh` and one workspace branch | PR row visible; WS update observed; `gh pr list` returns the PR | planned |
| S2 | Integration | `cargo test` or `bun test` | `TBD by test-run` | local-only branch fixture | empty-state row visible; no WS error | planned |
| S3 | Service-level | `cargo test --package api` | `TBD by test-run` | fake `gh auth status` failure | recoverable error DTO/log entry | planned |

## Scenarios

Number scenarios `S1, S2, …`. Each scenario is given, when, then. Keep it tight.

### S1 — Happy path: user creates a PR from a workspace

- **Level**: E2E (Playwright)
- **Given**: a Project with `origin` on GitHub and an authenticated `gh` CLI; a Workspace on branch `feat/foo` with one committed change.
- **When**: the user clicks "Create PR" in the Workspace PR panel and submits the default title.
- **Then**: a new PR appears in the panel as `open`, linked to the branch; the UI shows the PR number within 2s; the follow-up WS message `github_pr_list_updated` is emitted.
- **Signals**: PR row visible, WS message in client log, `gh pr list --head feat/foo` returns the new PR.

### S2 — Edge: branch has no remote

- **Level**: Integration
- **Given**: a Workspace whose branch is local-only.
- **When**: the user opens the PR panel.
- **Then**: an empty-state card appears with a "Push branch first" action; no WS error is raised.

### S3 — Failure: `gh` is not authenticated

- **Level**: Integration
- **Given**: `gh auth status` exits non-zero.
- **When**: the user attempts to list PRs.
- **Then**: a recoverable error toast explains the state and links to auth docs; the panel stays usable with no PR data; the error is logged with correlation id.

## Performance & load budgets

Only if relevant.

- PR list fetch completes in < 1.5s at p50, < 4s at p95 on a 50-project tenant.
- WebSocket reconnect after `gh` refresh doesn't drop terminal streams.

## Regression checklist

Short list of "things that have broken here before or are fragile." Future reviewers scan this before merging near the feature.

- [ ] PR panel doesn't leak auth tokens in logs.
- [ ] Switching worktrees while PR list is loading doesn't show stale PRs.
- [ ] Closing the workspace mid-fetch doesn't throw unhandled rejections.

## Exploratory agent-browser checks

Use these after the first implementation pass and again before release if the UI changed materially. The test-run agent must load Agent Browser instructions before running them: prefer the installed `agent-browser` skill; otherwise run `agent-browser skills get core --full`. If Agent Browser is missing, use `specs/references/agent-browser-setup.md` instead of inlining setup steps here. Record findings in `Coverage Status` or `PROGRESS.md`; do not treat a clean exploration as a replacement for executable tests.

1. Open the local app route that owns this feature and complete the happy path from a fresh reload.
2. Repeat the main interaction in a narrow mobile viewport and check for clipped text, hidden controls, or blocked scrolling.
3. Trigger one expected failure state and confirm the copy is actionable and the user can recover.
4. Watch for obvious console errors, failed network/WS requests, stale loading states, or visual overlap.

## Acceptance criteria

Binary. Merge-blocking.

- [ ] All Must Have PRD items have at least one passing scenario.
- [ ] No failing scenarios at the declared level.
- [ ] No new unconditional REST endpoints unless TECH called them out.
- [ ] Feature flag (if any) is off by default and documented.
- [ ] `atmos-specs-test-run` has updated Coverage Status for implemented scenarios, including exact automated commands and any agent-browser/manual exploratory result.
- [ ] `just lint` and `just test` pass on changed crates/apps, or scoped alternatives are recorded with a reason.

## Manual verification steps

If a human has to press buttons before merge, list them numbered. Keep it to the steps automation truly can't cover.

1. On macOS desktop: open a Workspace with a GitHub remote, authenticate `gh` via the terminal, confirm the PR panel populates.
2. Leave the app overnight; next morning the PR panel should re-fetch on focus.

## Non-coverage

Things deliberately not tested in this pass and why.

- Multi-user concurrency on the same branch (single-user product in v1).
- GitHub Enterprise (not yet supported by TECH).

## Coverage Status

> Filled after implementation by `atmos-specs-test-run`. Include exact automated tests, commands, agent-browser prompts/results when used, and remaining gaps.
```

## Writing rules

- **English**.
- **Given / When / Then** is the default scenario shape. If a scenario is too small for this, it might belong in a unit test and not in TEST.md.
- **Name the signals**. Every Then clause should point at something checkable: DOM text, DB row, WS message name, log entry, file path.
- **Keep levels honest**. Don't mark something E2E if integration would prove it more cheaply and faster.
- **Use the committed E2E harness**. For web E2E, point to `e2e/tests/specs/` and `just test-e2e*`; do not invent a Cucumber/Gherkin layer or a second Playwright config from the plan.
- **Keep agent-browser honest**. Use it for exploratory UI and workflow verification; do not use it as the only proof for data integrity, permissions, transport contracts, or business rules.
- **Don't invent APIs**. Use the message/endpoint names from TECH.md. If they don't exist there, update TECH first.

## Done criteria

- Every PRD Must Have appears in the Coverage map.
- Execution map names the expected tool, fixture/data, and signals for every scenario.
- Web E2E scenarios, when used, name the `e2e/tests/specs/` target and expected `just test-e2e*` command.
- At least one failure/edge scenario per Must Have.
- Acceptance criteria are binary and merge-blocking.
- Agent-browser checks are listed for meaningful UI/workflow changes, explicitly name `agent-browser`, or are omitted intentionally when the feature has no user-facing surface.
- Manual steps are named only when automation truly isn't feasible.
- No placeholder comments remain.

## Common mistakes to avoid

- Scenarios that restate the requirement ("S1 — Users can create PRs"). Make it concrete: inputs, action, observable result.
- Acceptance criteria that are soft ("feels snappy", "easy to use"). Turn them into budgets or scenarios.
- Over-indexing on E2E. The infra for a scripted PTY or tmux test is heavy; prefer service-level coverage when it proves the same thing.
- Skipping the regression checklist. That's often where the most value is for future reviewers.
- Committing to brittle test code shapes in the plan (exact assertion strings, exact selector paths). That's `atmos-specs-test-run`'s job and it'll adapt to the actual implementation.
- Treating agent-browser exploration as a pass/fail oracle. It is good at finding missed UI problems; it is not a stable regression suite.

## Hand-off

When TEST.md is ready, the next skill in the chain is `atmos-specs-test-run`: it reads this plan, writes the real test code (`#[cfg(test)]`, `bun test`, Playwright if a harness exists), runs the suite against the implementation, optionally performs listed agent-browser exploratory checks, and updates TEST.md with a minimal Coverage Status line per scenario (e.g. "S1 — ✅ covered by `crates/core-engine/src/github/mod.rs` test `lists_open_prs`"). Don't pre-fill those statuses here; they're a post-implementation artifact.
