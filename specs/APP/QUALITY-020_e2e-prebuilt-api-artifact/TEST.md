# TEST · QUALITY-020: E2E prebuilt API artifact

> Test Plan · how we verify `CI - E2E` compiles `api` once and shards exec that binary without installing Rust. References TECH QUALITY-020.

## Test strategy

Workflow YAML plus `justfile` source contracts, a tiny `ATMOS_API_BIN` smoke on `just dev-api`, and the GitHub Actions run for this PR. No product UI; no agent-browser.

- Unit: `e2e/scripts/ci-e2e-workflow.test.cjs` (QUALITY-019 cases still pass; QUALITY-020 cases for `build` / artifact / `ATMOS_API_BIN` / shards skip Rust).
- Script: `ATMOS_API_BIN` missing vs `/bin/true`.
- CI: this PR must compile in `Build API`, not in `E2E - *` shards, and shard logs must skip `dtolnay/rust-toolchain` / `Swatinem/rust-cache`.

## Coverage map

| Requirement                                    | Scenario IDs |
| ---------------------------------------------- | ------------ |
| M1 one `cargo build --bin api` in `build`      | S1           |
| M2 shards `needs` `build` and download the tar | S2           |
| M3 tar + `chmod +x`                            | S3           |
| M4 shards skip rust-toolchain and rust-cache   | S4           |
| M5 shards do not compile; `just dev-api` execs | S5, S6       |
| QUALITY-019 concurrency still holds            | S7           |
| oxlint 455 / no `EVIDENCE_PUSH`                | S8           |
| GitHub Actions uses the prebuilt binary        | S9           |

## Execution map

| Scenario | Level  | Expected tool | Target command / method                         | Fixture / data    | Signals                                                                           | Status |
| -------- | ------ | ------------- | ----------------------------------------------- | ----------------- | --------------------------------------------------------------------------------- | ------ |
| S1       | Unit   | Bun           | `bun test e2e/scripts/ci-e2e-workflow.test.cjs` | workflow YAML     | `build` job contains `cargo build --bin api`; `run` job does not                  | pass   |
| S2       | Unit   | Bun           | same                                            | workflow YAML     | `run` `needs: [plan, build]`; `download-artifact` name `e2e-api-debug-bin`        | pass   |
| S3       | Unit   | Bun           | same                                            | workflow YAML     | `tar` pack/extract and `chmod +x`                                                 | pass   |
| S4       | Unit   | Bun           | same                                            | workflow + action | `run` passes `with-rust: false`; rust steps gated on `inputs.with-rust == 'true'` | pass   |
| S5       | Unit   | Bun           | same                                            | workflow YAML     | job-level `ATMOS_API_BIN` points at `target/debug/api`                            | pass   |
| S6       | Script | just          | `ATMOS_API_BIN=/bin/true just dev-api --port 1` | no cargo          | exits 0; a missing path prints `not executable` and exits non-zero                | pass   |
| S7       | Unit   | Bun           | same                                            | workflow YAML     | QUALITY-019 `cancel-in-progress` expression still present                         | pass   |
| S8       | Review | File read     | `package.json`                                  | repo root         | `--max-warnings=455`; diff has no `EVIDENCE_PUSH`                                 | pass   |
| S9       | CI     | GitHub        | PR `CI - E2E`                                   | this PR           | `Build API` compiles; shards Restore; no per-shard cargo/rust-toolchain           | pass   |

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

### S4 — Shards skip Rust

- **Level**: Unit
- **Given**: the `run` job and `.github/actions/setup-e2e/action.yml`.
- **When**: both are read.
- **Then**: `run` calls `setup-e2e` with `with-rust: false` and does not mention `dtolnay/rust-toolchain` or `Swatinem/rust-cache@v2`. The composite default is `"true"`. Both Rust steps use `if: ${{ inputs.with-rust == 'true' }}`. `build` still has rust-cache with `. -> target` and `cache-on-failure: true`.
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

### S9 — GitHub Actions actually skipped per-shard compile and Rust

- **Level**: CI
- **Given**: this draft PR (workflow + `setup-e2e` + `e2e/scripts` are global E2E paths).
- **When**: `CI - E2E` finishes.
- **Then**: job `Build API` logged `cargo build --bin api`. Each `E2E - *` job has `Restore prebuilt API binary`, does not have a `Build API server` step, and skips `Install Rust (stable)` / `Cache Rust dependencies`. Wall-clock is recorded against the QUALITY-019 18-run main baseline and against run `39530431470` (prebuilt API, Rust still on shards).
- **Signals**: Actions logs; run URL in the PR body.

## Performance & load budgets

Baseline (QUALITY-019 sample, 18 successful `main` runs): p50 ≈ 12.4 min, p90 ≈ 16.7 min, max ≈ 18.0 min. Per-shard compile on [39490340813](https://github.com/AruNi-01/atmos/actions/runs/39490340813) was ~1.5–2.0 min overlapping.

Prebuilt API with Rust still on shards ([39530431470](https://github.com/AruNi-01/atmos/actions/runs/39530431470)): workflow wall-clock 14.70 min. Nested `setup-e2e` on `E2E - specs`: `dtolnay/rust-toolchain` 8.8s + `Swatinem/rust-cache` 16.1s ≈ 25s. rust-cache restore across shards 11.5–16.7s.

After skipping Rust, record:

- `setup-e2e` duration vs the table above
- longest `E2E - *` duration
- workflow wall-clock vs `39530431470` and the 18-run sample

Do not treat a small wall-clock change as failure if CPU-minutes dropped (compile no longer repeats × shards, and Rust is no longer installed × shards).

## Regression checklist

- [ ] No per-shard `cargo build --bin api`.
- [ ] Restore happens after `setup-e2e`.
- [ ] `ATMOS_API_BIN` is set on the `run` job, not only in a comment.
- [ ] Shards pass `with-rust: false`.
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

1. Open the PR `CI - E2E` log: `Build API` compiled; a shard's `Run suite` did not spawn `cargo run --bin api` / `Compiling`; shard `setup-e2e` skipped `Install Rust (stable)` and `Cache Rust dependencies`.

## Non-coverage

- Compiling the Next static export once (still per shard).
- `--release` API.
- rust-cache `shared-key` between `build` and shards.

## Coverage Status

Verified 2026-10-21 (local, before GitHub Actions):

- S1–S5, S7 — pass. `bun test e2e/scripts/ci-e2e-workflow.test.cjs` → 8 pass (3 QUALITY-019 + 5 QUALITY-020).
- S6 — pass. `ATMOS_API_BIN=/bin/true just dev-api --port 1` exit 0. `ATMOS_API_BIN=/nonexistent-atmos-api just dev-api --port 1` exit 1 with `ATMOS_API_BIN is not executable`.
- S8 — pass. `package.json` `lint` is `oxlint --max-warnings=455`. Diff does not mention `EVIDENCE_PUSH`.
- S9 — pass. Draft PR `CI - E2E` https://github.com/AruNi-01/atmos/actions/runs/39528133219 conclusion `success`. Job `Build API` ran `cargo build --bin api` (compile 5.10 min). `E2E - specs` restored `api` from `api-bin.tar` (`ATMOS_API_BIN=/home/runner/work/atmos/atmos/target/debug/api`); Run suite log has no `cargo build --bin api`. `CI - JS` https://github.com/AruNi-01/atmos/actions/runs/39528133208 success (oxlint + oxfmt). Not triggered: `CI - Backend`, `CI - Web`, `CI - Packages` (path filters).

P2 (skip Rust on shards) verified 2026-10-21, head `931c04c67`:

- Local: `bun test e2e/scripts/ci-e2e-workflow.test.cjs` still 8 pass after rewriting S4.
- S9 — pass. `CI - E2E` https://github.com/AruNi-01/atmos/actions/runs/39534182493 conclusion `success` (wall 10.35 min). `CI - JS` https://github.com/AruNi-01/atmos/actions/runs/39534182508 success (oxlint + oxfmt). `E2E - specs` / `E2E - smoke-onboarding` logs: `dtolnay/rust-toolchain` and `Swatinem/rust-cache` `outcome=skipped;duration_ms=0`. No `cargo build` / `cargo run` on shards.
- setup-e2e vs prebuilt-but-still-Rust run [39530431470](https://github.com/AruNi-01/atmos/actions/runs/39530431470): specs 79s → 51s (−28s); shards 56–102s → 45–55s. Nested rust-toolchain + rust-cache on 39530431470 was ~20–25s/分片.

```
bun test e2e/scripts/ci-e2e-workflow.test.cjs
ATMOS_API_BIN=/bin/true just dev-api --port 1
ATMOS_API_BIN=/nonexistent-atmos-api just dev-api --port 1
bunx oxlint e2e/scripts/ci-e2e-workflow.test.cjs
```
