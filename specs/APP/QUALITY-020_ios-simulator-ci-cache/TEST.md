# TEST · QUALITY-020: iOS Simulator CI Cache

> Test Plan · how we verify CocoaPods + DerivedData caching on `ios-simulator` without changing the `ios-parity` label gate. References TECH QUALITY-020.

## Test strategy

This is a workflow change. There is no iOS Simulator on the Linux agent, so the heavy job is not executed here.

- **Bun tests** in `apps/mobile` (the `structural` job already runs `bun test` there) lock YAML: trigger, keys, paths, `-derivedDataPath`, no `rm -rf` of DerivedData, save-before-capture, lint cap.
- **actionlint** on the workflow file when the binary is available.
- **Toolchain:** `bun lint` stays `oxlint --max-warnings=455`. `oxfmt` on changed paths.
- **Manual / not_run:** real `macos-26` miss vs hit timings. Requires the Eng Manager `ios-parity` label. This work must not apply that label.
- **Exploratory agent-browser:** omitted. No product UI.

## Coverage map

| Requirement                                              | Scenario IDs |
| -------------------------------------------------------- | ------------ |
| CocoaPods cache of `Pods` + `~/Library/Caches/CocoaPods` | S1, S2       |
| DerivedData cache of `artifacts/derived`                 | S1, S3       |
| Key includes os, Xcode version, lock hashes, scope       | S2           |
| `restore-keys` are ordered fallbacks                     | S2           |
| `-derivedDataPath` matches the cache path                | S3           |
| No clean wipe of restored DerivedData                    | S3           |
| Size: no index store; prune Logs/Index before save       | S4           |
| Save after pod/xcodebuild, before capture                | S4           |
| Trigger stays dispatch or `ios-parity` label             | S5           |
| No `push:` trigger; oxlint cap stays 455                 | S5, S6       |
| actionlint                                               | S7           |
| Miss vs hit wall time                                    | S8           |

## Execution map

| Scenario | Level     | Expected tool  | Target command / method                                 | Fixture / data                 | Signals                                                                                     | Status  |
| -------- | --------- | -------------- | ------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- | ------- |
| S1       | Unit      | `bun test`     | `apps/mobile/script/ios-parity-ci-cache.test.ts`        | workflow YAML                  | restore/save for pods and deriveddata; paths listed in TECH                                 | pass    |
| S2       | Unit      | `bun test`     | same                                                    | workflow YAML                  | exact key fragments + restore-keys order                                                    | pass    |
| S3       | Unit      | `bun test`     | same                                                    | workflow YAML                  | `DERIVED_DATA` / `-derivedDataPath`; no `rm -rf` of that tree before build                  | pass    |
| S4       | Unit      | `bun test`     | same                                                    | workflow YAML                  | `COMPILER_INDEX_STORE_ENABLE=NO`; prune Logs/Index; save steps before capture               | pass    |
| S5       | Unit      | `bun test`     | same + existing evidence-safety workflow test           | workflow YAML                  | `on:` has no `push:`; ios-simulator `if` is dispatch or label; structural has no label `if` | pass    |
| S6       | Toolchain | shell          | `package.json` `lint` script                            | repo root                      | `oxlint --max-warnings=455`                                                                 | pass    |
| S7       | Toolchain | actionlint     | `actionlint .github/workflows/ci-mobile-ios-parity.yml` | workflow YAML                  | exit 0, or documented ignore for unknown `macos-26` only                                    | pass    |
| S8       | Manual    | GitHub Actions | first labeled run, then Re-run                          | Eng Manager `ios-parity` label | miss then exact hit; step timings in the run UI; summary.md has cache-hit lines             | not_run |
| S9       | Unit      | `bun test`     | `apps/mobile` bun test                                  | mobile tests                   | existing evidence-safety + new cache tests pass                                             | pass    |

## Scenarios

### S1 — Both caches exist with the TECH paths

- **Level**: Unit
- **Given**: `.github/workflows/ci-mobile-ios-parity.yml`.
- **When**: the bun test reads the `ios-simulator` job.
- **Then**: CocoaPods restore/save paths include `apps/mobile/ios/Pods` and `~/Library/Caches/CocoaPods`. DerivedData restore/save path is `artifacts/derived` (job `DERIVED_DATA` or `${{ github.workspace }}/artifacts/derived`). Actions are `actions/cache/restore@v4` and `actions/cache/save@v4`.
- **Signals**: string assertions on the job slice.

### S2 — Key and restore-keys

- **Level**: Unit
- **Given**: the same YAML.
- **When**: the test reads cache `key` / `restore-keys`.
- **Then**:
  - CocoaPods exact key contains `runner.os`, `steps.xcode.outputs.version`, `steps.xcode.outputs.scope`, `hashFiles('bun.lock')`, and `hashFiles('apps/mobile/ios/Podfile')`.
  - DerivedData exact key contains `runner.os`, `steps.xcode.outputs.version`, `steps.xcode.outputs.scope`, `hashFiles('bun.lock')`, and `hashFiles('apps/mobile/ios/Podfile.lock')`.
  - The Xcode step writes `version=` from `xcodebuild -version` to `GITHUB_OUTPUT`.
  - CocoaPods `restore-keys` list the four prefixes in TECH order (bun.lock+scope, scope, xcode, os).
  - DerivedData `restore-keys` list the four prefixes in TECH order (bun.lock+scope, scope, xcode, os).
- **Signals**: ordered substring checks.

### S3 — DerivedData path is consistent and not wiped

- **Level**: Unit
- **Given**: the build step.
- **When**: the test reads it.
- **Then**: `xcodebuild` passes `-derivedDataPath` using `DERIVED_DATA` / `artifacts/derived`. The ios-simulator job does not contain `rm -rf "$derived"` or `rm -rf "$DERIVED_DATA"` before build. `mkdir -p` of that directory is allowed.
- **Signals**: absence of the wipe; presence of `-derivedDataPath`.

### S4 — Size and save timing

- **Level**: Unit
- **Given**: build, prune, save, and capture steps.
- **When**: the test compares character offsets.
- **Then**: `COMPILER_INDEX_STORE_ENABLE=NO` is on the `xcodebuild` invocation. Prune removes `Logs` and `Index.noindex`. CocoaPods save appears after `pod install` and before capture. DerivedData save appears after `xcodebuild` and before `Install, launch, and capture`. Save is not gated on `github.ref == 'refs/heads/main'` only.
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
- **Given**: this PR or a later SHA, with `ios-parity` applied by the Eng Manager.
- **When**: the first `ios-simulator` run completes at least through DerivedData save; then the same job is re-run.
- **Then**: first run: both restores miss (or only a `main` prefix fallback). Second run: exact `cache-hit=true` for both. Re-run duration and the `pod install` / `xcodebuild` steps are lower. `summary.md` contains the hit flags. No hostname in that file.
- **Signals**: Actions UI step times; artifact `summary.md`. **not_run** until labeled.

### S9 — Mobile bun tests still pass

- **Level**: Unit
- **Given**: the new test file and QUALITY-010 evidence-safety workflow assertions.
- **When**: `bun test` runs in `apps/mobile`.
- **Then**: exit 0.
- **Signals**: bun summary.

## Exploratory agent-browser checks

Not used. Workflow YAML only.

## Regression checklist

- [x] `ios-simulator` still skipped without `ios-parity` (YAML lock; live skip confirmed on the unlabeled PR)
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
- [ ] Non-iOS CI is green (filled after the draft PR checks)
- [x] S8 is documented as the Eng Manager re-run; this PR does not add the label

## Manual verification steps

1. Do not add `ios-parity`. Confirm the PR run skips `ios-simulator` and `structural` is green.
2. After merge or when the Eng Manager labels: record miss vs re-run hit durations as in S8.

## Non-coverage

- Simulator framebuffer / black-window (QUALITY-016 / APP-081).
- Hermes Settings crash (QUALITY-010).
- Restoring git mtimes for clang incremental (TECH residual risk).

## Coverage Status

Implementation pass (Linux agent, no Simulator):

- S1–S6, S9 — pass. `cd apps/mobile && bun test` → 574 pass / 0 fail, including `script/ios-parity-ci-cache.test.ts` (7) and `script/evidence-safety.test.ts`. `package.json` `lint` is still `oxlint --max-warnings=455`. `bun lint` exit 0.
- S7 — pass. `actionlint` v1.7.12 on `.github/workflows/ci-mobile-ios-parity.yml` exit 0 (no `macos-26` diagnostic).
- S8 — `not_run`. Requires the Eng Manager `ios-parity` label; this change does not apply it. First labeled run builds the cache; Actions “Re-run jobs” on the same SHA is the hit. Compare job duration and the `Install CocoaPods` / `Build Release simulator app` steps. `artifacts/summary.md` records `cache-hit` and `cache-matched-key`.
- Numbering: QUALITY-019 is the concurrent E2E concurrency draft (#341). This spec is QUALITY-020.
