# TEST · QUALITY-019: E2E concurrency preserves main

> Test Plan · how we verify `CI - E2E` cancels in-progress runs only for pull requests. References TECH QUALITY-019.

## Test strategy

This is a workflow-concurrency contract. Proof is a Bun source assertion on `.github/workflows/ci-e2e.yml` plus reading the GitHub Actions run for this PR. There is no product UI and no agent-browser pass.

- Unit: `e2e/scripts/ci-e2e-workflow.test.cjs` reads the YAML text.
- CI: the PR must trigger `CI - E2E` (the workflow file is in its own `paths` and `global` filters) and `CI - JS` (no path filter). Other workflows should not run.
- Manual: observe that a `main` group would not set `cancel-in-progress` true. We cannot merge to `main` from this spec.

## Coverage map

| Requirement                                            | Scenario IDs |
| ------------------------------------------------------ | ------------ |
| M1 `cancel-in-progress` true only for `pull_request`   | S1           |
| M2 `main` push shares `github.ref` and does not cancel | S2           |
| M3 same PR still cancels in-progress                   | S1, S3       |
| Do not unique-group `main` with `run_id`               | S2           |
| `merge` Pages concurrency unchanged                    | S4           |
| oxlint cap 455 / no `EVIDENCE_PUSH`                    | S5           |

## Execution map

| Scenario | Level  | Expected tool | Target command / method                         | Fixture / data | Signals                                                                                       | Status  |
| -------- | ------ | ------------- | ----------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------- | ------- |
| S1       | Unit   | Bun           | `bun test e2e/scripts/ci-e2e-workflow.test.cjs` | workflow YAML  | root `cancel-in-progress` is the `pull_request` expression                                    | pass    |
| S2       | Unit   | Bun           | same                                            | workflow YAML  | group fallback is `github.ref`, not `github.run_id`                                           | pass    |
| S3       | Review | File read     | inspect group key                               | workflow YAML  | PR number still in the group                                                                  | pass    |
| S4       | Unit   | Bun           | same                                            | `merge` job    | `ci-e2e-pages-report` + `cancel-in-progress: false`                                           | pass    |
| S5       | Review | File read     | `package.json` `lint`                           | repo root      | `--max-warnings=455`; no `EVIDENCE_PUSH` in this change                                       | pass    |
| S6       | CI     | GitHub        | PR checks                                       | this PR        | `CI - JS` and `CI - E2E` run; backend/web/packages jobs are skipped by path filters if absent | planned |

## Scenarios

### S1 — Root cancel-in-progress is PR-only

- **Level**: Unit
- **Given**: `.github/workflows/ci-e2e.yml` workflow-level `concurrency` (the block before `jobs:`).
- **When**: the Bun test extracts that block.
- **Then**: it contains `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` and does not contain a bare `cancel-in-progress: true`.
- **Signals**: string match on the extracted block.

### S2 — main push queues on `github.ref`

- **Level**: Unit
- **Given**: the same workflow-level `group`.
- **When**: the test reads the group expression.
- **Then**: the fallback after `github.event.pull_request.number` is `github.ref`. The workflow-level group does not interpolate `github.run_id`.
- **Signals**: group line equals today's key with the PR-number-or-ref fallback.

### S3 — Same PR still shares one group

- **Level**: Review
- **Given**: a `pull_request` event.
- **When**: GitHub evaluates the group.
- **Then**: `github.event.pull_request.number` is used, so two pushes to PR _N_ collide and the expression in S1 cancels the older run.
- **Signals**: group source still includes `github.event.pull_request.number`.

### S4 — Pages merge concurrency is untouched

- **Level**: Unit
- **Given**: the `merge` job.
- **When**: its `concurrency` block is read.
- **Then**: `group: ci-e2e-pages-report` and `cancel-in-progress: false`.
- **Signals**: Bun assertions on that nested block.

### S5 — Lint cap and evidence policy

- **Level**: Review
- **Given**: this spec's diff.
- **When**: `package.json` and the diff are read.
- **Then**: `lint` remains `oxlint --max-warnings=455`. The change does not set `EVIDENCE_PUSH`.
- **Signals**: file text; `git diff` does not mention `EVIDENCE_PUSH`.

### S6 — Expected CI jobs

- **Level**: CI
- **Given**: a PR that touches `.github/workflows/ci-e2e.yml`, `e2e/scripts/**`, and `specs/**`.
- **When**: GitHub Actions starts.
- **Then**: `CI - JS` (oxlint, oxfmt) and `CI - E2E` run. `CI - Backend`, `CI - Web`, and `CI - Packages` stay idle unless some other path in the PR matches them.
- **Signals**: PR checks list.

## Performance & load budgets

Not a runtime path. QUALITY-019 does not claim a wall-clock reduction; it only stops `main` E2E from being cancelled. Baseline for later QUALITY-020 comparison (source: `gh run list --workflow=ci-e2e.yml --branch main`, successful runs, `run_started_at` → `updated_at`):

- n = 18 recent successful `main` runs
- p50 ≈ 12.4 min, p90 ≈ 16.7 min, max ≈ 18.0 min
- Background figure from the request (p90 ≈ 21 min) is a looser bound; this spec records the measured sample rather than that figure.

## Regression checklist

- [ ] Workflow-level `cancel-in-progress` is not restored to `true`.
- [ ] `main` group is not uniqued with `run_id`.
- [ ] `merge` job Pages group still does not cancel in-progress deploys.
- [ ] oxlint cap stays 455.

## Exploratory agent-browser checks

Omitted. No user-facing surface.

## Acceptance criteria

- [ ] S1–S5 pass at the declared level.
- [ ] `bun test e2e/scripts/ci-e2e-workflow.test.cjs` exits 0.
- [ ] `package.json` `lint` is still `oxlint --max-warnings=455`.
- [ ] This PR is draft and is not merged by the implementing agent.

## Manual verification steps

1. After merge (maintainer): push two commits to `main` close together and confirm the first `CI - E2E` run finishes (`conclusion` is not `cancelled` solely because of the second push).
2. Open a PR, push a second commit, confirm the first `CI - E2E` run is cancelled.

## Non-coverage

- Forcing two live `main` pushes in this draft PR (cannot push to `main` from here).
- GitHub's pending-run cancellation when a third push arrives (platform behavior; documented in TECH).

## Coverage Status

Verified 2026-10-21 (local, before GitHub Actions):

- S1, S2, S4 — pass. `bun test e2e/scripts/ci-e2e-workflow.test.cjs` → 3 pass.
- S3 — pass by inspection. Workflow-level group is `ci-e2e-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}`.
- S5 — pass. `package.json` `lint` is `oxlint --max-warnings=455`. Diff does not mention `EVIDENCE_PUSH`. `bunx oxlint e2e/scripts/ci-e2e-workflow.test.cjs` and `bunx oxfmt --check` on the spec + test paths exited 0.
- S6 — pending GitHub Actions on the draft PR.

```
bun test e2e/scripts/ci-e2e-workflow.test.cjs
bunx oxlint e2e/scripts/ci-e2e-workflow.test.cjs
```
