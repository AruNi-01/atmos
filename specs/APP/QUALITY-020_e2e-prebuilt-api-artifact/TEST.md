# TEST · QUALITY-020: E2E prebuilt API artifact

> Test Plan · how we verify `CI - E2E` compiles `api` once and shards exec that binary. References TECH QUALITY-020.

## Test strategy

Workflow YAML plus `justfile` source contracts, a tiny `ATMOS_API_BIN` smoke on `just dev-api`, and the GitHub Actions run for this PR. No product UI; no agent-browser.

- Unit: `e2e/scripts/ci-e2e-workflow.test.cjs` (QUALITY-019 cases still pass; new cases for `build` / artifact / `ATMOS_API_BIN`).
- Script: `ATMOS_API_BIN` missing vs `/bin/true`.
- CI: this PR must compile in `Build API`, not in `E2E - *` shards.

## Coverage map

| Requirement                                      | Scenario IDs |
| ------------------------------------------------ | ------------ |
| M1 one `cargo build --bin api` in `build`        | S1           |
| M2 shards `needs` `build` and download the tar   | S2           |
| M3 tar + `chmod +x`                              | S3           |
| M4 rust-cache inputs unchanged on shards + build | S4           |
| M5 shards do not compile; `just dev-api` execs   | S5, S6       |
| QUALITY-019 concurrency still holds              | S7           |
| oxlint 455 / no `EVIDENCE_PUSH`                  | S8           |
| GitHub Actions uses the prebuilt binary          | S9           |

## Execution map

| Scenario | Level  | Expected tool | Target command / method                         | Fixture / data    | Signals                                                                              | Status  |
| -------- | ------ | ------------- | ----------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------ | ------- |
| S1       | Unit   | Bun           | `bun test e2e/scripts/ci-e2e-workflow.test.cjs` | workflow YAML     | `build` job contains `cargo build --bin api`; `run` job does not                     | pass    |
| S2       | Unit   | Bun           | same                                            | workflow YAML     | `run` `needs: [plan, build]`; `download-artifact` name `e2e-api-debug-bin`           | pass    |
| S3       | Unit   | Bun           | same                                            | workflow YAML     | `tar` pack/extract and `chmod +x`                                                    | pass    |
| S4       | Unit   | Bun           | same                                            | workflow + action | `Swatinem/rust-cache@v2` with `. -> target` and `cache-on-failure: true` on `build`  | pass    |
| S5       | Unit   | Bun           | same                                            | workflow YAML     | job-level `ATMOS_API_BIN` points at `target/debug/api`                               | pass    |
| S6       | Script | just          | `ATMOS_API_BIN=/bin/true just dev-api --port 1` | no cargo          | exits 0; a missing path prints `not executable` and exits non-zero                   | pass    |
| S7       | Unit   | Bun           | same                                            | workflow YAML     | QUALITY-019 `cancel-in-progress` expression still present                            | pass    |
| S8       | Review | File read     | `package.json`                                  | repo root         | `--max-warnings=455`; diff has no `EVIDENCE_PUSH`                                    | pass    |
| S9       | CI     | GitHub        | PR `CI - E2E`                                   | this PR           | `Build API` has the compile step; shard logs have Restore / no per-shard cargo build | planned |

## Scenarios

### S1 — Compile lives in `build` only

- **Level**: Unit
- **Given**: `.github/workflows/ci-e2e.yml`.
- **When**: the Bun test splits the `build` and `run` job texts.
- **Then**: `build` contains `cargo build --bin api`. The `run` job body does not.
- **Signals**: string presence / absence.

### S2 — Shards wait for the artifact

- **Level**: Unit
- **Given**: the `run` job.
- **When**: `needs` and download steps are read.
- **Then**: `needs` includes `build`. `actions/download-artifact@v4` uses `name: e2e-api-debug-bin`.
- **Signals**: YAML text.

### S3 — Mode is restored

- **Level**: Unit
- **Given**: pack and restore steps.
- **When**: the test reads them.
- **Then**: pack uses `tar` of `target/debug` `api`; restore extracts then `chmod +x target/debug/api`.
- **Signals**: both `tar` and `chmod +x` appear in the workflow.

### S4 — Cargo cache policy kept

- **Level**: Unit
- **Given**: `build` job rust-cache step and `.github/actions/setup-e2e/action.yml`.
- **When**: both are compared.
- **Then**: `build` uses `Swatinem/rust-cache@v2` with `workspaces: ". -> target"` and `cache-on-failure: true`. `setup-e2e` still has those inputs (shards still call it).
- **Signals**: file text.

### S5 — Job exports `ATMOS_API_BIN`

- **Level**: Unit
- **Given**: the `run` job.
- **When**: its `env` is read.
- **Then**: `ATMOS_API_BIN` is `${{ github.workspace }}/target/debug/api`.
- **Signals**: string match.

### S6 — `just dev-api` execs the prebuilt path

- **Level**: Script
- **Given**: `justfile` `dev-api` after the QUALITY-020 change.
- **When**: `ATMOS_API_BIN=/bin/true just dev-api --port 1` and `ATMOS_API_BIN=/nonexistent-atmos-api just dev-api --port 1`.
- **Then**: `/bin/true` exits 0 without invoking cargo. The missing path prints `ATMOS_API_BIN is not executable` and exits non-zero.
- **Signals**: exit codes and stderr.

### S7 — QUALITY-019 still holds

- **Level**: Unit
- **Given**: the same workflow file.
- **When**: QUALITY-019 tests run.
- **Then**: root `cancel-in-progress` is still the `pull_request` expression; group fallback is still `github.ref`.
- **Signals**: existing Bun cases.

### S8 — Lint cap

- **Level**: Review
- **Given**: this spec's diff.
- **When**: `package.json` is read.
- **Then**: `oxlint --max-warnings=455`. No `EVIDENCE_PUSH`.
- **Signals**: file text.

### S9 — GitHub Actions actually skipped per-shard compile

- **Level**: CI
- **Given**: this draft PR (workflow + `e2e/scripts` are global E2E paths).
- **When**: `CI - E2E` finishes.
- **Then**: job `Build API` logged `cargo build --bin api`. Each `E2E - *` job has `Restore prebuilt API binary` and does not have a `Build API server` step. Wall-clock is recorded against the QUALITY-019 18-run main baseline.
- **Signals**: Actions logs; run URL in the PR body.

## Performance & load budgets

Baseline (QUALITY-019 sample, 18 successful `main` runs): p50 ≈ 12.4 min, p90 ≈ 16.7 min, max ≈ 18.0 min. Per-shard compile on [39490340813](https://github.com/AruNi-01/atmos/actions/runs/39490340813) was ~1.5–2.0 min overlapping.

After this PR, record:

- `Build API` duration
- longest `E2E - *` duration
- workflow wall-clock vs the 18-run sample

Do not treat a small wall-clock change as failure if CPU-minutes dropped (compile no longer repeats × shards).

## Regression checklist

- [ ] No per-shard `cargo build --bin api`.
- [ ] Restore happens after `setup-e2e`.
- [ ] `ATMOS_API_BIN` is set on the `run` job, not only in a comment.
- [ ] QUALITY-019 concurrency expression still present.
- [ ] oxlint cap 455.

## Exploratory agent-browser checks

Omitted. No user-facing surface.

## Acceptance criteria

- [ ] S1–S8 pass at the declared level.
- [ ] `bun test e2e/scripts/ci-e2e-workflow.test.cjs` exits 0.
- [ ] `ATMOS_API_BIN=/bin/true just dev-api --port 1` exits 0.
- [ ] Draft PR; implementing agent does not merge.

## Manual verification steps

1. Open the PR `CI - E2E` log: `Build API` compiled; a shard's `Run suite` did not spawn `cargo run --bin api` / `Compiling`.

## Non-coverage

- Compiling the Next static export once (still per shard).
- `--release` API.

## Coverage Status

Verified 2026-10-21 (local, before GitHub Actions):

- S1–S5, S7 — pass. `bun test e2e/scripts/ci-e2e-workflow.test.cjs` → 8 pass (3 QUALITY-019 + 5 QUALITY-020).
- S6 — pass. `ATMOS_API_BIN=/bin/true just dev-api --port 1` exit 0. `ATMOS_API_BIN=/nonexistent-atmos-api just dev-api --port 1` exit 1 with `ATMOS_API_BIN is not executable`.
- S8 — pass. `package.json` `lint` is `oxlint --max-warnings=455`. Diff does not mention `EVIDENCE_PUSH`.
- S9 — pending GitHub Actions on the draft PR.

```
bun test e2e/scripts/ci-e2e-workflow.test.cjs
ATMOS_API_BIN=/bin/true just dev-api --port 1
ATMOS_API_BIN=/nonexistent-atmos-api just dev-api --port 1
bunx oxlint e2e/scripts/ci-e2e-workflow.test.cjs
```
