# TEST · APP-081: Mobile Agent Chat Web Parity

> Test Plan · the verification contract for PRD APP-081 (M1–M9) and TECH APP-081. Gap ids `G-nn` are in [BRAINSTORM](./BRAINSTORM.md). Mobile has no Playwright harness (APP-079 TEST), so parity is proven by rule-level tests, fixture-driven structural comparison, a Linux preview pass, and a real iOS simulator run with downloadable evidence.

## Test strategy

| Level                                                 | What it proves                                                                                                                             | Gating?                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Bun unit (`apps/mobile`, `packages/agent-transcript`) | Pure rules: segmentation, settle, density, timing, card lane reducer, token/copy parity, fold of recorded event scripts                    | **Yes**                                                       |
| Structural comparison (`scripts/agent-chat-parity`)   | For each fixture, web and phone produce the same ordered part tree: node kind, label text, group membership, expanded/collapsed state      | **Yes**                                                       |
| Cursor agent CLI rubric comparison                    | Per-item pass / fail with evidence from paired web and phone screenshots and trees (layout, spacing, color role, copy, motion description) | Advisory, never the only gate                                 |
| Linux preview (mobai-dev)                             | Inner-loop render of the phone UI, semantic tree, screenshots, hot reload                                                                  | Advisory; **not iOS rendering**                               |
| GitHub Actions macOS, real iOS simulator              | Real native render: screenshots and recordings (light / dark, collapsed / expanded, streaming replay) uploaded as artifacts                | Gating for "ran on a real simulator"; visual verdict is human |
| Manual (AruNi)                                        | Final visual sign-off on web-vs-phone images and animation recordings                                                                      | Yes, for merge                                                |

Honesty rules: a scenario is `not_run` unless the exact command ran. Advisory results are labeled advisory. Unverified items are listed in `Coverage Status` and in the PR description. No screenshot counts as proof of motion; recordings do.

## Fixture set

Committed under `packages/agent-transcript/fixtures/parity/` (TECH D7), scrubbed of paths, tokens, and private content. Each has `messages` and, for streaming fixtures, a `script` of `{atMs, event}` replayed through the real fold on both surfaces.

| Id  | Content                                                                                                              | Covers           |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------------- |
| F1  | Answer markdown: heading, list, table, inline code, fenced code, mermaid fence, workspace path, http link            | G-03             |
| F2  | Thinking then answer, settled; thinking with and without duration                                                    | G-04             |
| F3  | Settled turn: read / search / edit tools, thinking, answer; "Worked for 42s", process collapsed                      | G-05, G-07, G-02 |
| F4  | Streaming replay: thinking → tool group grows → answer streams → settle auto-collapses process                       | G-12…G-16        |
| F5  | Command tool with long ANSI output (collapsed and expanded)                                                          | G-06             |
| F6  | Edit and patch tools (diff stats in group header, diff body)                                                         | G-05, G-06       |
| F7  | Web search + image output + plan document tools                                                                      | G-06             |
| F8  | Subagent task with child tools, `subagent_wait`                                                                      | G-11, G-23       |
| F9  | Session lifecycle (running / created / failed), config change, hint (warning / error), error part                    | G-08, G-09       |
| F10 | User messages: long text (collapse), paste/URL chips, attachments, pending echo, meta row open                       | G-01             |
| F11 | Historic permission part (resolved) + pending permission                                                             | G-10, G-24       |
| F12 | Cards: plan, queue (3 items), background commands, subagent tasks, goal, workflow, context usage, permission pending | G-23…G-25        |
| F13 | 200-message long chat for scroll behavior (up-reading while a streaming tail grows)                                  | G-17…G-20        |

## Coverage map

| PRD item | Scenario ids                 |
| -------- | ---------------------------- |
| M1       | S1, S2, S3, S4               |
| M2       | S5, S6, S7, S8               |
| M3       | S9, S10, S11                 |
| M4       | S12                          |
| M5       | S13, S14, S15, S16, S32, S33 |
| M6       | S17, S18, S19, S20, S21, S33 |
| M7       | S22, S23                     |
| M8       | S24, S25, S26                |
| M9       | S27, S28, S29, S30, S31      |
| N1–N4    | Not in the acceptance bar    |

## Execution map

| Scenario | Level            | Expected tool                                           | Target command / method                                                                                                                                                              | Fixture / data | Observable signals                                                                                                      | Status  |
| -------- | ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------- | ------- |
| S1       | Bun unit         | `bun test`                                              | `cd apps/mobile && bun test src/features/agent-chat/user-message`                                                                                                                    | F10            | meta row toggles; collapse threshold equals shared `USER_MESSAGE_COLLAPSE_LINES`; pending echo dim flag                 | not_run |
| S2       | Bun unit         | `bun test`                                              | assistant footer visible only when `shouldShowAssistantTurnEndedChrome` equivalent is true                                                                                           | F3             | copy / usage / worked-for present after settle, absent while streaming                                                  | not_run |
| S3       | Structural       | `bun scripts/agent-chat-parity/compare.ts`              | answer text nodes                                                                                                                                                                    | F1, F2         | same ordered nodes (paragraph, heading, list, table, code, thinking) in web and phone                                   | not_run |
| S4       | Structural       | compare                                                 | session chrome, error, historic permission nodes                                                                                                                                     | F9, F11        | same icon kind, tone, and copy per node                                                                                 | not_run |
| S5       | Bun unit         | `bun test`                                              | shared segmentation: every fixture through `segmentAssistantParts` + `splitSegmentedAssistantParts`                                                                                  | all            | identical segment lists web vs phone import (D2a: same module; D2b: both modules compared)                              | not_run |
| S6       | Structural       | compare                                                 | tool group header text and counts                                                                                                                                                    | F3, F6         | same overview sentence and diff stats string                                                                            | not_run |
| S7       | Bun unit         | `bun test`                                              | process fold settle / auto-collapse / inspect rules; expand store keys                                                                                                               | F3, F4         | collapsed after settle unless inspected; state survives list remount                                                    | not_run |
| S8       | Structural       | compare                                                 | tool bodies per kind                                                                                                                                                                 | F5–F8          | each web tool kind has a phone body of the same kind; no sheet opens                                                    | not_run |
| S9       | Bun unit         | `bun test`                                              | motion constants equal web values (D2a: single source; D2b: cross-import test)                                                                                                       | —              | `TREE_DRAW_MS=400`, ease, stagger values equal                                                                          | not_run |
| S10      | iOS simulator    | `ci-mobile-ios-parity.yml`                              | record F4 replay                                                                                                                                                                     | F4             | recording shows reveal, tree draw-in, chevron, shimmer; reduced-motion run shows none                                   | not_run |
| S11      | iOS simulator    | `ci-mobile-ios-parity.yml`                              | Reduce Motion on (`simctl` accessibility setting / app flag) re-run of F4                                                                                                            | F4             | recording has no animated transitions                                                                                   | not_run |
| S12      | Bun unit         | `bun test`                                              | display buffer: 56 ms commit, flush on end / stop / error / reduced motion                                                                                                           | F4 script      | committed text sequence equals web's for the same event script                                                          | not_run |
| S13      | Bun unit         | `bun test`                                              | stick/anchor reducer: drag away flips `stickToEnd`; threshold 24; return flips back                                                                                                  | —              | state transitions as specified                                                                                          | not_run |
| S14      | iOS simulator    | workflow + scripted scroll                              | F13: scroll up while the tail streams                                                                                                                                                | F13            | reading line stays put (frame diff of a marker row); the pinned left pill in the button row shows "N below" and N grows | not_run |
| S15      | Bun unit         | `bun test`                                              | below-count helper equals web `countMessagesBelowViewport` on shared measurements                                                                                                    | F13            | equal counts                                                                                                            | not_run |
| S16      | Bun unit         | `bun test`                                              | bottom pad = 40 + (expanded card height + pill row height); row height 0 when the row is not rendered; shrink easing flag                                                            | F12            | pad values                                                                                                              | not_run |
| S17      | Bun unit         | `bun test`                                              | `card-lane.test.ts` rules 1–8, including toggle-collapse on re-tap                                                                                                                   | F12            | reducer states                                                                                                          | not_run |
| S18      | Bun unit         | `bun test`                                              | `composer-cards.ts` derives the card set from folded state                                                                                                                           | F12            | plan, queue, background, subagents, goal, workflow, context descriptors present with titles                             | not_run |
| S19      | Structural       | compare                                                 | permission card content (questions, plan todos, plan-exit intent, option kinds)                                                                                                      | F11, F12       | same controls per request                                                                                               | not_run |
| S20      | Bun unit         | `bun test`                                              | queue card edit / reorder / remove call the same actions as web                                                                                                                      | F12            | wrapper call args                                                                                                       | not_run |
| S21      | iOS simulator    | workflow                                                | F12: one card expanded, the rest as glass pills in the row above the input; tap swaps; re-tap collapses                                                                              | F12            | screenshots per step                                                                                                    | not_run |
| S22      | Bun unit         | `bun test`                                              | composer capability matrix (attachments, paste, slash, `@`, options, usage trigger, busy actions)                                                                                    | —              | each capability present for an agent that supports it; omitted otherwise                                                | not_run |
| S23      | iOS simulator    | workflow                                                | composer states: idle, multiline, keyboard open, busy (stop / queue / steer), suggestions                                                                                            | —              | screenshots                                                                                                             | not_run |
| S24      | Bun unit         | `bun test`                                              | copy parity: mapped `copy.ts` strings equal `apps/web/messages/en.json` values                                                                                                       | —              | zero mismatches                                                                                                         | not_run |
| S25      | Bun unit         | `bun test`                                              | token map: every mapped phone role exists in light and dark themes                                                                                                                   | —              | no missing role                                                                                                         | not_run |
| S26      | Bun unit         | `bun test`                                              | no duplicate rule modules remain in `apps/mobile` (D2a)                                                                                                                              | —              | deleted files absent; imports resolve to the package                                                                    | not_run |
| S27      | Cursor agent CLI | `agent` (Cursor CLI) rubric                             | `bun scripts/agent-chat-parity/rubric.ts --fixture F3` etc.                                                                                                                          | F1–F13         | JSON: per-item `pass` / `fail` / `unsure` + evidence; saved as artifact                                                 | not_run |
| S28      | Linux preview    | `mobai-dev preview` (RN engine)                         | preview entry renders `preview-chat` with a fixture; semantic tree + screenshot                                                                                                      | F3, F12        | tree contains expected nodes; screenshot saved                                                                          | not_run |
| S29      | iOS simulator    | `ci-mobile-ios-parity.yml`                              | full fixture matrix, light + dark                                                                                                                                                    | F1–F13         | screenshot artifact per fixture and scheme                                                                              | not_run |
| S30      | iOS simulator    | `ci-mobile-ios-parity.yml`                              | animation recordings F4, F13, F12 pill swap                                                                                                                                          | F4, F12, F13   | `.mp4` artifacts                                                                                                        | not_run |
| S31      | Web capture      | Playwright (`scripts/agent-chat-parity/web-capture.ts`) | same fixtures at 390×844, DPR 3, light and dark                                                                                                                                      | F1–F13         | web PNG + web tree JSON artifacts used by S3–S8, S19, S27                                                               | not_run |
| S32      | Bun unit         | `bun test`                                              | scroll-pill rules: visible iff `messages.length > 0` and not at end (slack 24 px); label "N below" iff N > 0; not part of `LaneState`; row rendered iff any card pill or scroll pill | F12, F13       | booleans and labels match the rule table                                                                                | not_run |
| S33      | iOS simulator    | workflow + scripted scroll                              | F12 + F13: pill row layout, scroll pill pinned left while card pills scroll, expanded card above the row                                                                             | F12, F13       | screenshots and recording show pinned left pill, scrolling pills, one card                                              | not_run |

## Scenarios

### S3 Answer text structure

- **Given**: fixture F1 loaded in the web harness and the phone preview route.
- **When**: both surfaces render the settled turn.
- **Then**: the ordered node list matches (paragraph, heading, list, table, inline code, code block, mermaid-as-fence where documented, path chip, link).
- **Signals**: `compare.ts` exit code 0; per-node diff report is empty. Known differences (table rendering, code highlight) must be listed in the report as `known`, never hidden.

### S7 Process fold and expand persistence

- **Given**: F4 replayed; the user never expands anything.
- **When**: the turn settles.
- **Then**: the process collapses to "Worked for X ›". If the user expanded a group during streaming, it stays open after settle. Scrolling the row off screen and back preserves the state.
- **Signals**: expand store values for `process:<id>` and `inspect:<id>`; remount test keeps them.

### S14 Reading upward while streaming

- **Given**: F13 with a streaming tail; the simulator list scrolled up by ~1.5 screens.
- **When**: the tail grows for 5 s.
- **Then**: a marker row stays at the same screen position (±2 px); the scroll-to-bottom pill appears at the left end of the button row above the input with a growing "N below"; tapping it returns to the end, the pill disappears, and `stickToEnd` resumes.
- **Signals**: recording frame diff of the marker row; pill label text and position (S33).

### S17 Card lane

- **Given**: available cards `{plan, queue, background}`, nothing visible.
- **When**: the user taps "Queued", a permission request arrives, it is answered, then the user taps "Queued" again.
- **Then**: permission takes the slot at once; `queue` stays a pill. After the answer, `queue` is expanded again (userChoice). Re-tapping the expanded "Queued" pill collapses it (`visible = null`). At most one card is expanded at every step.
- **Signals**: reducer states per step (unit); screenshots (S21).

### S21 Card lane on a real simulator

- **Given**: fixture F12 on iPhone 17 Pro, light and dark.
- **When**: initial load, tap a pill, tap another, tap the expanded one again, answer permission.
- **Then**: at most one expanded card each time; every available card has a pill in the row above the input; cards use the existing card style, pills are `GlassPanel` capsules showing only titles, fade only.
- **Signals**: screenshots before / after each tap (artifact names `F12-<step>-<scheme>.png`); recording of the swap.

### S32 Scroll-to-bottom pill rules

- **Given**: pure helper inputs: `messages.length`, `stickToEnd`, below-count `N`, available cards.
- **When**: the cases below are evaluated.
- **Then**:

| messages | stickToEnd | N   | cards | scroll pill                | row rendered |
| -------- | ---------- | --- | ----- | -------------------------- | ------------ |
| 0        | true       | 0   | none  | hidden                     | no           |
| 5        | true       | 0   | none  | hidden                     | no           |
| 5        | true       | 0   | 2     | hidden                     | yes          |
| 50       | false      | 3   | none  | "3 messages below"         | yes          |
| 50       | false      | 0   | none  | chevron only               | yes          |
| 50       | false      | 3   | 2     | "3 messages below" at left | yes          |

- **Signals**: unit assertions; `LaneState` has no scroll field; label text equals web's composition of `scrollBelow.prefix/unit/suffix` ("N below" elsewhere in this spec is shorthand for it).

### S33 Pill row on a real simulator

- **Given**: F12 plus F13 on iPhone 17 Pro, light and dark; the composer below the row reads the placeholder.
- **When**: scroll the transcript up ~1.5 screens; swipe the card pills horizontally with more pills than fit; tap a pill; scroll back to the end by tapping the scroll pill.
- **Then**: the scroll pill stays at the left end of the row while card pills scroll beneath the row's remaining width (never under the pinned pill); the expanded card appears above the row (confirmed by AruNi, 2026-10-15) and the row does not move; tapping the scroll pill returns to the end and it fades out, card pills slide left; no horizontal scroll indicator; the row sits directly on top of the composer.
- **Signals**: screenshots `F12F13-<step>-<scheme>.png`; frame positions of the pinned pill (x constant ±1 px during the swipe).

### S27 Cursor agent CLI rubric (advisory)

- **Given**: paired web and phone screenshots and trees for a fixture; the rubric file `scripts/agent-chat-parity/rubric.md` listing items (message order, grouping, labels, spacing scale, color roles, caret, chevron state, card count, chip titles, composer controls).
- **When**: `agent -p` (Cursor agent CLI, non-interactive, JSON output) is run with the rubric and the paired inputs.
- **Then**: every rubric item is `pass`, or `fail` / `unsure` with evidence and a pointer into the deviation register (TECH V1–V7) when intentional.
- **Signals**: `rubric-<fixture>.json` artifact; the PR description quotes the fail / unsure list verbatim. A CLI that is missing or not logged in makes this scenario `not_run` with the reason, and the structural comparison still gates.

## Cursor agent CLI comparison (S27) protocol

1. Prerequisite check: `agent --version` (or `cursor-agent --version`) and `agent status` report an authenticated session. On the box where this spec was written, neither binary was on `PATH`; the install and login must be confirmed by AruNi before S27 can run.
2. Inputs per fixture: `web/<id>-<scheme>.png`, `web/<id>.tree.json`, `phone/<id>-<scheme>.png`, `phone/<id>.tree.json` (phone tree from the simulator accessibility tree or the preview semantic tree).
3. The runner never lets the model edit files: read-only prompt, JSON schema output, no tool permissions.
4. Output is merged with the structural comparer's report; any `fail` the model reports that the structural comparer does not confirm is tagged `model-only`.
5. Same session means the same fixture and same replay script on both sides. For live checks, the same `chat_id` on one Computer is used and recorded in the report.

## mobai-dev evaluation (Linux preview, S28)

Evaluated on the Grok Bot box (Linux x64, Node v20.19.2, Bun 1.4.2, 8 cores, ~16 GB RAM with ~4 GB available at the time, no Docker). **mobai-dev was not installed or run** because installation creates a third-party MobAI account (emailed sign-in code) and downloads binaries; that needs user approval.

What was verified without installing it:

- `MobAI-App/mobai-dev` v1.3.5 (MIT source; binaries under `LICENSE-BINARY.md`, free to run, previews need a free MobAI account). Linux amd64 / arm64 binaries exist.
- The React Native engine `rn.tar.gz` (46 KB) bootstraps on the box without an account: `npm install --omit=dev` plus `npx playwright install chromium` succeeded. Its dependencies are `react-native-web`, `vite`, `@vitejs/plugin-react`, `playwright`.
- Running the engine directly fails by design: `ENGINE_NOT_PERMITTED … started by mobai-dev, which supplies its permission to run`. So an account-bound `mobai-dev` binary is required.

What the architecture means for Atmos:

- The "preview" is **react-native-web rendered by Vite in headless Chromium**, not an iOS or React Native render. Fonts, native glass (`expo-glass-effect`), `@expo/ui` SwiftUI (`ExpoDrawer`), `expo-ios-popover`, the native markdown views (`react-native-streamdown`, `react-native-enriched-markdown`), `react-native-keyboard-controller`, and the local native module `atmos-url-session-socket` do not exist there. Visual fidelity claims from this pass are limited to structure, semantics, flow, and rough layout.
- The engine has an expo-router mode, a registry/entry mode (`--entry <file>`), and a scenario file (location, permissions, camera, photos, network, auth, push, clipboard, deepLink, appearance mocks). Atmos is Metro + `nativewind` v5 preview + `react-native-css`; Vite does not run Metro's babel pipeline, so the **entry-mode path with a dedicated `preview-chat` entry** (no router, fixture data, adapters for native views) is the realistic route, not the full app.

Blockers and effort, in order:

1. **Account and install approval** (external action): `curl -fsSL https://mobai.run/cloud/install.sh | sh` installs Tailscale static binaries, the `mobai-dev` binary, engines, and skills, then signs in. Needs AruNi's go-ahead, an email for sign-in, and egress to `mobai.run`, `*.mobai.run`, `tailscale.com`, `github.com`, npm. Tailscale is only needed for physical phones; skip it for preview if the script allows.
2. **Native-module adapters** for the list above; the public catalogue covers `react-native-svg`, `react-native-keyboard-controller`, `expo-image`, `expo-font`, `@expo/vector-icons`, others — not `expo-glass-effect`, `@expo/ui`, the markdown natives, or the local socket module. These need small project adapters in the mocks directory.
3. **Bundler mismatch**: Metro-only config (`babel-preset-expo`, `nativewind` v5, `react-native-css`) under Vite. Needs an isolated entry that imports only the chat feature and theme tokens. Risk: medium-high; budget a spike in S1.
4. **Memory**: the box showed ~4 GB available; Vite plus Chromium plus the monorepo graph can exceed that. Run with a single worker and no other builds.
5. **Not gating**: any screenshot from this engine must be labeled "react-native-web preview, not iOS".

Feasibility verdict: **possible for the inner loop after a spike, not verified**, and never a substitute for the macOS simulator run. If the spike fails inside one day, drop S28 and rely on the structural comparer plus the simulator job; record the reason in `Coverage Status`.

## GitHub Actions macOS runner (S10, S11, S14, S21, S23, S29, S30, S33)

Workflow: `.github/workflows/ci-mobile-ios-parity.yml`. Triggers: `workflow_dispatch` and `pull_request` limited by `paths` (`apps/mobile/**`, `packages/agent-transcript/**`, the workflow itself) **and** a label `ios-parity`, because macOS minutes are expensive.

Version pins (verified from the runner-images `macos-26-arm64` readme, image `20260907.0351.1`; re-check at implementation time because images roll):

| Item        | Pin                                                                                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runner      | `macos-26` (arm64). Do not use `macos-14`: deprecation completes 2026-11-02                                                                                                               |
| Xcode       | `sudo xcode-select -s /Applications/Xcode_26.5.app` (26.5; default is 26.6, installed side by side)                                                                                       |
| iOS runtime | iOS 26.5 simulator (installed list: 26.2, 26.4, 26.5; 26.6 has no simulator runtime)                                                                                                      |
| Device      | `iPhone 17 Pro` (same as APP-079 evidence). Resolve the UDID with `xcrun simctl list devices available -j`; create the device if the name is missing; fail with a clear message otherwise |
| Why 26.x    | Liquid Glass (`expo-glass-effect`) needs the iOS 26 SDK; app deployment target stays 16.4                                                                                                 |

Job outline (sketch, finalized in S8):

1. `actions/checkout`, setup bun via `./.github/actions/setup-bun`, `bun install`.
2. `cd apps/mobile && bunx expo prebuild --platform ios --no-install` then `pod install` (CocoaPods 1.17 is preinstalled). Cache `~/Library/Caches/CocoaPods`, `apps/mobile/ios/Pods`, `DerivedData` keyed on `bun.lock` + `app.json`.
3. Build for the simulator with a **bundled JS** configuration (`xcodebuild … -sdk iphonesimulator -configuration Release`) so no Metro is needed. Risk: `expo-dev-client` launcher in Release; verify in S8 and, if needed, set `EXPO_PUBLIC_PARITY_PREVIEW=1` and exclude the dev-client launcher for this build.
4. `xcrun simctl boot <udid>`; `xcrun simctl bootstatus <udid> -b`; `simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`.
5. For each scheme in `light dark`: `simctl ui <udid> appearance <scheme>`; for each fixture: `simctl launch --terminate-running-process <udid> land.atmos.mobile` with a deep link `simctl openurl <udid> "atmos://preview-chat?fixture=<id>&theme=<scheme>&expand=<mode>"`; wait for a ready marker (a fixed 2 s settle plus an accessibility element `parity-ready`); `simctl io <udid> screenshot out/<id>-<scheme>.png`.
6. Recordings for F4, F12, F13: start `simctl io <udid> recordVideo --codec h264 out/<id>.mp4 &`, open the deep link with `replay=1`, wait for the script duration plus 1 s, send `SIGINT` to the recorder and wait for it to finish writing; for F13 drive scroll with `simctl` scripted gestures if available, otherwise through the app's own replay driver (`scroll=auto` query param implemented in the preview route).
7. Reduce Motion run (S11): same deep link with `motion=reduced`, which sets the app's reduced-motion override; additionally record once with the system setting where the runner allows it.
8. `actions/upload-artifact` with `if: always()`, `retention-days: 14`, one artifact `ios-parity-<run_id>` containing screenshots, recordings, the fixture index, device/Xcode/runtime versions (`xcodebuild -version`, `xcrun simctl list runtimes`), and a `summary.md`. The job summary links the artifact so AruNi can download it from the run page.
9. A second job on `ubuntu-latest` captures web screenshots/trees with Playwright (S31) for the same fixtures and uploads `web-parity-<run_id>`; a third job downloads both and runs `compare.ts` and, if available, the rubric runner, posting the report as a job summary (no PR comment without approval).

Known risks: first Pod/Xcode build is slow (budget 20–30 min uncached); simulator boot flakiness (retry once, then fail with logs); `recordVideo` needs a graceful `SIGINT` or the file is truncated; the preview route must be inert in production builds (TECH D8, Security).

## Exploratory checks

`agent-browser` does not drive the iOS simulator. Use it only on the **web** side to capture and inspect the reference chat when the web app is running (after loading the Agent Browser skill per `specs/AGENTS.md` §3.1): copy, layout, console and network errors on the web chat that the phone is compared against. Phone exploratory checks are the simulator recordings and the Cursor CLI rubric.

## Regression checklist

- [ ] `cd apps/mobile && bun test` and `bun run typecheck` pass.
- [ ] `cd packages/agent-transcript && bun test` and typecheck pass.
- [ ] If D2(a): web unit tests that moved with the shared modules pass; `bun run lint` and `bun run fmt:check` pass; no web behavior change in `just test-e2e` agent-chat specs.
- [ ] APP-079 behaviors still hold: lists open chat; create-on-first-send; permission respond; session-op respond; queue / steer / stop; attachments; slash and `@`.
- [ ] `apps/mobile` still builds for iOS via the existing flow; terminal route untouched.

## Acceptance criteria

1. S1–S9, S12–S13, S15–S18, S20, S22, S24–S26, S32 pass in CI (`bun test`).
2. Structural comparison (S3–S8, S19) has zero unexplained mismatches for F1–F12; every known mismatch is listed and mapped to a deviation (V1–V7) or an accepted limitation.
3. The macOS workflow ran on the PR head, pinned as in the table, and produced downloadable artifacts: screenshots for every fixture in light and dark, and recordings for F4, F12, F13.
4. At most one card is expanded in every F12 screenshot; every other card is a glass title pill in a horizontally scrollable row above the input; tapping swaps cards, re-tapping collapses. The scroll-to-bottom pill is pinned at the left end of that row, appears only when the transcript is not at its end, and shows "N below" when rows are below (S32, S33).
5. Web-vs-phone comparison images exist for F1, F3, F4 (end state), F5, F6, F9, F10, F12 (side by side, same scheme).
6. The PR description lists: deviation register, S27 / S28 status, and every `not_run` scenario with the reason.
7. AruNi has reviewed the artifacts. (Merge needs his explicit approval; nobody else merges.)

## Manual verification steps

1. Download `ios-parity-<run_id>` and `web-parity-<run_id>` from the workflow run.
2. Open `summary.md`; check Xcode, runtime, device versions match the pins.
3. Compare each web / phone pair; play `F4.mp4` and `F12-swap.mp4`.
4. On a real phone on `just dev-mobile-phone` against a live chat, compare one real chat with web (closes APP-079 REV-004).

## Non-coverage

- Real-device performance (FPS, memory) beyond the simulator.
- Android rendering (N4).
- Pixel-identical typography (V7).
- Microphone / dictation in the composer (out of scope, AruNi 2026-10-15); S22 and S23 do not assert it.
- Mermaid diagram rendering (stays a fence unless F1 shows it matters).
- The Linux preview as proof of iOS look (S28 is structure only).
- Live agent behavior; fixtures replay recorded events.

## Coverage Status

Not run. This document is the plan; no implementation exists yet. Append exact commands, results, and remaining gaps here after each slice (`specs/AGENTS.md` §9).
