# PROGRESS · APP-081: Mobile Agent Chat Web Parity

> Implementation Progress. Not a requirements source. Requirements stay in PRD/TECH/TEST.

## Status

- **State**: in_progress
- **Branch**: `feat/mobile-chat-web-parity` (base `docs/mobile-chat-web-parity`)
- **Last updated**: 2026-10-16
- **Current owner**: lead agent
- **Current phase**: S0–S8 implemented and reviewed. Runs `38789917018` and `38797183648` are green iOS runs for the transcript-only preview (S29). Run `38894137249` (head `d0dad93ae`) is a clean iOS Simulator matrix on the card-lane preview: 26 distinct frames, `F1-light` shows the release notes, `F4-dark` and `F11-dark` are the app, and `F12-light` shows the title pills. Run `38877961991` is an earlier height-36 build whose `F4-dark` and `F11-dark` were Springboard and whose `F1-light` missed the body. S27 is partial. S28 ran as react-native-web. S31 stays `not_run`.

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
- Blocked: nothing in code. 图一 pixel metrics stay unverified. Do not install Cursor agent CLI or mobai-dev in this session; the parent already ran both.
- Do not change web behavior beyond the D2(a) re-exports. Do not add a web route. Do not add `WsAction`s. Do not merge the PR.

## Slice Kanban

> Orchestration board for `atmos-long-task-impl`. Not a requirements source.

| ID  | Wave | Owns                                                      | Forbids                              | Depends | Status | Impl | Review | Verify                                                                                                               |
| --- | ---- | --------------------------------------------------------- | ------------------------------------ | ------- | ------ | ---- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| S0  | 0    | shared pure modules + web re-exports + mobile import swap | transcript UI rewrite, `PROGRESS.md` | specs   | done   | ok   | pass   | package tests, web unit tests, mobile bun test                                                                       |
| S1  | 1    | fixtures, `scripts/agent-chat-parity`, preview route      | web routes, CLI/mobai install        | S0      | done   | ok   | pass   | compare.ts 13 fixtures, package + mobile tests                                                                       |
| S2  | 2    | message views, expand store, session chrome               | tool tree, list engine               | S0, S1  | done   | ok   | pass   | mobile bun test 278; package tests; compare 13                                                                       |
| S3  | 3    | inline tool tree + bodies                                 | motion folder, card lane             | S2      | done   | ok   | pass   | mobile bun test 280; compare 13                                                                                      |
| S4  | 4    | `motion/`, shimmer, stream buffer, activity row           | card lane                            | S3      | done   | ok   | pass   | mobile bun test 285; compare 13                                                                                      |
| S5  | 5    | list stick, scroll pill shell, edge fades, own-send       | card pills                           | S2      | done   | ok   | pass   | mobile bun test 299; compare 13                                                                                      |
| S6  | 6    | card lane + card bodies                                   | composer option sheets               | S2, S5  | done   | ok   | pass   | mobile bun test 324; `card-lane` + `composer-cards`                                                                  |
| S7  | 7    | composer parity                                           | new protocol                         | S6      | done   | ok   | pass   | mobile bun test 334; compare 13                                                                                      |
| S8  | 8    | `ci-mobile-ios-parity.yml`, coverage notes                | installing CLI/mobai                 | S1–S7   | done   | ok   | pass   | workflow reviewed; `bash -n` and `mp4-duration.py --self-test` pass; simulator PNGs exist, recording gate still open |

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

| Area                 | Command / Method                                       | Last result | Notes                                                                  |
| -------------------- | ------------------------------------------------------ | ----------- | ---------------------------------------------------------------------- |
| Spec review          | read specs + web/mobile sources + runner-images readme | done        | pins still match image `20260907.0351.1`                               |
| S4 mobile tests      | `cd apps/mobile && bun test`                           | pass        | 285 tests                                                              |
| S5 mobile tests      | `cd apps/mobile && bun test`                           | pass        | 299 tests                                                              |
| S6 mobile tests      | `cd apps/mobile && bun test`                           | pass        | 324 tests                                                              |
| S7 mobile tests      | `cd apps/mobile && bun test`                           | pass        | 334 pass, 0 fail, 82 files                                             |
| Package              | `bun --filter @atmos/agent-transcript test`            | pass        | 31 pass, 0 fail, 5 files                                               |
| Structural           | `bun scripts/agent-chat-parity/compare.ts`             | pass        | `13 fixtures match`                                                    |
| Export trees         | `bun scripts/agent-chat-parity/export-trees.ts`        | pass        | 13 files under gitignored `artifacts/structural/`                      |
| Capture script       | `bash -n` and `mp4-duration.py --self-test`            | pass        | syntax and muxer only; no simulator on this machine                    |
| S9 / S15 / S20 / S26 | dedicated assertions                                   | pass        | `motion-constants`, `below-count`, `queue-actions`, `shared-rules`     |
| S27 Cursor CLI       | parent `agent -p` on react-native-web shots            | partial     | F3 pass; F12 cards fail; F6 suspected false positive                   |
| S28 mobai-dev        | parent RN-web preview, head `1a8ed362b`                | ran         | 26 frames, not iOS; 241/250 labels; 9 card misses                      |
| S31 web PNGs         | Next.js                                                | not_run     | `next dev` OOM; ubuntu job PNGs are react-native-web                   |
| iOS simulator        | runs `38789917018`, `38797183648`, `38894137249`       | pass (S29)  | `38894137249` is the clean card-lane matrix, including iOS title pills |
| 图一 pixels          | image missing                                          | not_run     | pill height 36 is provisional                                          |

## Known Blockers

- [ ] 图一 is not in the repo. Pixel pill metrics stay unverified.
- [ ] S10 and S30 stay `not_run`. Recordings last 8s and each file's frames are identical, so motion is not shown.
- [ ] Run `38877961991` is not a clean matrix (`F4-dark` and `F11-dark` are Springboard; `F1-light` missed the body). Run `38894137249` replaces it: those frames are the app, and `F1-light` shows the release notes. The light "Message Queue" gray fade was the pill-row gradient (`transparent` fades through black). That overlay is removed; Air still needs to confirm the frame. Collapsed card bodies are still off screen, so S27 F12 stays fail.
- [ ] S31 stays `not_run`. Next.js screenshots were not produced.

## Handoff Notes

### Task goal

Phone Agent Chat matches web message/part/tool/motion/scroll/composer behavior, with the mobile pill-row exception in PRD M6.

### Current progress

S0–S8 are implemented and reviewed. Later green iOS runs painted the transcript-only preview after the scene manifest was removed. Run `38807875046` (head `e60400eb2`) proved the ubuntu react-native-web export (26 PNGs) and then the iOS carousel crashed: two mounted preview routes each held a timer, and at F1 dark their layout effects wrote opposite theme preferences for about 8 seconds before React threw `Maximum update depth exceeded` at `UserMessage`. One shared clock and a single ready-line claim replace those timers. Run `38816093468` (head `4d25dfa03`) logged every ready line through `F13 dark #25` with no exception, and `default-route.png` is F1 light. Capture still failed: `simctl io screenshot` blocked for 61s and 54s, the 15s hold moved on, and several PNGs are the same later frame. Run `38823255381` stopped before F7. Run `38831101582` stopped before F2. Run `38837550765` (head `1ad359fc4`) kept a 90s cadence through `F8 light #7` and never logged `F9 light #8`. CI no longer depends on one JS timer living through the whole matrix. `ios-capture.sh` writes `Documents/parity-frame.json` and relaunches for each fixture. The preview reads it with `File.textSync()` before logging `[parity] ready <id> <theme> #0`, and does not arm the clock.

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
- S31 Next.js web PNGs were not produced (`next dev` OOM). Ubuntu `parity-rn-web` images are react-native-web and do not close S31.
- S27 is partial: F3 pass, F12 cards fail, F6 suspected false positive pending confirmation. Shots are react-native-web.
- S28 ran as react-native-web on scratch head `1a8ed362b` (26 frames, 241/250 labels). Not iOS.
- The carousel and preview card lane are not in runs `38789917018` or `38797183648`. Run `38849287823` has the expanded permission card on iOS and still has no title pills in those frames. Run `38877961991` shows the pills and is not a clean matrix. Run `38894137249` is the clean card-lane matrix with the pills.
- Run `38807875046` iOS capture is not a pass. Light frames and `F1-dark.png` were written. `F2-dark` onward and the `.mov` files were not. `structural` on that run did upload `parity-rn-web` (react-native-web, not Next, so S31 stays `not_run`).
- Run `38816093468` iOS capture is not a pass. The shared clock worked. The 26 PNGs are not all distinct.
- Run `38823255381` iOS capture is not a pass. The 90s hold worked through F6 light, then the next ready line never arrived.
- Run `38831101582` iOS capture is not a pass. The 500ms tick logged F1 light and never logged F2.
- Run `38837550765` iOS capture is not a pass. The 15s steps logged F1–F8 light on a 90s cadence and never logged F9. `structural` on that run succeeded.
- S9, S15, S20, and S26 pass in `motion-constants.test.ts`, `below-count.test.ts`, `queue-actions.test.ts`, and `shared-rules.test.ts`.
- Pre-existing mobile typecheck errors in three files.

### Next steps

1. Run `38894137249` is the clean iOS matrix. Do not cancel it or the earlier runs, including `38877961991`.
2. Do not treat `F4-dark`, `F11-dark`, or `F1-light` from `38877961991` as fixture frames. Use `38894137249` for those three.
3. S10 and S30 stay `not_run`. The `.mov` files are still frames.
4. Do not mark S27 F12 or S31 pass. Do not merge. `origin/main` still names `Atmos.SceneDelegate`; this branch does not.

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
- Run `38769715486` excluded those pods, built Release, and still captured the black Simulator window (`fbcb6a8c2222…`). `desktop-after-warmup.png` is the same black window. Console shows `evaluateJavaScript` and one `topLoad` drop (`UIManagerBinding.cpp` image `onLoad`, not a failed route). Linux `expo export --platform web` with `EXPO_PUBLIC_PARITY_PREVIEW=1` renders F1, including `[parity] preview-chat route`.
- Root cause of the black window: `app.json` `UIApplicationSceneManifest` names `Atmos.SceneDelegate`. Expo's template never generates that class and draws into `AppDelegate.window`. The same manifest was removed in `221c22b69` and restored in `23b993825`. It is removed again. The workflow fails prebuild if `Info.plist` still names a scene delegate, and writes `ios/.xcode.env.local` so the bundle phase inlines the preview flag as `"1"`.
- Run `38780693297` on head `f2b611c44`: `structural` passed. The Release build passed, so `main.jsbundle` contains `[parity] preview-chat route` and no scene delegate. Capture wrote distinct fixture PNGs (F1-light `dae7bb5e…`, F12-light `b560aee6…`) and then failed on `F4.mp4` (`afinfo` / 1.27s, 2 frames).
- Recording gate: stop using `simctl recordVideo` and `afinfo`. Screenshot the phone for 8s and mux JPEGs with `mp4-duration.py`. After warmup, screenshot the default route before any deep link, tail `console.log`, and save a device-log excerpt. The Release step prints `RCTNewArchEnabled` and fails if the built plist still names a scene delegate. `structural` runs `mp4-duration.py --self-test`. Preview route files were not edited.
- Run `38789917018` on head `75cbb201e`: `structural` and `ios-simulator` passed. 26 fixture PNGs, all different. `F4.mov` / `F12.mov` / `F13.mov` are 8.000s and each file has one repeated frame. S29 is pass. S10 and S30 stay `not_run`. `default-route.png` is the pair screen (`51cd7923…`) while the log still contains `[parity] preview-chat route`. `topLoad` was dropped on this green run too.
- Redirect `/` and `/sign-in` to `/preview-chat` in parity builds. The capture script now fails on the pair-screen hash as well as the black scene hash.
- Run `38797183648` on head `af9bc6ba8`: `structural` and `ios-simulator` passed. `default-route.png` sha256 equals `F3-light` (`14bbae46…`) and shows fixture F3 before any deep link. F1-light and F12-light match the previous green run.
- Parent Linux report, scratch head `1a8ed362b` (older than the scene-delegate fix): react-native-web `PreviewChatScreen` rendered F1–F13 × light/dark, 26 distinct hashes. Structural labels 241/250; 9 misses are card channels. Cursor CLI rubric: F3 pass, F12 cards 8 fail, F6 suspected false positive ("2 files changed" footer; web has `AssistantTurnFileChanges`). `next dev` OOM, so S31 stays `not_run`. `topLoad` is harmless. Device logs on the later green iOS runs contain `[parity] preview-chat module` and `[parity] preview-chat route`.
- Preview route now cycles those frames, logs `[parity] ready <id> <theme> #<seq>`, and mounts the pill row, composer, and the preempted permission card. Capture waits on the log line, screenshots Springboard first, and does not call `openurl`. `applyParityPreviewConfig` deletes `UIApplicationSceneManifest` when the flag is `"1"`. The ubuntu job exports the same preview to react-native-web. Mobile `bun test` 349 pass.
- Run `38807875046` head `e60400eb2`: `structural` passed and uploaded `parity-rn-web` (26 distinct react-native-web PNGs, not iOS, not Next). iOS capture wrote F1–F13 light and F1 dark, then `Maximum update depth exceeded` at `UserMessage` (~8s after `ready F1 dark #13`). Ready lines were doubled on every light frame. Two preview routes were mounted. The shared clock is the follow-up.
- Run `38816093468` head `4d25dfa03`: `structural` passed. iOS capture logged every ready line through `F13 dark #25` and did not throw. `default-route.png` equals `F1-light` (`210adf69…`). The distinct-PNG check failed. `simctl io screenshot` blocked for 61s and 54s against the 15s hold. Duplicate groups: `F1-dark`+`F13-light`, `F2-light`+`F3-light`, `F3-dark`+`F4-dark`, `F6-light`+`F7-light`+`F8-light`. Hold is now 90s. The script fails if the next ready line is already logged when the screenshot returns. The iOS job timeout is 120 minutes.
- Run `38823255381` head `afd34968d`: `structural` passed. iOS capture logged `F1 light #0` through `F6 light #5` on a 90s cadence. Screenshots of those frames returned before the next line. `F7 light #6` was still missing after a 120s wait. No `Maximum update depth`.
- Run `38831101582` head `993d9c2b8`: `structural` passed. iOS capture logged `F1 light #0`, wrote `F1-light.png`, and exited because `F2 light #1` was missing after 120s. The follow-up repeats a 15s timeout until the 90s hold has elapsed.
- Run `38837550765` head `1ad359fc4`: `structural` passed. iOS capture logged `F1 light #0` through `F8 light #7` about 90.0s apart, then `F9 light #8` was missing. The expected F9 time was inside the 120s wait. No `Maximum update depth`. The follow-up writes `Documents/parity-frame.json` and relaunches for each fixture. The in-app clock is not the CI capture path.
- Run `38843429024` head `8887761c4`: `structural` and `ios-simulator` passed. Each launch logged `[parity] disk <id> <theme>` and one `[parity] ready <id> <theme> #0`. 26 PNG hashes differ. `default-route.png` equals `F1-light`. `F1-dark` shows the release notes. `F12-light` shows the expanded permission card. `F1-light` is an empty `#f4f4f6` background and `F11-dark` is an empty black background. `png-flat.py` now rejects a shot that is at least 95% one color and the script takes it again. That retry is not in this artifact.
- Run `38849287823` head `37e873ad3`: `structural` and `ios-simulator` passed. [ios-parity](https://github.com/AruNi-01/atmos/actions/runs/38849287823/artifacts/12027645661). 26 PNGs, all different, none at least 95% one color. `F1-light` (`b0b84429…`) shows the release notes. `F11-dark` (`68d2ab6f…`) shows Allow and Deny. `F6-light` shows the "2 files changed" footer. The iOS frames have no title pills between the card and the composer. [parity-rn-web](https://github.com/AruNi-01/atmos/actions/runs/38849287823/artifacts/12024279302) is react-native-web, not iOS and not Next, and its F12 shows "Questions for you", "Plan", and "Message Queue". The pill row style now sets height 36. That change is not in this artifact.
- Run `38857737524` head `d48e7e5a9`: `structural` passed. `ios-simulator` was cancelled when the 120 minute job limit hit during capture. No `ios-parity` artifact, so the pill height is still unverified on iOS. The job limit is now 180 minutes.
- Run `38871450335` head `695880ca2`: `structural` passed. Capture logged `[parity] ready F1 light #0`, then `simctl io screenshot` had not returned at 90s and the script killed it three times. Springboard's screenshot returned in 4s. The cap is now 240s, above the slow frames on run `38849287823`. [ios-parity](https://github.com/AruNi-01/atmos/actions/runs/38871450335/artifacts/12035551516) has the console and Springboard only.
- Run `38877961991` head `b81686ddf`: `structural` and `ios-simulator` passed. [ios-parity](https://github.com/AruNi-01/atmos/actions/runs/38877961991/artifacts/12041953218). 26 fixture hashes differ, and `default-route.png` equals `F1-light` (`870b231a…`). iOS `F12-light` (`832fffe5…`) and `F12-dark` show "Questions for you", "Plan", and "Message Queue" between the permission card and the composer. `F11-light` shows the expanded permission card and the "Questions for you" pill. `F6-light` (`06f2df9b…`) still shows the "2 files changed" footer. `F4-dark` and `F11-dark` are the home screen (405 coarse colors). `F1-light` was written about 6s after ready, before the release-notes body; dominant fraction 0.848, so the flat check kept it. [parity-rn-web](https://github.com/AruNi-01/atmos/actions/runs/38877961991/artifacts/12036361467) is react-native-web, not iOS and not Next. `png-flat.py` now exits 3 on a home-screen shot, and capture waits 15s after ready, then relaunches when the shot is Springboard. That gate is not in this artifact.
- Run `38894137249` head `d0dad93ae`: `structural` and `ios-simulator` passed. [ios-parity](https://github.com/AruNi-01/atmos/actions/runs/38894137249/artifacts/12049311013). 26 fixture hashes differ. `default-route.png` equals `F1-light` (`ffe20d90…`, dominant fraction 0.617) and shows the release notes, the table, the TypeScript block, and the mermaid fence. `F4-dark` (`1c623bdc…`) is "The export is ready.", not Springboard. `F11-dark` (`12d6f6e0…`) shows "Questions for you", Allow, Deny, and the "Questions for you" pill. `F12-light` is the same pixels as run `38877961991` (`832fffe5…`): the permission card, the three title pills, and the 15% trigger. The light "Message Queue" pill still fades gray on its right edge. `F6-light` is still `06f2df9b…` ("2 files changed"). `png-flat.py` exits 1 on every fixture PNG and exits 3 only on `springboard.png` (393 coarse colors). The first `F7-dark` shot was the home screen; the relaunch shows "Here is the plan." No `Maximum update depth`. [parity-rn-web](https://github.com/AruNi-01/atmos/actions/runs/38894137249/artifacts/12043376294) is react-native-web, not iOS and not Next. `origin/main` still names `Atmos.SceneDelegate`. This branch does not, and this Xcode 26.5 capture paints.
- S9, S15, S20, and S26 now have dedicated bun tests (`motion-constants`, `below-count`, `queue-actions`, `shared-rules`). 8 pass, 0 fail. Simulator scenarios and S31 stay `not_run`.
- Visual pass after `38894137249`, not yet on an Air screenshot: preview root uses `insets.top`. Chat screens set `scrollEdgeEffects` to hidden. Edge fades no longer interpolate through black, and the top fade stays off at scroll 0. The pill-row end gradient is gone. The placeholder sits on its own line. An empty picker shows "No agent" instead of "Model". Markdown tables use zinc colors and a native stretch to the row width. Inline code uses zinc-100 / zinc-800 instead of the library pink fill and pink border. Code-block language headers stay, because web `MarkdownCodeBlock` has them. Do not add a 60-minute capture timeout: `38894137249` capture ran about 75 minutes. S27 F12 and S31 stay not pass.
- The screen `scrollEdgeEffects` walk only the first descendant scroll view (`RNSScrollViewFinder`). The pill row is a later sibling, so iOS 26 still blurs its right edge. `HideScrollEdge` (`AtmosScrollEdge`) hides `UIScrollEdgeEffect` on the transcript and that row. The gamma scroll-view marker is excluded from the pod. Air still has to confirm the frame. Ignore the cloud capture.
