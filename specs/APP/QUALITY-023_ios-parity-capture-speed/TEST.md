# TEST · QUALITY-023: iOS parity capture speed

> Test Plan · how we verify the capture path is faster without dropping fixtures, assertions, or the PillTap miss contract. References TECH QUALITY-023.

## Test strategy

Deterministic locks are Bun tests that read the workflow YAML, `ios-capture.sh`, and preview sources. Script smoke is `bash -n` plus the existing Python self-tests on ubuntu. Real iOS Simulator capture stays `not_run` in this environment and stays label-gated. No agent-browser: this is CI harness work.

## Coverage map

| Requirement                                               | Scenario IDs |
| --------------------------------------------------------- | ------------ |
| M1. Same fixtures and assertions as QUALITY-016 / APP-081 | S1, S2       |
| M2. PillTap miss still exits non-zero                     | S2           |
| M3. Capture shards stills ∥ motion; default `all`         | S3           |
| M4. No 15s fixture sleep; wait `[parity] painted`         | S4           |
| M5. PillTap `test-without-building` in CI                 | S5           |
| M6. Preview flag only on commands, not files              | S6           |
| M7. Label / dispatch gate unchanged; no `EVIDENCE_PUSH`   | S7           |
| M8. oxlint cap 455                                        | S8           |
| M9. Baseline and targets recorded                         | S9           |
| M10. Labeled simulator run (not this agent)               | S10          |

## Execution map

| Scenario | Level     | Expected tool | Target command / method                                  | Fixture / data                      | Signals                                                                 | Status  |
| -------- | --------- | ------------- | -------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- | ------- |
| S1       | Unit      | `bun test`    | `parity-cycle.test.ts`, `parity-motion-fixtures.test.ts` | F1–F13 cycle, capture script        | 26 frames; 26 PNG check; RECORD ids F4/F12/F13                          | planned |
| S2       | Unit      | `bun test`    | `parity-motion-fixtures.test.ts`                         | `ios-capture.sh`, PillTap           | `PillTap missed:`; no `A miss does not fail the job`; `--seconds 720`   | planned |
| S3       | Unit      | `bun test`    | `apps/mobile/script/ios-parity-capture.test.ts`          | workflow + script                   | `PARITY_SHARD`; matrix `stills` `motion`; job `ios-build`               | planned |
| S4       | Unit      | `bun test`    | same + `parity-cycle.test.ts`                            | preview + script                    | `parityPaintedLine`; script has no `sleep 15`; waits `[parity] painted` | planned |
| S5       | Unit      | `bun test`    | `ios-parity-capture.test.ts`                             | workflow + script                   | `build-for-testing`; `PILL_TAP_ACTION`; `test-without-building`         | planned |
| S6       | Unit      | `bun test`    | same                                                     | workflow                            | no `printf` to `.env` / `.xcode.env.local`; step `env:` has the flag    | planned |
| S7       | Unit      | `bun test`    | `evidence-safety.test.ts`, `ios-parity-capture.test.ts`  | workflow                            | label gate; structural has no `ios-parity`; no `EVIDENCE_PUSH`          | planned |
| S8       | Toolchain | shell         | `bun lint`                                               | `package.json`                      | `--max-warnings=455`                                                    | planned |
| S9       | Review    | spec          | TECH.md                                                  | run 39530230224                     | attempt 1 39m19s / attempt 2 52m24s                                     | planned |
| S10      | E2E       | GHA           | `ios-simulator`                                          | `ios-parity` label (not added here) | skipped without label; after a labeled run, stills+motion < 18 min wall | not_run |

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
- **When**: the workflow matrix and script branches are read.
- **Then**: CI has `strategy.matrix.shard: [stills, motion]`. Script default is `all`. Stills owns the 26 PNG loop. Motion owns PillTap and live `recordVideo` passes. Merge job uploads `ios-parity`.
- **Signals**: YAML + `PARITY_SHARD` in the script.

### S4 — Paint is a log wait

- **Level**: Unit
- **Given**: preview-chat and `ios-capture.sh`.
- **When**: sources are read.
- **Then**: `parityPaintedLine` exists; preview logs it; capture waits for `[parity] painted` and does not contain `sleep 15`.
- **Signals**: string presence / absence.

### S5 — PillTap is prebuilt on the motion shard

- **Level**: Unit
- **Given**: the motion shard steps.
- **When**: YAML is read.
- **Then**: `build-for-testing` appears only on `matrix.shard == 'motion'` (or in the combined boot step gated on that shard). Capture is invoked with `PILL_TAP_ACTION=test-without-building`.
- **Signals**: YAML env and `xcodebuild build-for-testing`.

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
- **Then**: `ios-build` and `ios-simulator` still require `workflow_dispatch` or the `ios-parity` label. `structural` does not. Diff has no `EVIDENCE_PUSH`.
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
- **Given**: this PR without `ios-parity`.
- **When**: GitHub Actions runs.
- **Then**: `structural` green; `ios-build` / `ios-simulator` / `ios-parity` skipped. A later labeled run (not by this agent) is the only way to measure stills/motion wall clock against the TECH targets.
- **Signals**: check rollup.

## Performance & load budgets

- Capture stills shard (after boot): ≤ 10 min on a runner no slower than attempt 2.
- Capture motion shard (after boot): ≤ 14 min, first PillTap ≤ 90s.
- Combined capture wall (two jobs): ≤ 18 min including boot.
- Job wall: ≤ 55 min when `ios-build` is ≤ 35 min.

## Regression checklist

- [ ] 26 distinct fixture PNGs still required.
- [ ] PillTap miss still non-zero.
- [ ] `ConnectHardwareKeyboard -bool false` still before boot.
- [ ] `ios-simulator` still label/dispatch gated.
- [ ] No `.env` / `.xcode.env.local` preview flag writes.
- [ ] No `EVIDENCE_PUSH`.
- [ ] `main.jsbundle` greps for inlined preview still in `ios-build`.
- [ ] oxlint `--max-warnings=455`.

## Exploratory agent-browser checks

Omitted. No web UI.

## Acceptance criteria

- [ ] S1–S8 pass at the declared level.
- [ ] This PR does not add the `ios-parity` label.
- [ ] Non-iOS CI on the PR is green (`CI - JS` oxlint/oxfmt, `structural`).
- [ ] S10 remains `not_run` until someone else labels.

## Manual verification steps

1. Eng Manager adds `ios-parity` after review if they want a simulator timing sample.
2. Compare `ios-simulator (stills)` and `ios-simulator (motion)` step `Install, launch, and capture` to TECH targets.
3. Confirm artifact `ios-parity` still has 26 `F*-*.png` plus the motion movies.

## Non-coverage

- Pixel diffs of captured PNGs (QUALITY-016).
- #343 cache hit/miss numbers.
- Running `ios-capture.sh` on this Linux agent.

## Coverage Status

> Filled after implementation by the test-run pass.
