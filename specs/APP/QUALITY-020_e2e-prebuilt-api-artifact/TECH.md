# TECH · QUALITY-020: E2E prebuilt API artifact

> Technical Design · HOW. Engineering cleanup: compile `api` once per `CI - E2E` run and reuse that binary on every Playwright shard. Not a product feature. No BRAINSTORM or PRD (quality spec). QUALITY-019 is already on `main` (`#341` squash `492cf064`); this branch merges `origin/main` and does not rebase.

## Scope summary

Addresses:

- **M1.** One `build` job runs `cargo build --bin api` (debug, same command as the old per-shard step).
- **M2.** That binary is uploaded as a workflow artifact. Each E2E matrix shard `needs: [plan, build]`, downloads it, and starts Playwright against that file.
- **M3.** Execute bits survive the artifact round-trip (`tar` plus `chmod +x`).
- **M4.** Shards do not install a Rust toolchain or restore `rust-cache`. `.github/actions/setup-e2e` takes `with-rust` (default `"true"`); the `run` job passes `with-rust: false`. The `build` job still installs `dtolnay/rust-toolchain@stable` and `Swatinem/rust-cache@v2` (`workspaces: ". -> target"`, `cache-on-failure: true`).
- **M5.** Shards must not call `cargo build --bin api` or `cargo run --bin api`. `just dev-api` honors `ATMOS_API_BIN` and `exec`s that path.

Out of scope: QUALITY-019 concurrency (already on `main`), compiling the web static export once, a release-profile API, sharing the `build` job rust-cache key with shards, changing Playwright suite planning, raising `oxlint --max-warnings` above 455, and `EVIDENCE_PUSH`.

## Quality target

| Item                       | Before                                                             | After                                                                       |
| -------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `cargo build --bin api`    | Once per matrix shard (7 shards on a global-path PR)               | Once in job `build`                                                         |
| Shard startup              | `setup-e2e` (Rust + bun + Playwright) then compile then Playwright | `setup-e2e` with `with-rust: false`, then download/restore, then Playwright |
| Execute bit after artifact | n/a                                                                | `tar -C target/debug -cvf api-bin.tar api`, download, extract, `chmod +x`   |
| `just dev-api` in CI       | `cargo run --bin api` (would rebuild without cargo fingerprints)   | `ATMOS_API_BIN=$GITHUB_WORKSPACE/target/debug/api` → `exec` that binary     |
| Rust toolchain / cache     | Every shard via `setup-e2e`                                        | `build` job only; shards skip both steps                                    |

## Architecture overview

```
plan (path → suites)
  │
  ▼
build  rust-toolchain + rust-cache + cargo build --bin api
  │    tar target/debug/api → artifact e2e-api-debug-bin
  ▼
run[suite]  setup-e2e (with-rust: false → just + bun + Playwright browsers)
  │         download tar → chmod +x
  │         ATMOS_API_BIN=.../target/debug/api
  │         bun ./scripts/run-ci-suite.mjs  →  just dev-api  →  exec $ATMOS_API_BIN
  ▼
merge reports  (needs plan, run — unchanged)
```

Touched files:

- `.github/workflows/ci-e2e.yml` — `build` job; `run` downloads instead of compiling and passes `with-rust: false`.
- `.github/actions/setup-e2e/action.yml` — optional Rust via `with-rust`.
- `justfile` — `dev-api` `ATMOS_API_BIN` escape hatch.
- `e2e/scripts/ci-e2e-workflow.test.cjs` — YAML contract (QUALITY-019 cases remain; QUALITY-020 cases added).
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

Restore still runs after `setup-e2e`. Shards no longer restore rust-cache, so that extract cannot overwrite `target/debug/api`. bun install does not write that path.

### Shards do not need cargo / rustc

Hopper P2: after the prebuilt binary, installing Rust on every shard is wasted work. Audit of the shard path:

- `e2e/scripts/run-ci-suite.mjs` only runs `bunx playwright`.
- `e2e/fixtures/app-server.ts` and `e2e/fixtures/global-setup.ts` start the API with `just dev-api` (execs `ATMOS_API_BIN` in CI).
- Web is `bun --filter web build` (Next static export). No `wasm-pack`, no other Rust bins.
- `just` comes from `taiki-e/install-action@just` (prebuilt), not `cargo install`.
- `.github/actions/setup-e2e` is only used by the `run` job in `ci-e2e.yml`.

If a shard still invoked `cargo` / `rustc`, CI would fail after this change. Re-enable with `with-rust: true` (the composite default).

### Cache

`build` owns rust-cache with the same inputs `setup-e2e` uses when `with-rust` is true. Shards do not restore or save that cache. The cache key still includes the job name, so the first `build` on a given lockfile can be a cold compile; sharing `shared-key` is out of scope.

### `should_run`

`build` uses the same `if: needs.plan.outputs.should_run == 'true'` as `run`. Empty suite plans skip compile.

### Wall-clock vs CPU-minutes

On a recent successful `main` run ([39490340813](https://github.com/AruNi-01/atmos/actions/runs/39490340813)) each shard's `Build API server` step was ~1.5–2.0 min **in parallel**. A dedicated `build` job adds that compile **before** shards start, and removes it from each shard. CPU-minutes drop by roughly `(shard_count - 1) × compile`. Skipping Rust on shards saves the per-shard toolchain + rust-cache restore (about 20–25s on [39530431470](https://github.com/AruNi-01/atmos/actions/runs/39530431470), measured from nested `setup-e2e` steps). Wall-clock depends on the longest shard plus the sequential `build`; this spec does not promise a 21 → much-smaller p90. Measure after the PR run.

## Rollout plan

1. QUALITY-020 spec + README row (this PR; QUALITY-019 is already on `main`).
2. `justfile` `ATMOS_API_BIN` before changing CI, so a shard cannot `cargo run` the restored binary.
3. Add `build`, point `run` at the artifact, delete the per-shard `cargo build --bin api` step.
4. Gate Rust in `setup-e2e` and pass `with-rust: false` from shards.
5. Extend `ci-e2e-workflow.test.cjs`.
6. Record this PR's `CI - E2E` duration against the QUALITY-019 baseline and against the prebuilt-but-still-Rust shard run.

## Risks & tradeoffs

- **Risk**: artifact download flakes. Use `upload-artifact@v4` / `download-artifact@v4` (same major as blob reports). One small tar is cheaper than the blob-merge parallel download that already flakes on v5.
- **Risk**: `ATMOS_API_BIN` pointing at a non-executable file. Fail the restore step before Playwright.
- **Risk**: a hidden shard step still needs `cargo` / `rustc`. The audit above found none; CI is the proof. Flip `with-rust` back to true without restoring per-shard compile.
- **If this breaks**: set `with-rust: true` on shards, or restore the per-shard `cargo build --bin api` step and drop `ATMOS_API_BIN`. `just dev-api` without the env is the old `cargo run`.

## Dependencies & compatibility

- Depends on: QUALITY-019, already on `main` via `#341`. This branch merges `origin/main`; no rebase, no force push.
- oxlint cap stays `--max-warnings=455`. Do not set `EVIDENCE_PUSH`.

## Open questions

None. Debug `api` (not `--release`) stays, matching today's shard compile.
