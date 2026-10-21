# TEST · QUALITY-023: iOS parity capture speed

> Test Plan · how we verify the capture path is faster without dropping fixtures, assertions, or the PillTap miss contract. References TECH QUALITY-023.

## Test strategy

Deterministic locks are Bun tests that read the workflow YAML, `ios-capture.sh`, and preview sources. Script smoke is `bash -n` plus the existing Python self-tests on ubuntu. Real iOS Simulator capture stays `not_run` in this environment and stays label-gated. No agent-browser: this is CI harness work.

## Coverage map

| Requirement                                                                      | Scenario IDs |
| -------------------------------------------------------------------------------- | ------------ |
| M1. Same fixtures and assertions as QUALITY-016 / APP-081                        | S1, S2       |
| M2. PillTap miss still exits non-zero                                            | S2           |
| M3. Stills parallel after `ios-build`; motion serial after stills; default `all` | S3           |
| M4. No 15s fixture sleep; wait `[parity] painted`                                | S4           |
| M5. PillTap serial `xcodebuild test` in CI (no destination preflight)            | S5           |
| M6. Preview flag only on commands, not files                                     | S6           |
| M7. Label / dispatch gate unchanged; no `EVIDENCE_PUSH`                          | S7           |
| M8. oxlint cap 455                                                               | S8           |
| M9. Baseline and targets recorded                                                | S9           |
| M10. Labeled simulator run (not this agent)                                      | S10          |
| M11. Motion serial after stills; no destination preflight; miss still fails      | S11          |

## Execution map

| Scenario | Level     | Expected tool | Target command / method                                  | Fixture / data                      | Signals                                                                                          | Status |
| -------- | --------- | ------------- | -------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ | ------ |
| S1       | Unit      | `bun test`    | `parity-cycle.test.ts`, `parity-motion-fixtures.test.ts` | F1–F13 cycle, capture script        | 26 frames; 26 PNG check; RECORD ids F4/F12/F13                                                   | pass   |
| S2       | Unit      | `bun test`    | `parity-motion-fixtures.test.ts`                         | `ios-capture.sh`, PillTap           | `PillTap missed:`; no `A miss does not fail the job`; `--seconds 720`                            | pass   |
| S3       | Unit      | `bun test`    | `apps/mobile/script/ios-parity-capture.test.ts`          | workflow + script                   | `PARITY_SHARD`; stills `needs: ios-build`; motion `needs: [ios-build, ios-simulator]`; no matrix | pass   |
| S4       | Unit      | `bun test`    | same + `parity-cycle.test.ts`                            | preview + script                    | `parityPaintedLine`; script has no `sleep 15`; waits `[parity] painted`                          | pass   |
| S5       | Unit      | `bun test`    | `ios-parity-capture.test.ts`                             | workflow + script                   | `PILL_TAP_ACTION: test`; no `build-for-testing`; no `wait_for_xcode_destination`                 | pass   |
| S6       | Unit      | `bun test`    | same                                                     | workflow                            | no `printf` to `.env` / `.xcode.env.local`; step `env:` has the flag                             | pass   |
| S7       | Unit      | `bun test`    | `evidence-safety.test.ts`, `ios-parity-capture.test.ts`  | workflow                            | label gate; structural has no `ios-parity`; no `EVIDENCE_PUSH`                                   | pass   |
| S8       | Toolchain | shell         | `bun lint`                                               | `package.json`                      | `--max-warnings=455`                                                                             | pass   |
| S9       | Review    | spec          | TECH.md                                                  | run 39530230224                     | attempt 1 39m19s / attempt 2 52m24s                                                              | pass   |
| S10      | E2E       | GHA           | `ios-simulator`                                          | `ios-parity` label (not added here) | labeled run `39570872781` stills+motion+merge success; job wall 55m10s                           | pass   |
| S11      | Unit      | `bun test`    | `ios-parity-capture.test.ts`                             | workflow + capture                  | serial motion job; no destination preflight; miss still exits 1                                  | pass   |

## Scenarios

### S1 — Fixture count is unchanged

- **Level**: Unit
- **Given**: `parityCycleFrames()` and `ios-capture.sh`.
- **When**: tests read both.
- **Then**: 13 fixtures × 2 themes; the script still requires 26 distinct `F*-*.png`; motion names f13-tail, stream-tools, F4 replay, F12 pills, card-row light+dark, composer keyboard remain.
- **Signals**: frame length 26; script strings.

### S2 — PillTap miss still fails

- **Level**: Unit
- **Given**: QUALITY-016 C9.
- **When**: the capture script and PillTap sources are read.
- **Then**: `PillTap missed:` and `exit 1` on tap failure and on ready timeout for those passes. `continueAfterFailure = false`. No `A miss does not fail the job`.
- **Signals**: existing `parity-motion-fixtures.test.ts` plus the new workflow test.

### S3 — Shards cover the union

- **Level**: Unit
- **Given**: `PARITY_SHARD=stills` and `PARITY_SHARD=motion`.
- **When**: the workflow jobs and script branches are read.
- **Then**: CI has two capture jobs, not a matrix. `ios-simulator` (stills) `needs: ios-build`. `ios-simulator-motion` `needs: [ios-build, ios-simulator]` (serial after stills). Script default is `all`. Stills owns the 26 PNG loop. Motion owns PillTap and live `recordVideo` passes. Merge job uploads `ios-parity`.
- **Signals**: YAML + `PARITY_SHARD` in the script.

### S4 — Paint is a log wait

- **Level**: Unit
- **Given**: preview-chat and `ios-capture.sh`.
- **When**: sources are read.
- **Then**: `parityPaintedLine` exists; preview logs it; capture waits for `[parity] painted` and does not contain `sleep 15`.
- **Signals**: string presence / absence.

### S5 — PillTap is serial `xcodebuild test` (no destination preflight)

- **Level**: Unit
- **Given**: the motion job steps and `run_pill_tap`.
- **When**: YAML and `ios-capture.sh` are read.
- **Then**: there is no `xcodebuild build-for-testing`, no `PILL_TAP_ACTION: test-without-building`, and no `wait_for_xcode_destination`. Capture is invoked with `PILL_TAP_ACTION: test` (script default). A real `Unable to find a device matching` is still `PillTap destination missing:` and still exits 1. Busy is the only targeted retry. Reason: three labeled rounds (`39578448510`, `39591952360` attempt 2, `39610161253`) false-failed destination preflight while `simctl` listed the UDID Booted.
- **Signals**: YAML env and capture `xcodebuild "$PILL_TAP_ACTION"`.

### S6 — No preview-flag files

- **Level**: Unit
- **Given**: `ios-build` prebuild and xcodebuild steps.
- **When**: YAML is read.
- **Then**: there is no `printf 'EXPO_PUBLIC_PARITY_PREVIEW=1` into `.env` or `.xcode.env.local`. The flag appears as `EXPO_PUBLIC_PARITY_PREVIEW: "1"` on those command steps (and the ubuntu export step). Job-level `env:` on macos capture jobs does not set it.
- **Signals**: YAML text.

### S7 — Gate and evidence policy

- **Level**: Unit
- **Given**: QUALITY-010.
- **When**: `evidence-safety.test.ts` and the new test run.
- **Then**: `ios-build`, `ios-simulator`, and `ios-simulator-motion` still require `workflow_dispatch` or the `ios-parity` label. `structural` does not. Diff has no `EVIDENCE_PUSH`.
- **Signals**: existing evidence test, updated slice start `ios-build:`.

### S8 — Lint cap

- **Level**: Toolchain
- **Given**: root `package.json`.
- **When**: `bun lint` runs.
- **Then**: `--max-warnings=455` is unchanged and the command exits 0.
- **Signals**: exit code.

### S9 — Baseline is the named run

- **Level**: Review
- **Given**: TECH.md.
- **When**: a reviewer opens it.
- **Then**: run `39530230224` attempt 1 capture 39m19s and attempt 2 capture 52m24s are listed with step clocks.
- **Signals**: TECH tables.

### S10 — Labeled Actions run

- **Level**: E2E
- **Given**: this PR. This agent does not add `ios-parity`.
- **When**: GitHub Actions runs unlabeled, then later with the label added by someone else.
- **Then**: unlabeled: `structural` green; macos jobs skipped. Labeled run `39570872781` (head `ae64d00da`): `ios-build` 17m28s, stills capture 11m55s, motion capture 30m08s, merge `ios-parity` success, workflow wall 55m10s. Job wall hits ≤55 min. Combined capture wall (30m) is above the ≤18 min stretch target; motion/xctrunner remains the long pole.
- **Signals**: check rollup + step clocks on run `39570872781`.

### S11 — Motion is serial; destination preflight is gone

- **Level**: Unit
- **Given**: three destination-preflight false fails (`39578448510`, `39591952360` attempt 2, `39610161253`) while `simctl` listed `E839A11B` Booted, plus the earlier Busy (`39554572933`) and return-relaunch miss (`39585289841`).
- **When**: tests read the workflow and capture script.
- **Then**: motion is its own job `needs: [ios-build, ios-simulator]`. No `wait_for_xcode_destination` / `xcode_sees_udid`. No `build-for-testing` / `test-without-building`. `PARITY_UDID` is still exported from boot and passed as `-destination id=`. `launch_frame` still terminates until no-op and stamps `log-mark-epoch.txt`. `wait_for_since` may use `log show` but only lines at/after that epoch. Capture waits `wait_for_since` for `[parity] pill awaiting tap`. XCTAssert miss still prints `PillTap missed:` and exits 1. A real `Unable to find a device matching` still prints `PillTap destination missing:` and also exits 1. Missed module on return still exits 1. No blind retry of a miss. Two-green-on-final-head is withdrawn; Eng Manager owns the rerun.
- **Signals**: `ios-parity-capture.test.ts`.

## Performance & load budgets

Stretch targets (cold capture, runner no slower than attempt 2):

- Capture stills shard (after boot): ≤ 10 min.
- Capture motion shard (after boot): ≤ 14 min is a stretch; first PillTap ≤ 90s is withdrawn (cold `xcodebuild test` is 7–9 min again).
- Combined capture wall (stills then serial motion): sum, not max. The old ≤ 18 min overlap target is withdrawn.
- Job wall: ≤ 55 min is a stretch once motion no longer overlaps stills.

Measured on labeled run `39570872781`: stills capture **11m55s** (TECH ≤12 min hit; TEST ≤10 min missed by ~2 min). Motion capture **30m08s** (above still). Combined capture wall **30m08s**. Job wall **55m10s** (hit). `ios-build` **17m28s**.

## Regression checklist

- [x] 26 distinct fixture PNGs still required.
- [x] PillTap miss still non-zero.
- [x] `ConnectHardwareKeyboard -bool false` still before boot.
- [x] `ios-simulator` and `ios-simulator-motion` still label/dispatch gated.
- [x] Stills parallel after `ios-build`; motion serial after stills.
- [x] No `.env` / `.xcode.env.local` preview flag writes.
- [x] No `EVIDENCE_PUSH`.
- [x] `main.jsbundle` greps for inlined preview still in `ios-build`.
- [x] oxlint `--max-warnings=455`.

## Exploratory agent-browser checks

Omitted. No web UI.

## Acceptance criteria

- [x] S1–S8 pass at the declared level.
- [x] This PR does not add the `ios-parity` label (label on #346 was added by `AruNi-01`, not this agent).
- [x] Non-iOS CI on the PR is green (`CI - JS` oxlint/oxfmt, `structural`, CodeQL).
- [x] S10 pass on labeled run `39570872781` (job wall 55m10s; capture wall 30m08s; that run still overlapped stills ∥ motion).
- [x] S11 unit lock: serial motion job, no destination preflight, miss still non-zero. Two-green-on-final-head withdrawn (Eng Manager 2026-10-21: stop fixing PillTap).

## Manual verification steps

1. Eng Manager adds `ios-parity` after review if they want a simulator timing sample.
2. Confirm `ios-simulator (motion)` starts only after stills finishes. Compare stills/motion `Install, launch, and capture` to TECH; first PillTap will include a cold compile.
3. Confirm artifact `ios-parity` still has 26 `F*-*.png` plus the motion movies.

## Non-coverage

- Pixel diffs of captured PNGs (QUALITY-016).
- #343 cache hit/miss numbers.
- Running `ios-capture.sh` on this Linux agent.

## Coverage Status

| Scenario | Status | Evidence                                                                                                                                                                                                                                                                                               |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1       | pass   | `apps/mobile` `bun test`: 573 pass / 0 fail, including `parity-cycle.test.ts` (26 frames + `parityPaintedLine`) and `parity-motion-fixtures.test.ts` (26 PNG check, live `recordVideo` ids)                                                                                                            |
| S2       | pass   | same motion-fixture lock: `PillTap missed:`, `continueAfterFailure = false`, `--seconds 720`; capture has no `A miss does not fail the job`                                                                                                                                                            |
| S3       | pass   | `script/ios-parity-capture.test.ts`: `PARITY_SHARD` default `all`, no matrix, stills `needs: ios-build`, motion `needs: [ios-build, ios-simulator]`, merge `ios-parity`                                                                                                                                |
| S4       | pass   | preview logs `parityPaintedLine` after 600ms stable / 8s fallback; capture waits `[parity] painted` and has no `sleep 15`                                                                                                                                                                              |
| S5       | pass   | no `build-for-testing` / `test-without-building` / `wait_for_xcode_destination`; motion job `PILL_TAP_ACTION: test`                                                                                                                                                                                    |
| S6       | pass   | no `printf` into `.env` / `.xcode.env.local`; flag is step `env:` on prebuild, xcodebuild, and ubuntu export                                                                                                                                                                                           |
| S7       | pass   | `evidence-safety.test.ts` structural slice ends at `ios-build:`; label / dispatch still on macos jobs; no `EVIDENCE_PUSH`                                                                                                                                                                              |
| S8       | pass   | `package.json` `"lint": "oxlint --max-warnings=455"`; `bun lint` exit 0 (452 warnings)                                                                                                                                                                                                                 |
| S9       | pass   | TECH.md tables for run `39530230224` attempt 1 39m19s / attempt 2 52m24s                                                                                                                                                                                                                               |
| S10      | pass   | labeled run [`39570872781`](https://github.com/AruNi-01/atmos/actions/runs/39570872781) (label by `AruNi-01`, not this agent): workflow 55m10s success; `ios-build` 17m28s; stills capture 11m55s; motion capture 30m08s; merge `ios-parity` 12s. Combined capture ≤18 min not hit (motion/xctrunner). |
| S11      | pass   | unit lock: serial motion job, no `pill_pid` / `wait_for_xcode_destination` / `xcode_sees_udid`, `PARITY_UDID`, terminate + epoch-filtered `log show`, `PillTap destination missing:` only on real `Unable to find`, miss still exits 1. Two-green gate withdrawn after three preflight false fails.    |

Also: `bash -n` on `ios-capture.sh` and `ios-boot-simulator.sh`; Python self-tests (`mp4-duration`, `run-until-line`, `png-flat`); `bun --filter @atmos/agent-transcript test` 38 pass; `bun scripts/agent-chat-parity/compare.ts` → `13 fixtures match`.
