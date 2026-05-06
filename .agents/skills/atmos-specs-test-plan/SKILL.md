---
name: atmos-specs-test-plan
description: Author the scenario-level test plan for an Atmos spec at `specs/<ZONE>/<ZONE>-NNN_.../TEST.md`. Use whenever the user wants to define WHAT to verify for a feature — Given/When/Then scenarios, acceptance criteria, regression checklist, performance budgets, manual steps. Trigger on "test plan", "测试方案", "acceptance criteria", "验收标准", "how do we verify", "QA checklist", or after PRD/TECH has stabilized and you need to pin down what "done" looks like. This skill only writes the plan document; actually writing and running test code lives in the `atmos-specs-test-run` skill. Cover happy path, edge cases, and failure recovery at the scenario level — not individual unit tests. Only touch `TEST.md`.
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
- **Does not own**: running `just test` / `cargo test` / `bun test`. Also `atmos-specs-test-run`.
- **Does not own**: BRAINSTORM, PRD, TECH.

Why: TEST.md is a scenario-level contract, not a test harness. A stable plan lets implementation churn (new helpers, refactored imports, renamed symbols) without invalidating the "what we promise to verify" section. Keeping authoring and execution in separate skills prevents the planner from prematurely committing to brittle assertions tied to today's internals.

## Read these before you write

1. `specs/AGENTS.md`.
2. The spec's `PRD.md` — every Must Have must have at least one scenario that would fail if it regressed.
3. The spec's `TECH.md` — gives you the failure surfaces (new WS messages, new tables, new endpoints, new frontend components).
4. A comparable existing `TEST.md` once the first few land (right now most are templates — that's expected).

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

- **Unit / integration** (Rust `#[cfg(test)]`, Vitest) — pure logic, single crate/module.
- **Service-level** (`apps/api` in-memory, `crates/core-service` with stubs) — business rules that span a couple of layers.
- **End-to-end** (Playwright against `just dev-*`, or a scripted PTY session) — user-visible flow across web + api + crates.
- **Manual** — reserved for things genuinely expensive to automate (GPU, real external APIs). Name why automated isn't feasible.

Each scenario in TEST.md gets a tag indicating the level.

### 4. Pin acceptance criteria

Acceptance criteria are the "we will not ship without this" list. They should be:

- **Binary**: met or not met.
- **Observable**: someone other than the author can check.
- **Short**: usually 5–12 items for a feature-scoped spec.

Separately, list any **performance / load budgets** if the feature is on a hot path (terminal, WS, diff view, agent stream).

### 5. Write TEST.md

```markdown
# TEST · <ZONE>-NNN: <Title>

> Test Plan · how we verify <one-sentence summary>. References PRD <ZONE>-NNN and TECH <ZONE>-NNN.

## Test strategy

What levels we rely on and roughly why. Two or three sentences.

- Unit / integration: ...
- Service-level: ...
- End-to-end (Playwright / scripted): ...
- Manual-only: <list, each with a reason>

## Coverage map

Cross-reference PRD requirements to scenarios so nothing is missed.

| PRD item | Scenario IDs |
|----------|--------------|
| M1       | S1, S2       |
| M2       | S3           |
| N1       | S4 (deferred) |

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

## Acceptance criteria

Binary. Merge-blocking.

- [ ] All Must Have PRD items have at least one passing scenario.
- [ ] No failing scenarios at the declared level.
- [ ] No new unconditional REST endpoints unless TECH called them out.
- [ ] Feature flag (if any) is off by default and documented.
- [ ] `just lint` and `just test` pass on changed crates/apps.

## Manual verification steps

If a human has to press buttons before merge, list them numbered. Keep it to the steps automation truly can't cover.

1. On macOS desktop: open a Workspace with a GitHub remote, authenticate `gh` via the terminal, confirm the PR panel populates.
2. Leave the app overnight; next morning the PR panel should re-fetch on focus.

## Non-coverage

Things deliberately not tested in this pass and why.

- Multi-user concurrency on the same branch (single-user product in v1).
- GitHub Enterprise (not yet supported by TECH).
```

## Writing rules

- **English**.
- **Given / When / Then** is the default scenario shape. If a scenario is too small for this, it might belong in a unit test and not in TEST.md.
- **Name the signals**. Every Then clause should point at something checkable: DOM text, DB row, WS message name, log entry, file path.
- **Keep levels honest**. Don't mark something E2E if integration would prove it more cheaply and faster.
- **Don't invent APIs**. Use the message/endpoint names from TECH.md. If they don't exist there, update TECH first.

## Done criteria

- Every PRD Must Have appears in the Coverage map.
- At least one failure/edge scenario per Must Have.
- Acceptance criteria are binary and merge-blocking.
- Manual steps are named only when automation truly isn't feasible.
- No placeholder comments remain.

## Common mistakes to avoid

- Scenarios that restate the requirement ("S1 — Users can create PRs"). Make it concrete: inputs, action, observable result.
- Acceptance criteria that are soft ("feels snappy", "easy to use"). Turn them into budgets or scenarios.
- Over-indexing on E2E. The infra for a scripted PTY or tmux test is heavy; prefer service-level coverage when it proves the same thing.
- Skipping the regression checklist. That's often where the most value is for future reviewers.
- Committing to brittle test code shapes in the plan (exact assertion strings, exact selector paths). That's `atmos-specs-test-run`'s job and it'll adapt to the actual implementation.

## Hand-off

When TEST.md is ready, the next skill in the chain is `atmos-specs-test-run`: it reads this plan, writes the real test code (`#[cfg(test)]`, `bun test`, Playwright), runs the suite against the implementation, and updates TEST.md with a minimal status line per scenario (e.g. "S1 — ✅ covered by `crates/core-engine/src/github/mod.rs` test `lists_open_prs`"). Don't pre-fill those statuses here; they're a post-implementation artifact.
