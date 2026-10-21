# TECH · QUALITY-020: E2E prebuilt API artifact

> Technical Design · HOW. Engineering cleanup: compile `api` once per `CI - E2E` run and reuse that binary on every Playwright shard. Not a product feature. No BRAINSTORM or PRD (quality spec). Stacks on QUALITY-019 without rebase.

## Scope summary

Addresses:

- **M1.** One `build` job runs `cargo build --bin api` (debug, same command as today's per-shard step).
- **M2.** That binary is uploaded as a workflow artifact. Each E2E matrix shard `needs: [plan, build]`, downloads it, and starts Playwright against that file.
- **M3.** Execute bits survive the artifact round-trip (`tar` plus `chmod +x`).
- **M4.** Shards keep `.github/actions/setup-e2e` including `Swatinem/rust-cache@v2` (`workspaces: ". -> target"`, `cache-on-failure: true`). The new `build` job uses the same cache settings.
- **M5.** Shards must not call `cargo build --bin api` or `cargo run --bin api`. `just dev-api` honors `ATMOS_API_BIN` and `exec`s that path.

Out of scope: QUALITY-019 concurrency (already on this branch), compiling the web static export once, a release-profile API, changing Playwright suite planning, raising `oxlint --max-warnings` above 455, and `EVIDENCE_PUSH`.

## Quality target

| Item                       | Before                                                           | After                                                                     |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `cargo build --bin api`    | Once per matrix shard (7 shards on a global-path PR)             | Once in job `build`                                                       |
| Shard startup              | `setup-e2e` then compile then Playwright                         | `setup-e2e` then download/restore then Playwright                         |
| Execute bit after artifact | n/a                                                              | `tar -C target/debug -cvf api-bin.tar api`, download, extract, `chmod +x` |
| `just dev-api` in CI       | `cargo run --bin api` (would rebuild without cargo fingerprints) | `ATMOS_API_BIN=$GITHUB_WORKSPACE/target/debug/api` → `exec` that binary   |
| Rust cache                 | `setup-e2e` only                                                 | Same action inputs on `build` **and** shards                              |

## Architecture overview

```
plan (path → suites)
  │
  ▼
build  rust-toolchain + rust-cache + cargo build --bin api
  │    tar target/debug/api → artifact e2e-api-debug-bin
  ▼
run[suite]  setup-e2e (unchanged cache) → download tar → chmod +x
  │         ATMOS_API_BIN=.../target/debug/api
  │         bun ./scripts/run-ci-suite.mjs  →  just dev-api  →  exec $ATMOS_API_BIN
  ▼
merge reports  (needs plan, run — unchanged)
```

Touched files:

- `.github/workflows/ci-e2e.yml` — `build` job; `run` downloads instead of compiling.
- `justfile` — `dev-api` `ATMOS_API_BIN` escape hatch.
- `e2e/scripts/ci-e2e-workflow.test.cjs` — YAML contract (extends QUALITY-019).
- This spec.

## Design

### Why a companion `justfile` change

E2E CI starts the API through Playwright `webServer` → `e2e/fixtures/app-server.ts` → `just dev-api`. That recipe is `cargo run --bin api`. Restoring only `target/debug/api` without cargo fingerprint/deps makes `cargo run` rebuild, which would erase the win.

`ATMOS_API_BIN` is opt-in. Local `just dev-api` is unchanged unless the env is set. CI sets it at the `run` job level so Playwright's child `bash -lc` inherits it.

### Artifact packing

`actions/upload-artifact` does not preserve mode. Pack a single-member tar (no gzip; the action already compresses):

```bash
test -x target/debug/api
tar -C target/debug -cvf api-bin.tar api
```

Shards:

```bash
mkdir -p target/debug
tar -C target/debug -xvf "$API_TAR"
chmod +x target/debug/api
test -x "$ATMOS_API_BIN"
```

Restore **after** `setup-e2e` so rust-cache's `target/` extract cannot overwrite the downloaded binary.

### Cache

Do not change `.github/actions/setup-e2e`. `build` copies its rust-cache inputs so `cargo build --bin api` can hit the same lockfile-keyed cache. Shards still restore that cache even though they no longer compile; that matches "保留现有 cargo 缓存策略" and keeps a warm `target/` for anything else in `setup-e2e`.

### `should_run`

`build` uses the same `if: needs.plan.outputs.should_run == 'true'` as `run`. Empty suite plans skip compile.

### Wall-clock vs CPU-minutes

On a recent successful `main` run ([39490340813](https://github.com/AruNi-01/atmos/actions/runs/39490340813)) each shard's `Build API server` step was ~1.5–2.0 min **in parallel**. A dedicated `build` job adds that compile **before** shards start, and removes it from each shard. CPU-minutes drop by roughly `(shard_count - 1) × compile`. Wall-clock depends on whether the sequential compile is cheaper than overlapping per-shard compiles; this spec does not promise a 21 → much-smaller p90. Measure after the PR run.

## Rollout plan

1. QUALITY-020 spec + README row (this PR, stacked on QUALITY-019).
2. `justfile` `ATMOS_API_BIN` before changing CI, so a shard cannot `cargo run` the restored binary.
3. Add `build`, point `run` at the artifact, delete the per-shard `cargo build --bin api` step.
4. Extend `ci-e2e-workflow.test.cjs`.
5. Record this PR's `CI - E2E` duration against the QUALITY-019 baseline sample.

## Risks & tradeoffs

- **Risk**: artifact download flakes. Use `upload-artifact@v4` / `download-artifact@v4` (same major as blob reports). One small tar is cheaper than the blob-merge parallel download that already flakes on v5.
- **Risk**: stale binary if restore ran before rust-cache. Order is checkout → setup-e2e → download → restore.
- **Risk**: `ATMOS_API_BIN` pointing at a non-executable file. Fail the restore step before Playwright.
- **Tradeoff**: shards still install a Rust toolchain via `setup-e2e`. Keeping that action avoids a second E2E setup path; the compile is what we stop repeating.
- **If this breaks**: restore the per-shard `cargo build --bin api` step and drop `ATMOS_API_BIN`. `just dev-api` without the env is the old `cargo run`.

## Dependencies & compatibility

- Depends on: QUALITY-019 (this branch includes it; do not rebase onto a newer `main` for this PR).
- oxlint cap stays `--max-warnings=455`. Do not set `EVIDENCE_PUSH`.

## Open questions

None. Debug `api` (not `--release`) stays, matching today's shard compile.
