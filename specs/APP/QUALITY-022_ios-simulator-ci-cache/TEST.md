# TEST · QUALITY-022: iOS Simulator CI Cache

> Test Plan · how we verify generated-`ios/` + DerivedData caching on `ios-simulator` without changing the `ios-parity` label gate. References TECH QUALITY-022.

## Test strategy

This is a workflow change. There is no iOS Simulator on the Linux agent, so the heavy job is not executed here.

- **Bun tests** in `apps/mobile` (the `structural` job already runs `bun test` there) lock YAML: trigger, keys, skip gates, `-derivedDataPath`, no `rm -rf` of DerivedData, save-before-capture, lint cap.
- **actionlint** on the workflow file when the binary is available.
- **Toolchain:** `bun lint` stays `oxlint --max-warnings=455`. `oxfmt` on changed paths.
- **Manual / not_run:** real `macos-26` miss vs hit timings. Requires the Eng Manager `ios-parity` label. This work must not add or remove that label.
- **Exploratory agent-browser:** omitted. No product UI.

## Coverage map

| Requirement                                                     | Scenario IDs |
| --------------------------------------------------------------- | ------------ |
| Exact `ios-gen` cache of `apps/mobile/ios`; no restore-keys     | S1, S2       |
| Miss path runs prebuild + `pod install`; hit skips both         | S1           |
| CocoaPods home cache only on miss                               | S1           |
| DerivedData exact cache of `artifacts/derived`; no restore-keys | S2, S3       |
| Key includes os, Xcode version, scope, input hashes             | S2           |
| Exact DerivedData hit pins native input mtimes                  | S3           |
| `-derivedDataPath` matches the cache path                       | S3           |
| Size: no index store; prune Logs/Index before save              | S4           |
| Save after generate/xcodebuild, before capture                  | S4           |
| Trigger stays dispatch or `ios-parity` label                    | S5           |
| No `push:` trigger; oxlint cap stays 455                        | S5, S6       |
| actionlint                                                      | S7           |
| Miss vs hit wall time + CompileC count                          | S8           |

## Execution map

| Scenario | Level     | Expected tool  | Target command / method                                 | Fixture / data                 | Signals                                                                                     | Status  |
| -------- | --------- | -------------- | ------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- | ------- |
| S1       | Unit      | `bun test`     | `apps/mobile/script/ios-parity-ci-cache.test.ts`        | workflow YAML                  | ios-gen restore/save; prebuild/pod `if` cache-hit != true                                   | pass    |
| S2       | Unit      | `bun test`     | same                                                    | workflow YAML                  | exact key fragments; ios-gen/dd have no restore-keys                                        | pass    |
| S3       | Unit      | `bun test`     | same                                                    | workflow YAML                  | `DERIVED_DATA` / `-derivedDataPath`; mtime pin gated on dd cache-hit                        | pass    |
| S4       | Unit      | `bun test`     | same                                                    | workflow YAML                  | `COMPILER_INDEX_STORE_ENABLE=NO`; prune Logs/Index; save steps before capture               | pass    |
| S5       | Unit      | `bun test`     | same + existing evidence-safety workflow test           | workflow YAML                  | `on:` has no `push:`; ios-simulator `if` is dispatch or label; structural has no label `if` | pass    |
| S6       | Toolchain | shell          | `package.json` `lint` script                            | repo root                      | `oxlint --max-warnings=455`                                                                 | pass    |
| S7       | Toolchain | actionlint     | `actionlint .github/workflows/ci-mobile-ios-parity.yml` | workflow YAML                  | exit 0, or documented ignore for unknown `macos-26` only                                    | pass    |
| S8       | Manual    | GitHub Actions | first labeled run, then Re-run                          | Eng Manager `ios-parity` label | miss then exact hit; CompileC drops; prebuild/pod skipped on hit                            | not_run |
| S9       | Unit      | `bun test`     | `apps/mobile` bun test                                  | mobile tests                   | existing evidence-safety + new cache tests pass                                             | pass    |

## Scenarios

### S1 — ios-gen skip gate

- **Level**: Unit
- **Given**: `.github/workflows/ci-mobile-ios-parity.yml`.
- **When**: the bun test reads the `ios-simulator` job.
- **Then**: Restore/save path is `apps/mobile/ios`. Prebuild, `pod install`, and CocoaPods home restore are gated on `steps.ios-restore.outputs.cache-hit != 'true'`. Verify step always exists. Actions are `actions/cache/restore@v4` and `actions/cache/save@v4`.
- **Signals**: string assertions on the job slice.

### S2 — Key and restore-keys

- **Level**: Unit
- **Given**: the same YAML.
- **When**: the test reads cache `key` / `restore-keys`.
- **Then**:
  - ios-gen exact key hashes `bun.lock`, `apps/mobile/package.json`, `app.config.js`, `app.json`, `plugins/**`, `modules/**`, and `exclude-dev-client.js`, plus os / Xcode version / scope.
  - DerivedData exact key hashes `bun.lock` and `apps/mobile/ios/Podfile.lock`.
  - ios-gen and DerivedData blocks contain **no** `restore-keys:`.
  - CocoaPods home `restore-keys` are xcode then os prefixes.
  - The Xcode step writes `version=` from `xcodebuild -version` to `GITHUB_OUTPUT`.
- **Signals**: ordered substring checks.

### S3 — DerivedData path, no wipe, mtime pin

- **Level**: Unit
- **Given**: the build and mtime steps.
- **When**: the test reads them.
- **Then**: `xcodebuild` passes `-derivedDataPath` using `DERIVED_DATA` / `artifacts/derived`. No `rm -rf` of that tree before build. Mtime pin runs only when `steps.deriveddata-restore.outputs.cache-hit == 'true'` and `os.utime`s files under `node_modules` and `apps/mobile/ios` to `bun.lock`.
- **Signals**: absence of the wipe; presence of the pin gate.

### S4 — Size and save timing

- **Level**: Unit
- **Given**: build, prune, save, and capture steps.
- **When**: the test compares character offsets.
- **Then**: `COMPILER_INDEX_STORE_ENABLE=NO` is on the `xcodebuild` invocation. Prune removes `Logs` and `Index.noindex`. DerivedData save appears after `xcodebuild` and before `Install, launch, and capture`. Save is not gated on `github.ref == 'refs/heads/main'` only.
- **Signals**: index order; forbidden `main`-only save guard.

### S5 — Trigger unchanged

- **Level**: Unit
- **Given**: the workflow `on:` block and job `if:`.
- **When**: the test reads them.
- **Then**: `on:` is only `workflow_dispatch` and `pull_request` (no `push:`). `pull_request.types` still include `labeled` / `unlabeled`. `ios-simulator` `if` still requires `workflow_dispatch` or label `ios-parity`. `structural` has no such `if`. Concurrency group is unchanged.
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
- **Given**: a SHA that includes this cache design, with `ios-parity` applied by the Eng Manager (this work does not change the label).
- **When**: the first `ios-simulator` run completes at least through DerivedData save; then the same job is re-run.
- **Then**:
  - First run: `ios-gen cache-hit` and `deriveddata cache-hit` are not true. `Prebuild iOS` and `Install CocoaPods` run. `CompileC count` is the cold baseline (~1400 on run 39530230224).
  - Second run (same SHA): both exact hits. Prebuild and `pod install` are skipped. `Normalize native input mtimes` ran. `CompileC count` is far below the baseline. `Build Release simulator app` is shorter than the cold 27m (and must not regress toward the 49m hit of run 39530230224).
  - `summary.md` has the hit flags and CompileC count. No hostname.
- **Signals**: Actions UI step times; artifact `summary.md`. **not_run** until a labeled re-run of this SHA.

### S9 — Mobile bun tests still pass

- **Level**: Unit
- **Given**: the new test file and QUALITY-010 evidence-safety workflow assertions.
- **When**: `bun test` runs in `apps/mobile`.
- **Then**: exit 0.
- **Signals**: bun summary.

## Exploratory agent-browser checks

Not used. Workflow YAML only.

## Regression checklist

- [x] `ios-simulator` still skipped without `ios-parity` (YAML lock)
- [x] `structural` still runs on matching PRs
- [x] `-derivedDataPath` still `artifacts/derived`
- [x] Capture, SceneDelegate, and `main.jsbundle` gates unchanged
- [x] `oxlint --max-warnings=455` unchanged
- [x] No screenshots / hostnames committed

## Acceptance criteria

- [x] TECH key design is implemented in the workflow
- [x] Label gate and `on:` triggers are unchanged
- [x] Bun tests for S1–S6 and S9 pass
- [x] actionlint has no new real errors (S7)
- [ ] S8 is documented as the Eng Manager re-run; this PR does not add or remove the label

## Manual verification steps

1. Do not add or remove `ios-parity` from this work.
2. On a labeled SHA: record miss vs Re-run hit as in S8 (`ios-gen` skip, CompileC drop, build duration). First labeled run after this change is a miss because the keys changed (`ios-gen-*`, exact `ios-dd-*`).

## Non-coverage

- Simulator framebuffer / black-window (QUALITY-016 / APP-081).
- Hermes Settings crash (QUALITY-010).
- Capture-step wall time (about 40–50 minutes on run 39530230224; not a cache target).

## Coverage Status

Implementation pass (Linux agent, no Simulator):

- S1–S6, S9 — pass. `cd apps/mobile && bun test` → 575 pass / 0 fail, including `script/ios-parity-ci-cache.test.ts` (8) and `script/evidence-safety.test.ts`. `package.json` `lint` is still `oxlint --max-warnings=455`.
- S7 — pass. `actionlint` v1.7.12 on `.github/workflows/ci-mobile-ios-parity.yml` exit 0.
- S8 — `not_run`. Run 39530230224 already showed Pods-only + DerivedData restore **without** skipping prebuild/pod install: Build 27m miss vs 49m exact hit, CompileC 1402 vs 1322. This revision changes the design; needs a new labeled miss + Re-run.
- Numbering: QUALITY-020 is E2E prebuilt API artifact (#342, on `main`). QUALITY-021 is the concurrent CodeQL draft (#344). This spec is QUALITY-022.
