# TEST · QUALITY-016: Mobile Parity Capture Hooks

> Test Plan · how we verify the #317 capture slice without the Skia patch, the second chat UI, or an evidence push. References TECH QUALITY-016. Product tail-jump checks stay in APP-081 TEST (TJ1–TJ6).

## Test strategy

- Unit and source locks: Bun tests under `apps/mobile`. They assert pure replay/lane/composer/owner rules and that the hook strings exist in the glass components and scripts.
- Script smoke: `run-until-line.py --self-test` and `bash -n` on `ios-capture.sh`. The structural CI job runs the Python self-test.
- Toolchain: `bun lint` with `--max-warnings=455` unchanged. `oxfmt` on changed paths only.
- iOS Simulator: `not_run`. The `ios-simulator` job is label-gated (`ios-parity`) and this environment has no Simulator. A skip on a draft without that label is the expected CI result.
- Exploratory agent-browser: omitted. The capture preview is an Expo route, not the web app.

## Coverage map

| Requirement                                                                | Scenario IDs |
| -------------------------------------------------------------------------- | ------------ |
| M1. Replay, lane, and composer step clocks                                 | C1           |
| M2. One tail owner; reduced-motion pin beats system only while held        | C2           |
| M3. Preview source contains the tail, replay, lane, and pill log lines     | C3           |
| M4. Glass hooks: scroll pill, card pills, scroller, permission skip, input | C4           |
| M5. `ios-capture.sh` and PillTap contain the capture markers               | C5           |
| M6. No Skia patch, no `EVIDENCE_PUSH`, no hostname, no committed shots     | C6           |
| M7. Lint cap stays 455; format check passes                                | C7           |
| M8. Real simulator recording                                               | C8           |
| M9. F12 Skip renders the reject chip; a PillTap miss fails the job         | C9           |

## Execution map

| Scenario | Level     | Expected tool | Target command / method                                                                                | Fixture / data      | Signals                                                                             | Status  |
| -------- | --------- | ------------- | ------------------------------------------------------------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------- | ------- |
| C1       | Unit      | `bun test`    | `parity-replay.test.ts`, `parity-lane-steps.test.ts`, `parity-composer-states.test.ts`                 | In-file fixtures    | Shot times and step order                                                           | pass    |
| C2       | Unit      | `bun test`    | `parity-cycle.test.ts`, `motion/use-reduced-motion.test.ts`                                            | Owner + pin counter | Second mount keeps the pin; last release clears it                                  | pass    |
| C3       | Unit      | `bun test`    | `parity-motion-fixtures.test.ts`                                                                       | Preview source      | Reply 50 hold lines and `revealMessage`                                             | pass    |
| C4       | Unit      | `bun test`    | same file, reads component sources                                                                     | Glass components    | Exact `testID` strings and `measureInWindow`                                        | pass    |
| C5       | Unit      | `bun test`    | same file, reads `ios-capture.sh` and PillTap                                                          | Script source       | `tap_scroll_pill`, h264, `--seconds 720`, no tap note; one miss records one failure | pass    |
| C6       | Shell     | `rg`          | search the branch diff                                                                                 | Changed paths       | No patch, no `EVIDENCE_PUSH`, no hostname, no png/mov                               | pass    |
| C7       | Toolchain | shell         | `bun lint`; `oxfmt --check` on changed paths                                                           | Repo                | lint exit 0 at cap 455                                                              | pass    |
| C8       | E2E       | GHA           | `ios-simulator` job                                                                                    | `ios-parity` label  | Job skipped without the label                                                       | not_run |
| C9       | Unit      | `bun test`    | `parity-composer-cards.test.ts`, `parity-tree.test.ts`, `parity-motion-fixtures.test.ts`, `compare.ts` | F12 Allow + Skip    | Skip is reject-class; a PillTap miss or a ready timeout exits 1                     | pass    |

## Scenarios

### C1 — Capture clocks

- **Level**: Unit
- **Given**: a replay script, a lane with two pills, and the composer step list.
- **When**: the shot helpers run.
- **Then**: tool-start shots include the halfway and finished draw times; lane taps follow `reduceLane`; composer focus is the last step.
- **Signals**: the three `*.test.ts` files named in the execution map.

### C2 — Tail owner and reduced-motion pin

- **Level**: Unit
- **Given**: two preview mounts, and a system reduced-motion flag.
- **When**: the second mount takes the tail owner and both push a reduced-motion pin.
- **Then**: only one owner holds the tail; `chatReducedMotion(false, true)` is true; releasing one pin leaves the override on; releasing the last pin returns to the system value.
- **Signals**: `parity-cycle.test.ts`, `use-reduced-motion.test.ts`.

### C3 — Preview logs the hold

- **Level**: Unit
- **Given**: `preview-chat-screen.tsx` on this branch.
- **When**: the fixture test reads the source.
- **Then**: it contains `revealMessage`, `onViewport`, `takeParityOwner`, `[parity] replay done`, `[parity] pill awaiting tap`, `[parity] tail returned`, and `const pillRowHeight = pillHeight`. It does not contain `resolvedPillRowHeight`, `laneCardDrawsOwnFrame`, or `userMessageOutsidePressCapture`.
- **Signals**: `parity-motion-fixtures.test.ts` and `scroll-pill-slot.test.ts`.

### C4 — Identifiers sit on the glass controls

- **Level**: Unit
- **Given**: the #323 scroll pill, pill row, permission card, and composer.
- **When**: the fixture test reads those sources.
- **Then**: `testID={SCROLL_PILL_TEST_ID}`, `testID="agent-chat-card-pill-scroller"`, ``testID={`agent-chat-card-pill-${pill.id}`}``, `measureInWindow`, and `testID="agent-chat-permission-skip"` are present. `COMPOSER_GLASS_WELL` remains on the scroll pill.
- **Signals**: same source assertions.

### C5 — Scripts match the log lines

- **Level**: Unit
- **Given**: `ios-capture.sh` and `PillTapUITests.swift`.
- **When**: the fixture test and `run-until-line.py --self-test` run.
- **Then**: the script mentions `tap_scroll_pill`, `tap_card_pills`, `f12-pill-tap.mov`, `"cards":"lane"`, h264, `[parity] replay held 15000`, `--seconds 720`, and `run-until-line.py`. It does not contain `This is not a Simulator tap.` PillTap looks up the scroll, plan, queue, permission, and permission-skip buttons. `PillTapUITests.setUp` sets `continueAfterFailure = false`, so one missed tap records one failure and does not run the later assertion in that method. `bash -n` accepts the shell script.
- **Signals**: fixture test, Python self-test, `bash -n`.

### C6 — Nothing sensitive or discarded is in the diff

- **Level**: Shell
- **Given**: the branch diff against the tail-jump branch.
- **When**: the path list and a content search run.
- **Then**: no Skia patch, no `fence-icons.mjs`, no `EVIDENCE_PUSH`, no hostname field, no `*.png` / `*.mov` / `*.webp`.
- **Signals**: `git diff --name-only` and `rg`.

### C7 — Lint cap is unchanged

- **Level**: Toolchain
- **Given**: `--max-warnings=455` in the root lint script.
- **When**: `bun lint` and `oxfmt --check` run.
- **Then**: lint exits 0 at or under 455 warnings. Format check exits 0. The cap number in `package.json` is still 455.
- **Signals**: command exit codes.

### C8 — Simulator job

- **Level**: E2E
- **Given**: a draft PR without the `ios-parity` label.
- **When**: GitHub Actions runs CI - Mobile iOS parity.
- **Then**: `structural` runs (including the command-watcher self-test). `ios-simulator` is skipped.
- **Signals**: the check rollup. This scenario is `not_run` until that rollup is observed, and it is not a Bun test.

### C9 — F12 Skip is rendered, and a PillTap miss fails

- **Level**: Unit
- **Given**: F12's permission options are Allow and Skip, and `ios-capture.sh` drives PillTap.
- **When**: the fixture tests and `bun scripts/agent-chat-parity/compare.ts` run.
- **Then**: Skip's `option_id` is `skip` and `isRejectPermissionOption` is true for it and false for Allow. The F12 expected tree has an option labeled Skip. The script names `agent-chat-permission-skip`, prints `PillTap missed:` and exits non-zero on a miss, and does not contain `A miss does not fail the job` or `Questions card`. A timeout waiting for `[parity] ready` on the F12 pill-tap, card-row, and composer-keyboard passes also exits 1.
- **Signals**: `parity-composer-cards.test.ts`, `parity-tree.test.ts`, `parity-motion-fixtures.test.ts`, `compare.ts`.

## Non-coverage

- Pixel comparison of captured PNGs. The flat-fill Skia patch is intentionally absent, so a flat frame is logged rather than patched.
- XCUITest classification of the permission chip `View` as `buttons["agent-chat-permission-skip"]` on a booted simulator.
- Product behavior of the second chat UI from #317. Those files are not in the tree.

## Coverage Status

Ran on this branch against the APP-081 tail-jump parent (2026-10-20).

- C1–C5 pass. `cd apps/mobile && bun test` on `parity-replay.test.ts`, `parity-lane-steps.test.ts`, `parity-composer-states.test.ts`, `parity-cycle.test.ts`, `motion/use-reduced-motion.test.ts`, `parity-motion-fixtures.test.ts`, plus the APP-081 locks `scroll-pill-slot.test.ts`, `transcript-jump.test.ts`, `transcript-pad.test.ts`, `stick.test.ts`: 53 pass, 0 fail.
- C5 scripts: `python3 scripts/agent-chat-parity/run-until-line.py --self-test` printed `self-test ok`. `bash -n scripts/agent-chat-parity/ios-capture.sh` exited 0.
- C6 pass. The diff has no Skia patch, `fence-icons.mjs`, `EVIDENCE_PUSH`, hostname, or image/video artifact.
- C7 pass. `bun lint` (`oxlint --max-warnings=455`) exited 0 with 452 warnings. `oxfmt --check` on the changed Markdown and TypeScript paths exited 0. `package.json` still says `--max-warnings=455`.
- Mobile `bun ../../scripts/run-tsc7.ts --noEmit` reports only the pre-existing `glass-text-button.test.ts` (1) and `open-thread-resync.test.ts` (7) errors. No diagnostic in the capture files.
- C8 `not_run` until GitHub Actions reports the `ios-simulator` job. Expected result without the `ios-parity` label: skipped.

C9 (2026-10-20), after #334 and #335 were on `main` (`c3cd96b59`). F12 had only Allow, so the Skip chip never rendered, and PillTap misses were logged and ignored.

- `cd apps/mobile && bun test` on `parity-composer-cards.test.ts`, `parity-lane-steps.test.ts`, `parity-motion-fixtures.test.ts`: 9 pass, 0 fail, 179 expect() calls.
- `bun --filter @atmos/agent-transcript test`: 38 pass, 0 fail, including `parity-tree.test.ts` (`matches every committed tree`).
- `bun scripts/agent-chat-parity/compare.ts` printed `13 fixtures match`.
- `bash -n scripts/agent-chat-parity/ios-capture.sh` exited 0.
- C7 re-run: `bun lint` (`oxlint --max-warnings=455`) exited 0 with 452 warnings. `oxfmt --check` on the changed paths exited 0. The cap in `package.json` is still 455.
- C8 stays `not_run`. This environment has no iOS Simulator, so PillTap itself is not executed.

C5 `continueAfterFailure` (2026-10-20). `PillTapUITests.setUp` sets `continueAfterFailure = false` (eng-larry's #336 MacBook Air run report, approved by the Eng Manager). One missed tap records one failure and does not run the later assertion in that method. `cd apps/mobile && bun test src/features/agent-chat/parity-motion-fixtures.test.ts` → 5 pass, 0 fail, 158 expect() calls. The UI test was not executed.
