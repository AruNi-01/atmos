# TEST · QUALITY-022: iOS Simulator CI Cache

> Test Plan · how we verify generated-`ios/` caching on `ios-build` without changing the `ios-parity` label gate. References TECH QUALITY-022. Job graph is QUALITY-023.

## Test strategy

This is a workflow change. There is no iOS Simulator on the Linux agent, so the heavy job is not executed here.

- **Bun tests** in `apps/mobile` (the `structural` job already runs `bun test` there) lock YAML: trigger, ios-gen skip gates on `ios-build`, QUALITY-023 `needs`, no DerivedData cache, lint cap.
- **actionlint** on the workflow file when the binary is available.
- **Toolchain:** `bun lint` stays `oxlint --max-warnings=455`. `oxfmt` on changed paths.
- **Manual:** labeled miss vs hit on `macos-26`. This work must not add or remove the `ios-parity` label.
- **Exploratory agent-browser:** omitted. No product UI.

## Coverage map

| Requirement                                                        | Scenario IDs |
| ------------------------------------------------------------------ | ------------ |
| Exact `ios-gen` cache of `apps/mobile/ios`; no restore-keys        | S1, S2       |
| Miss path runs prebuild + `pod install`; hit skips both            | S1           |
| CocoaPods home cache only on miss                                  | S1           |
| No DerivedData cache / mtime pin / prune-before-save               | S3           |
| Key includes os, Xcode, `patches/**`, workflow YAML; no PR scope   | S2, S11      |
| Clean local `-derivedDataPath` + CompileC count, no Actions cache  | S3           |
| ios-gen save after successful `xcodebuild`; PR save not main-gated | S4           |
| `workflow_dispatch` on `main` can save; GHA cache is ref-isolated  | S12          |
| Trigger stays dispatch or `ios-parity` label                       | S5           |
| Cache stays on `ios-build`; motion `needs` stills                  | S10          |
| No `push:` trigger; oxlint cap stays 455                           | S5, S6       |
| actionlint                                                         | S7           |
| Miss vs hit wall time (ios-gen skip ~2 min)                        | S8           |

## Execution map

| Scenario | Level     | Expected tool  | Target command / method                                 | Fixture / data                 | Signals                                                                                                | Status |
| -------- | --------- | -------------- | ------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ | ------ |
| S1       | Unit      | `bun test`     | `apps/mobile/script/ios-parity-ci-cache.test.ts`        | workflow YAML                  | ios-gen restore/save; prebuild/pod `if` cache-hit != true                                              | pass   |
| S2       | Unit      | `bun test`     | same                                                    | workflow YAML                  | exact key fragments; ios-gen has no restore-keys; no PR scope in key                                   | pass   |
| S3       | Unit      | `bun test`     | same                                                    | workflow YAML                  | no `ios-dd-` / mtime pin; summary has ios-gen + CompileC only for caches we keep                       | pass   |
| S4       | Unit      | `bun test`     | same                                                    | workflow YAML                  | ios-gen / podhome save after `xcodebuild`; `xcodebuild.conclusion == success`; save not `main`-gated   | pass   |
| S12      | Unit      | `bun test`     | same                                                    | workflow YAML                  | `ios-build` `if` includes `workflow_dispatch` with no `github.ref` extra gate; no `push:`              | pass   |
| S11      | Unit      | `bun test`     | same                                                    | workflow YAML                  | `hashFiles` includes `patches/**` and `ci-mobile-ios-parity.yml`                                       | pass   |
| S5       | Unit      | `bun test`     | same + existing evidence-safety workflow test           | workflow YAML                  | `on:` has no `push:`; macOS jobs `if` is dispatch or label; structural has no label `if`               | pass   |
| S10      | Unit      | `bun test`     | same                                                    | workflow YAML                  | cache steps only on `ios-build`; stills `needs: ios-build`; motion `needs: [ios-build, ios-simulator]` | pass   |
| S6       | Toolchain | shell          | `package.json` `lint` script                            | repo root                      | `oxlint --max-warnings=455`                                                                            | pass   |
| S7       | Toolchain | actionlint     | `actionlint .github/workflows/ci-mobile-ios-parity.yml` | workflow YAML                  | exit 0, or documented ignore for unknown `macos-26` only                                               | pass   |
| S8       | Manual    | GitHub Actions | labeled miss, then Re-run                               | Eng Manager `ios-parity` label | ios-gen miss then exact hit; prebuild/pod skipped on hit                                               | pass   |
| S9       | Unit      | `bun test`     | `apps/mobile` bun test                                  | mobile tests                   | existing evidence-safety + cache tests pass                                                            | pass   |

## Scenarios

### S1 — ios-gen skip gate

- **Level**: Unit
- **Given**: `.github/workflows/ci-mobile-ios-parity.yml`.
- **When**: the bun test reads the `ios-build` job.
- **Then**: Restore/save path is `apps/mobile/ios`. Prebuild, `pod install`, and CocoaPods home restore are gated on `steps.ios-restore.outputs.cache-hit != 'true'`. Verify step always exists. Actions are `actions/cache/restore@v4` and `actions/cache/save@v4`.
- **Signals**: string assertions on the job slice.

### S2 — Key and restore-keys

- **Level**: Unit
- **Given**: the same YAML.
- **When**: the test reads cache `key` / `restore-keys`.
- **Then**:
  - ios-gen exact key hashes `bun.lock`, `apps/mobile/package.json`, `app.config.js`, `app.json`, `plugins/**`, `modules/**`, `exclude-dev-client.js`, `patches/**`, and `.github/workflows/ci-mobile-ios-parity.yml`, plus os / Xcode version.
  - ios-gen key does **not** include `steps.xcode.outputs.scope`.
  - ios-gen contains **no** `restore-keys:`.
  - CocoaPods home `restore-keys` are xcode then os prefixes.
  - The Xcode step writes `version=` from `xcodebuild -version` to `GITHUB_OUTPUT`.
- **Signals**: ordered substring checks.

### S3 — No DerivedData cache

- **Level**: Unit
- **Given**: the `ios-build` job.
- **When**: the test reads it.
- **Then**: there is no `ios-dd-` key, no Restore/Save DerivedData cache steps, no mtime pin, no prune-before-save. The build job summary writes ios-gen hit and CompileC count, not `deriveddata cache-hit`. `xcodebuild` uses a clean local `-derivedDataPath` (`rm -rf`) and `COMPILER_INDEX_STORE_ENABLE=NO`.
- **Signals**: absence of cache steps; presence of local derived path.

### S4 — ios-gen save after xcodebuild

- **Level**: Unit
- **Given**: save and build steps.
- **When**: the test compares character offsets and `if:`.
- **Then**: Save CocoaPods download cache and Save generated iOS tree appear after `Build Release simulator app`. Both require `steps.xcodebuild.conclusion == 'success'` and miss-path `cache-hit != 'true'`. Save is **not** gated on `github.ref == 'refs/heads/main'`: a labeled PR Re-run must still be able to write `refs/pull/<n>/merge`. That copy is **not** readable by other PRs or `main`. No `push:` trigger.
- **Signals**: index order; save `if:` strings.

### S12 — Dispatch on main seeds the base cache

- **Level**: Unit
- **Given**: GitHub Actions cache is isolated by ref. A PR restore may read only its own `refs/pull/<n>/merge` cache and the base (`main`) cache.
- **When**: the test reads `on:` and the `ios-build` job `if:` / save `if:`.
- **Then**:
  - `on:` includes `workflow_dispatch:` and has no `push:`.
  - `ios-build` `if:` includes `github.event_name == 'workflow_dispatch'` and does not add a `github.ref` / `refs/heads/main` extra gate, so a dispatch with branch `main` reaches save.
  - Save `if:` is miss + `xcodebuild` success only (same as S4).
- **Signals**: job `if:` and `on:` substring checks.

### S11 — patches and workflow in the key

- **Level**: Unit
- **Given**: the ios-gen `key:`.
- **When**: the test reads `hashFiles(...)`.
- **Then**: the list includes `patches/**` and `.github/workflows/ci-mobile-ios-parity.yml`. Restore and save use the same key.
- **Signals**: exact key string.

### S5 — Trigger unchanged

- **Level**: Unit
- **Given**: the workflow `on:` block and job `if:`.
- **When**: the test reads them.
- **Then**: `on:` is only `workflow_dispatch` and `pull_request` (no `push:`). `pull_request.types` still include `labeled` / `unlabeled`. `ios-build`, stills, and motion `if` still require `workflow_dispatch` or label `ios-parity`. `structural` has no such `if`. Concurrency group is unchanged.
- **Signals**: existing QUALITY-010 test plus the new file.

### S6 — Lint cap

- **Level**: Toolchain
- **Given**: root `package.json`.
- **When**: the test reads `scripts.lint`.
- **Then**: it is `oxlint --max-warnings=455`.
- **Signals**: exact string.

### S7 — actionlint

- **Level**: Toolchain
- **Given**: actionlint is installed or installable.
- **When**: it checks `ci-mobile-ios-parity.yml`.
- **Then**: exit 0. If the only diagnostic is an unknown `macos-26` runner label, record it; do not “fix” by changing the runner.
- **Signals**: command exit code.

### S8 — Miss then hit (manual, labeled)

- **Level**: Manual
- **Given**: SHA `e2f88b00a` with ios-gen skip, labeled by Eng Manager.
- **When**: run [39550057846](https://github.com/AruNi-01/atmos/actions/runs/39550057846) attempt 1 (miss) then attempt 2 (Re-run).
- **Then**:
  - Attempt 1: ios-gen miss; Prebuild 7s; Install CocoaPods 1m46s; CompileC 1404; Build 29m21s.
  - Attempt 2: ios-gen exact hit on the **same PR Re-run** (`refs/pull/<n>/merge`), not a different PR. Prebuild and Install CocoaPods **skipped** (~2 min saved vs miss-path generate). CompileC still 1404 (DerivedData incremental did not work). Restore DerivedData + mtime pin cost 1.5–3.5 min extra; those steps are now removed.
- **Signals**: Actions UI step times. **pass** for the ios-gen skip; DerivedData dropped by Eng Manager decision.

### S10 — Cache stays on ios-build

- **Level**: Unit
- **Given**: the QUALITY-023 job graph.
- **When**: the test slices `ios-build`, `ios-simulator`, and `ios-simulator-motion`.
- **Then**: ios-gen restore/save exist only on `ios-build`. Stills `needs: ios-build`. Motion `needs: [ios-build, ios-simulator]`. `ios-build` does not boot the simulator and does not write `.env` / `.xcode.env.local`.
- **Signals**: job-slice substring checks.

### S9 — Mobile bun tests still pass

- **Level**: Unit
- **Given**: the cache test file and QUALITY-010 evidence-safety workflow assertions.
- **When**: `bun test` runs in `apps/mobile`.
- **Then**: exit 0.
- **Signals**: bun summary.

## Exploratory agent-browser checks

Not used. Workflow YAML only.

## Regression checklist

- [x] `ios-build` / stills / motion still skipped without `ios-parity` (YAML lock)
- [x] `structural` still runs on matching PRs
- [x] Capture, SceneDelegate, and `main.jsbundle` gates unchanged
- [x] `oxlint --max-warnings=455` unchanged
- [x] No screenshots / hostnames committed
- [x] `assert_cold_launch` not changed in this PR

## Acceptance criteria

- [x] TECH key design is implemented in the workflow
- [x] Label gate and `on:` triggers are unchanged
- [x] Bun tests for S1–S6, S9–S12 pass
- [x] actionlint has no new real errors (S7)
- [x] S8 recorded: ios-gen skip ~2 min; DerivedData dropped after CompileC 1404/1404

## Manual verification steps

1. Do not add or remove `ios-parity` from this work.
2. After merge: `workflow_dispatch` on branch `main` once to seed the base ios-gen cache. A labeled PR with the same native hash should restore that copy. A PR Re-run after that PR's own miss+save hits `refs/pull/<n>/merge` only. After a native-recipe change merges, dispatch on `main` again.

## Non-coverage

- Simulator framebuffer / black-window (QUALITY-016 / APP-081).
- Hermes Settings crash (QUALITY-010).
- `assert_cold_launch` flake (do not fix here).
- Capture-step wall time (QUALITY-023 / #346).

## Coverage Status

Implementation pass (Linux agent, no Simulator):

- S1–S6, S9–S12 — pass. Occupancy is Actions ref isolation (`refs/pull/<n>/merge` vs `main`), not “one copy per native recipe across PRs”. `workflow_dispatch` on `main` seeds the base cache; YAML already reaches save on that path. `package.json` `lint` is still `oxlint --max-warnings=455`.
- S7 — pass. `actionlint` v1.7.12 on `.github/workflows/ci-mobile-ios-parity.yml` exit 0.
- S8 — pass as data: old baseline [39530230224](https://github.com/AruNi-01/atmos/actions/runs/39530230224) Pods-only (Build 27m miss / 49m hit, CompileC 1402 / 1322, pod install ~2m20s both). Retest [39550057846](https://github.com/AruNi-01/atmos/actions/runs/39550057846) ios-gen skip (~2 min) but DerivedData CompileC 1404 / 1404; restore + mtime extra 1.5–3.5 min. DerivedData cache removed.
- Numbering: QUALITY-020 (#342), QUALITY-021 (#344), QUALITY-023 (#346, `704d16525`), QUALITY-024 (#348) are on `main`. This spec is QUALITY-022.
