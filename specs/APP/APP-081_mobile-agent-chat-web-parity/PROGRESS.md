# PROGRESS · APP-081: Mobile Agent Chat Web Parity

> Implementation Progress. Not a requirements source. Requirements stay in PRD/TECH/TEST.

## Status

- **State**: in_progress
- **Branch**: `feat/mobile-chat-web-parity` (base `docs/mobile-chat-web-parity`)
- **Last updated**: 2026-10-15
- **Current owner**: lead agent
- **Current phase**: S0–S8 implemented and reviewed; parity prebuild must exclude dev-client pods via package.json

## Snapshot

- Spec review committed (`704483158`).
- S0 done and reviewed: pure rules live in `@atmos/agent-transcript`; web paths re-export; `assistant-process.ts` is deleted. One web source-text assertion now reads the package file.
- S1 done and reviewed: synthetic F1–F13, `projectParityTree`, `scripts/agent-chat-parity/compare.ts` (13 match), preview route gated by `EXPO_PUBLIC_PARITY_PREVIEW`.
- S2 done and reviewed: message views, expand store, session chrome, file-change stats. Mobile `bun test` 278.
- S3 done and reviewed: inline tool tree and bodies. Detail sheet and `event-model.ts` are deleted. Mobile `bun test` 280.
- S4 done and reviewed: shimmer (`expo-linear-gradient@56.0.4`, `@react-native-masked-view/masked-view@0.3.2`), part reveal, tree draw-in, 56 ms commit buffer, paced text, activity row. Mobile `bun test` 285.
- S5 done and reviewed: stick reducer, scroll pill pinned left, edge fades, bottom pad. Mobile `bun test` 299.
- S6 done and reviewed: one expanded card above title pills; `reduceLane` preempts permission / session-op without clearing `userChoice`. Mobile `bun test` 324.
- S7 done and reviewed: paste chips and context trigger. Microphone stays off. Mobile `bun test` 334.
- S8 done and reviewed: `.github/workflows/ci-mobile-ios-parity.yml` (`structural` on `ubuntu-latest`, `ios-simulator` on `macos-26`, Xcode 26.5, iPhone 17 Pro / iOS 26.5). No label gate. Simulator scenarios stay `not_run` until that job uploads artifacts.
- `bun --filter @atmos/mobile typecheck` still reports errors only in `fold-transcript.test.ts`, `use-agent-chat-thread.test.ts`, and `expo-drawer.web.tsx`. Those files predate this work.
- Blocked: nothing in code. 图一 pixel metrics stay unverified. Do not install Cursor agent CLI or mobai-dev.
- Do not change web behavior beyond the D2(a) re-exports. Do not add a web route. Do not add `WsAction`s. Do not merge the PR.

## Slice Kanban

> Orchestration board for `atmos-long-task-impl`. Not a requirements source.

| ID  | Wave | Owns                                                      | Forbids                              | Depends | Status | Impl | Review | Verify                                                                             |
| --- | ---- | --------------------------------------------------------- | ------------------------------------ | ------- | ------ | ---- | ------ | ---------------------------------------------------------------------------------- |
| S0  | 0    | shared pure modules + web re-exports + mobile import swap | transcript UI rewrite, `PROGRESS.md` | specs   | done   | ok   | pass   | package tests, web unit tests, mobile bun test                                     |
| S1  | 1    | fixtures, `scripts/agent-chat-parity`, preview route      | web routes, CLI/mobai install        | S0      | done   | ok   | pass   | compare.ts 13 fixtures, package + mobile tests                                     |
| S2  | 2    | message views, expand store, session chrome               | tool tree, list engine               | S0, S1  | done   | ok   | pass   | mobile bun test 278; package tests; compare 13                                     |
| S3  | 3    | inline tool tree + bodies                                 | motion folder, card lane             | S2      | done   | ok   | pass   | mobile bun test 280; compare 13                                                    |
| S4  | 4    | `motion/`, shimmer, stream buffer, activity row           | card lane                            | S3      | done   | ok   | pass   | mobile bun test 285; compare 13                                                    |
| S5  | 5    | list stick, scroll pill shell, edge fades, own-send       | card pills                           | S2      | done   | ok   | pass   | mobile bun test 299; compare 13                                                    |
| S6  | 6    | card lane + card bodies                                   | composer option sheets               | S2, S5  | done   | ok   | pass   | mobile bun test 324; `card-lane` + `composer-cards`                                |
| S7  | 7    | composer parity                                           | new protocol                         | S6      | done   | ok   | pass   | mobile bun test 334; compare 13                                                    |
| S8  | 8    | `ci-mobile-ios-parity.yml`, coverage notes                | installing CLI/mobai                 | S1–S7   | done   | ok   | pass   | workflow file reviewed; `bash -n` on the capture script; simulator job not run yet |

**Status**: `planned` · `ready` · `in_progress` · `blocked` · `in_review` · `rework` · `done`

S4 through S8 were written one at a time because `AgentChatTranscript.tsx` is a hot file.

## Slice Cards

### S0 — Shared pure logic

- **Wave**: 0
- **Goal**: One copy of segmentation, settle, density, timing, motion constants, below-count, commit buffer, and the grok-chrome hide predicate, in `@atmos/agent-transcript`. Web paths re-export. Mobile stops shipping `assistant-process.ts`.
- **Out of scope**: New transcript UI, fixtures, preview route, card lane, shimmer component.
- **Owns**: listed in the S0 impl brief (package, the named web lib files, mobile assistant-process + its test, import adaptation in `AgentChatTranscript.tsx`, copy/token map tests, `packages/AGENTS.md` role sentence).
- **Forbids**: `PROGRESS.md`, `apps/web/src/features/agent/components/**`, new routes.
- **Depends**: spec review commit.
- **Invariants**: package stays UI-free and depends only on `@atmos/api-types`. DOM scroll helpers stay in web. No behavior change for web tests that import the old paths.
- **Verify**: package tests + typecheck, the named web unit tests, `cd apps/mobile && bun test`, `bun --filter @atmos/mobile typecheck`.
- **Review checklist**: re-exports cover previous public names; DOM functions not moved; mobile no longer defines `segmentAssistantParts`; web tests still import old paths.
- **HUMAN open questions**: none.

Later slice cards were filled in the impl briefs. Owns stayed disjoint from the hot transcript file across waves.

## Decisions Since TECH

| ID     | Decision                            | Why                                                        | Source update                                   |
| ------ | ----------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| R1–R11 | See TECH "Spec review (2026-10-15)" | Contradictions vs web copy, DOM lib, and AruNi's decisions | TECH/PRD/TEST/BRAINSTORM updated in `704483158` |
| D2     | D2(a) re-exports, not D2(b)         | One logic copy; web call sites keep their import paths     | S0                                              |
| Q4     | Real shimmer                        | Masked view + linear gradient, not a static color          | S4; both packages are MIT registry deps         |

## Verification Status

| Area                 | Command / Method                                                | Last result | Notes                                                              |
| -------------------- | --------------------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| Spec review          | read specs + web/mobile sources + runner-images readme          | done        | pins still match image `20260907.0351.1`                           |
| S4 mobile tests      | `cd apps/mobile && bun test`                                    | pass        | 285 tests                                                          |
| S5 mobile tests      | `cd apps/mobile && bun test`                                    | pass        | 299 tests                                                          |
| S6 mobile tests      | `cd apps/mobile && bun test`                                    | pass        | 324 tests                                                          |
| S7 mobile tests      | `cd apps/mobile && bun test`                                    | pass        | 334 pass, 0 fail, 82 files                                         |
| Package              | `bun --filter @atmos/agent-transcript test`                     | pass        | 31 pass, 0 fail, 5 files                                           |
| Structural           | `bun scripts/agent-chat-parity/compare.ts`                      | pass        | `13 fixtures match`                                                |
| Export trees         | `bun scripts/agent-chat-parity/export-trees.ts`                 | pass        | 13 files under gitignored `artifacts/structural/`                  |
| Capture script       | `bash -n scripts/agent-chat-parity/ios-capture.sh`              | pass        | syntax only; no simulator on this machine                          |
| S9 / S15 / S20 / S26 | dedicated assertions                                            | not_run     | behavior exists; no test asserts the scenario as written           |
| S27 Cursor CLI       | —                                                               | not_run     | do not install                                                     |
| S28 mobai-dev        | —                                                               | not_run     | do not install                                                     |
| S31 web PNGs         | out-of-tree harness                                             | not_run     | would need a new `apps/web` route; not added                       |
| iOS simulator        | runs `38732000113`, `38739388920`, `38746057563`, `38752947122` | not_run     | dialog, then the same black framebuffer hash; not fixture evidence |
| 图一 pixels          | image missing                                                   | not_run     | pill height 36 is provisional                                      |

## Known Blockers

- [ ] 图一 is not in the repo. Pixel pill metrics stay unverified.
- [ ] S27 and S28 need a separate AruNi approval to install external tools.
- [ ] Simulator screenshots are not fixture evidence. Uploaded PNGs are the open-url dialog or one black framebuffer (`fbcb6a8c2222…`).

## Handoff Notes

### Task goal

Phone Agent Chat matches web message/part/tool/motion/scroll/composer behavior, with the mobile pill-row exception in PRD M6.

### Current progress

S0–S8 are implemented and reviewed. The iOS job builds, but screenshots are still one black frame. The next run removes the dev-client launcher from the parity prebuild and restarts CoreSimulatorService after the framebuffer hint.

### Completed work

- Reviewed APP-081 against web libs, `en.json` card titles, wire events, mobile fold, and the macOS 26 runner image.
- Shipped shared transcript rules, fixtures, message views, inline tools, motion, stick-to-bottom, the card lane, composer paste, and the iOS parity workflow.

### Key decisions

- D2(a) via re-exports, not D2(b).
- Card pills are title-only and use the web card's real title.
- Real shimmer uses `expo-linear-gradient` and `@react-native-masked-view/masked-view`.
- iOS workflow is path-filtered, not label-gated. `pull_request` is not limited to `main`.
- File-change stats use line LCS and `countPatchStats`. `@pierre/diffs` was not added.

### Constraints

- No new `WsAction`, no web route, no unrelated web behavior edits.
- Do not install Cursor agent CLI or mobai-dev.
- Branch `feat/mobile-chat-web-parity`, PR base `docs/mobile-chat-web-parity`. Do not merge.

### Open issues

- 图一 pixel check.
- S31 web PNGs were not produced.
- S9, S15, S20, and S26 stay `not_run` because no dedicated test asserts them.
- Pre-existing mobile typecheck errors in three files.

### Next steps

1. Push the parity prebuild and framebuffer-service fix.
2. Watch `structural` and `ios-simulator`. Download `ios-parity` and compare F1 with F12 before marking any simulator scenario pass.
3. Do not merge.

### Relevant files/symbols

- `packages/agent-transcript`
- `apps/mobile/src/features/agent-chat/`
- `reduceLane` in `apps/mobile/src/features/agent-chat/card-lane.ts`
- `.github/workflows/ci-mobile-ios-parity.yml`
- `scripts/agent-chat-parity/ios-capture.sh`

## Changed Areas

- `specs/APP/APP-081_mobile-agent-chat-web-parity`: review amendments, coverage, this board.
- `packages/agent-transcript`: shared pure chat rules.
- `apps/web`: import-path re-exports only (D2a).
- `apps/mobile`: chat transcript, cards, composer, preview route, shimmer dependencies.
- `.github/workflows/ci-mobile-ios-parity.yml` and `scripts/agent-chat-parity/`.

## Progress Log

### 2026-10-15

- Completed spec review and commit `704483158`.
- S0 implemented and reviewed (pass, no P0/P1). Web `agent-tree-branch.test.ts` reads the package source for `return TREE_STEP_MS` because the web file is now a re-export.
- Mobile `bun test` passed (261). Package tests and the named web unit tests passed after that path fix.
- S1 implemented and reviewed (pass). `compare.ts` prints `13 fixtures match`.
- S2 implemented and reviewed (pass after a file-change rework). Mobile `bun test` 278. Package typecheck passed. Mobile typecheck still fails only in `fold-transcript.test.ts`, `use-agent-chat-thread.test.ts`, and `expo-drawer.web.tsx`.
- S3 implemented and reviewed (pass). Sheet and `event-model.ts` deleted. Mobile `bun test` 280.
- S4 implemented and reviewed (pass). Mobile `bun test` 285.
- S5 implemented and reviewed (pass). Mobile `bun test` 299.
- S6 implemented and reviewed (pass). Mobile `bun test` 324. Expanded card height is measured; `expandedCardHeight={0}` appears only in a stick-test comment.
- S7 implemented and reviewed (pass). Mobile `bun test` 334. New-chat paste stays raw text because that composer does not pass `onPasteChipsChange`.
- S8 implemented and reviewed (pass). Workflow is not limited to base `main`. `bash -n` passed.
- iOS job `38732000113` built and uploaded artifacts. Screenshots were the system "Open in Atmos?" dialog (all fixtures identical per theme). Capture script now preapproves the `atmos` scheme and fails when F1 and F12 screenshots match.
- Runs `38739388920`, `38746057563`, and `38752947122` delivered the deep link and evaluated the JS bundle, then uploaded the same black PNG (`fbcb6a8c2222…`). The framebuffer hint did not change pixels while CoreSimulatorService was already running.
- Run `38767206759` stopped in pod install: `app.config.js` exclude is ignored by CocoaPods, which reads `package.json`. `exclude-dev-client.js` writes that field on the runner before prebuild. Local `expo-modules-autolinking resolve` then omits the dev-client pods.
