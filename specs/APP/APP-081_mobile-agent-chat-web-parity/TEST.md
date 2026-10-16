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

| Scenario | Level            | Expected tool                                           | Target command / method                                                                                                                                                              | Fixture / data | Observable signals                                                                                                                                                               | Status  |
| -------- | ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| S1       | Bun unit         | `bun test`                                              | `cd apps/mobile && bun test src/features/agent-chat/user-message`                                                                                                                    | F10            | meta row toggles; collapse threshold equals shared `USER_MESSAGE_COLLAPSE_LINES`; pending echo dim flag                                                                          | pass    |
| S2       | Bun unit         | `bun test`                                              | assistant footer visible only when `shouldShowAssistantTurnEndedChrome` equivalent is true                                                                                           | F3             | copy / usage / worked-for present after settle, absent while streaming                                                                                                           | pass    |
| S3       | Structural       | `bun scripts/agent-chat-parity/compare.ts`              | answer text nodes                                                                                                                                                                    | F1, F2         | same ordered nodes (paragraph, heading, list, table, code, thinking) in web and phone                                                                                            | not_run |
| S4       | Structural       | compare                                                 | session chrome, error, historic permission nodes                                                                                                                                     | F9, F11        | same icon kind, tone, and copy per node                                                                                                                                          | not_run |
| S5       | Bun unit         | `bun test`                                              | shared segmentation: every fixture through `segmentAssistantParts` + `splitSegmentedAssistantParts`                                                                                  | all            | identical segment lists web vs phone import (D2a: same module; D2b: both modules compared)                                                                                       | pass    |
| S6       | Structural       | compare                                                 | tool group header text and counts                                                                                                                                                    | F3, F6         | same overview sentence and diff stats string                                                                                                                                     | not_run |
| S7       | Bun unit         | `bun test`                                              | process fold settle / auto-collapse / inspect rules; expand store keys                                                                                                               | F3, F4         | collapsed after settle unless inspected; state survives list remount                                                                                                             | pass    |
| S8       | Structural       | compare                                                 | tool bodies per kind                                                                                                                                                                 | F5–F8          | each web tool kind has a phone body of the same kind; no sheet opens                                                                                                             | not_run |
| S9       | Bun unit         | `bun test`                                              | motion constants equal web values (D2a: single source; D2b: cross-import test)                                                                                                       | —              | `TREE_DRAW_MS=400`, ease, stagger values equal                                                                                                                                   | not_run |
| S10      | iOS simulator    | `ci-mobile-ios-parity.yml`                              | record F4 replay                                                                                                                                                                     | F4             | recording shows reveal, tree draw-in, chevron, shimmer; reduced-motion run shows none                                                                                            | not_run |
| S11      | iOS simulator    | `ci-mobile-ios-parity.yml`                              | Reduce Motion on (`simctl` accessibility setting / app flag) re-run of F4                                                                                                            | F4             | recording has no animated transitions                                                                                                                                            | not_run |
| S12      | Bun unit         | `bun test`                                              | display buffer: 56 ms commit, flush on end / stop / error / reduced motion                                                                                                           | F4 script      | committed text sequence equals web's for the same event script                                                                                                                   | pass    |
| S13      | Bun unit         | `bun test`                                              | stick/anchor reducer: drag away flips `stickToEnd`; threshold 24; return flips back                                                                                                  | —              | state transitions as specified                                                                                                                                                   | pass    |
| S14      | iOS simulator    | workflow + scripted scroll                              | F13: scroll up while the tail streams                                                                                                                                                | F13            | reading line stays put (frame diff of a marker row); the pinned left pill in the button row shows "N below" and N grows                                                          | not_run |
| S15      | Bun unit         | `bun test`                                              | below-count helper equals web `countMessagesBelowViewport` on shared measurements                                                                                                    | F13            | equal counts                                                                                                                                                                     | not_run |
| S16      | Bun unit         | `bun test`                                              | bottom pad = 40 + (expanded card height + pill row height); row height 0 when the row is not rendered; shrink easing flag                                                            | F12            | pad values                                                                                                                                                                       | pass    |
| S17      | Bun unit         | `bun test`                                              | `card-lane.test.ts` rules 1–8, including toggle-collapse on re-tap                                                                                                                   | F12            | reducer states                                                                                                                                                                   | pass    |
| S18      | Bun unit         | `bun test`                                              | `composer-cards.ts` derives the card set from folded state                                                                                                                           | F12            | descriptors present; pill titles equal the web strings in TECH (title text only; "Message Queue", "Background", "Subagent Tasks", "Research" fallback, permission branch titles) | pass    |
| S19      | Structural       | compare                                                 | permission card content (questions, plan todos, plan-exit intent, option kinds)                                                                                                      | F11, F12       | same controls per request                                                                                                                                                        | not_run |
| S20      | Bun unit         | `bun test`                                              | queue card edit / reorder / remove call the same actions as web                                                                                                                      | F12            | wrapper call args                                                                                                                                                                | not_run |
| S21      | iOS simulator    | workflow                                                | F12: one card expanded, the rest as glass pills in the row above the input; tap swaps; re-tap collapses                                                                              | F12            | screenshots per step                                                                                                                                                             | not_run |
| S22      | Bun unit         | `bun test`                                              | composer capability matrix (attachments, paste, slash, `@`, options, usage trigger, busy actions)                                                                                    | —              | each capability present for an agent that supports it; omitted otherwise                                                                                                         | pass    |
| S23      | iOS simulator    | workflow                                                | composer states: idle, multiline, keyboard open, busy (stop / queue / steer), suggestions                                                                                            | —              | screenshots                                                                                                                                                                      | not_run |
| S24      | Bun unit         | `bun test`                                              | copy parity: mapped `copy.ts` strings equal `apps/web/messages/en.json` values                                                                                                       | —              | zero mismatches                                                                                                                                                                  | pass    |
| S25      | Bun unit         | `bun test`                                              | token map: every mapped phone role exists in light and dark themes                                                                                                                   | —              | no missing role                                                                                                                                                                  | pass    |
| S26      | Bun unit         | `bun test`                                              | no duplicate rule modules remain in `apps/mobile` (D2a)                                                                                                                              | —              | deleted files absent; imports resolve to the package                                                                                                                             | not_run |
| S27      | Cursor agent CLI | `agent` (Cursor CLI) rubric                             | `bun scripts/agent-chat-parity/rubric.ts --fixture F3` etc.                                                                                                                          | F1–F13         | JSON: per-item `pass` / `fail` / `unsure` + evidence; saved as artifact                                                                                                          | partial |
| S28      | Linux preview    | `mobai-dev preview` (RN engine)                         | preview entry renders `preview-chat` with a fixture; semantic tree + screenshot                                                                                                      | F3, F12        | tree contains expected nodes; screenshot saved                                                                                                                                   | ran     |
| S29      | iOS simulator    | `ci-mobile-ios-parity.yml`                              | full fixture matrix, light + dark                                                                                                                                                    | F1–F13         | screenshot artifact per fixture and scheme                                                                                                                                       | pass    |
| S30      | iOS simulator    | `ci-mobile-ios-parity.yml`                              | animation recordings F4, F13, F12 pill swap                                                                                                                                          | F4, F12, F13   | `.mp4` artifacts                                                                                                                                                                 | not_run |
| S31      | Web capture      | Playwright (`scripts/agent-chat-parity/web-capture.ts`) | same fixtures at 390×844, DPR 3, light and dark                                                                                                                                      | F1–F13         | web PNG + web tree JSON artifacts used by S3–S8, S19, S27                                                                                                                        | not_run |
| S32      | Bun unit         | `bun test`                                              | scroll-pill rules: visible iff `messages.length > 0` and not at end (slack 24 px); label "N below" iff N > 0; not part of `LaneState`; row rendered iff any card pill or scroll pill | F12, F13       | booleans and labels match the rule table                                                                                                                                         | pass    |
| S33      | iOS simulator    | workflow + scripted scroll                              | F12 + F13: pill row layout, scroll pill pinned left while card pills scroll, expanded card above the row                                                                             | F12, F13       | screenshots and recording show pinned left pill, scrolling pills, one card                                                                                                       | not_run |

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

1. Prerequisite check: `agent --version` (or `cursor-agent --version`) and `agent status` report an authenticated session. **Do not install the Cursor agent CLI or log it in for this delivery** (AruNi, 2026-10-15: external install needs a separate approval). S27 stays `not_run` with that reason. The structural comparison still gates.
2. Inputs per fixture: `web/<id>-<scheme>.png`, `web/<id>.tree.json`, `phone/<id>-<scheme>.png`, `phone/<id>.tree.json` (phone tree from the simulator accessibility tree or the preview semantic tree).
3. The runner never lets the model edit files: read-only prompt, JSON schema output, no tool permissions.
4. Output is merged with the structural comparer's report; any `fail` the model reports that the structural comparer does not confirm is tagged `model-only`.
5. Same session means the same fixture and same replay script on both sides. For live checks, the same `chat_id` on one Computer is used and recorded in the report.

### S27 result (2026-10-15, parent Linux box)

The parent ran Cursor agent CLI `2026.10.14` (`agent -p --trust --mode ask`, logged in). This session did not install it. Inputs were react-native-web screenshots, not iOS and not Next. Rubric files stayed on that machine (`agent-cli/*.txt`).

- **F3**: pass.
- **F12**: message body 3/11. Card items 8 fail. The preview route at that head only mounted `AgentChatTranscript`, so the permission card and the F12 plan / queue / background / subagents / goal / workflow / context / permission channels were absent. This is the same gap as S28. Do not mark F12 pass. The preview now mounts the pill row, the composer, and one expanded card (a fixture permission is treated as an arrival so it preempts). Other card bodies stay collapsed pills. A new rubric has not been run.
- **F6**: one fail, suspected false positive, pending human confirmation. The model objected to a turn-end "2 files changed" footer. Web has the same `AssistantTurnFileChanges` footer. Do not hide that footer to satisfy the rubric.

## mobai-dev evaluation (Linux preview, S28)

Evaluated on the Grok Bot box (Linux x64, Node v20.19.2, Bun 1.4.2, 8 cores, ~16 GB RAM with ~4 GB available at the time, no Docker). **mobai-dev was not installed or run**, and this delivery must not install it (AruNi, 2026-10-15: external install needs a separate approval). S28 stays `not_run`.

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

### S28 result (2026-10-15, parent Linux box, react-native-web)

Head under test was scratch commit `1a8ed362b` (not pushed). That head is older than the scene-delegate removal. mobai-dev 1.3.5 plus the RN preview engine rendered the real `PreviewChatScreen` (expo-router params mocked) inside the real providers. **These frames are react-native-web, not an iOS render.**

- F1–F13 × light/dark: 26 frames, all rendered, PNG hashes all different.
- Structural compare of those trees against `expected/*.tree.json`: top-level labels hit 241/250. The 9 misses are card channels only (F11 permission; F12 plan, queue, background, subagents, goal, workflow, context, permission).
- `topLoad` / null `instanceHandle` showed up and is an Image `onLoad` drop. The same line appears on later green iOS runs. It is not a blank window.
- The report's black-screen suspicion (`UIApplicationSceneManifest` → `Atmos.SceneDelegate`, class absent after prebuild) was already fixed on later heads and proven by runs `38789917018` and `38797183648`. Parity config now also deletes that key when `EXPO_PUBLIC_PARITY_PREVIEW=1`. No `SceneDelegate` class was added.
- Web same-screen Next screenshots were not produced. `next dev` was OOM-killed three times on a 15.6 GB machine. S31 stays `not_run`.

## GitHub Actions macOS runner (S10, S11, S14, S21, S23, S29, S30, S33)

Workflow: `.github/workflows/ci-mobile-ios-parity.yml`. Triggers: `workflow_dispatch` and `pull_request` limited by `paths` (`apps/mobile/**`, `packages/agent-transcript/**`, `scripts/agent-chat-parity/**`, the workflow itself). **No `ios-parity` label.** A label gate would skip the acceptance run on the implementation PR, and this delivery is not allowed to add labels. Path filters are the cost control.

Version pins (re-checked 2026-10-15 against the runner-images `macos-26-arm64` readme, image still `20260907.0351.1`):

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
3. Build for the simulator with a **bundled JS** configuration (`xcodebuild … -sdk iphonesimulator -configuration Release`) so no Metro is needed. When `EXPO_PUBLIC_PARITY_PREVIEW=1`, `apps/mobile/app.config.js` removes the `expo-dev-client` plugin. CocoaPods reads `expo.autolinking.exclude` from `apps/mobile/package.json`, not from `app.config.js`, so the workflow runs `scripts/agent-chat-parity/exclude-dev-client.js` before prebuild and lists `expo-dev-client`, `expo-dev-launcher`, `expo-dev-menu`, and `expo-dev-menu-interface`. That package.json rewrite stays on the runner. A normal local build keeps the dev client. The workflow fails the pod step if `Podfile.lock` still links those modules. After prebuild it writes `ios/.xcode.env.local` with `export EXPO_PUBLIC_PARITY_PREVIEW=1` (the Xcode bundle phase sources that file before Expo inlines the flag) and fails if `Info.plist` contains `UISceneDelegateClassName`. The build fails if `EXPO_PUBLIC_PARITY_PREVIEW` is still a literal in `main.jsbundle`, or if the bytecode does not contain `[parity] preview-chat route` (Hermes drops that string when the flag is not `"1"` and the route returns null). `app.json` must not declare `UIApplicationSceneManifest`: Expo never generates `Atmos.SceneDelegate`, and the scene window stays black while React Native draws into `AppDelegate`'s window.
4. `xcrun simctl boot <udid>`; `xcrun simctl bootstatus <udid> -b`; `simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`.
5. The parity build's preview route can cycle F1–F13 in light, then dark, and logs `console.error` `[parity] ready <id> <theme> #<seq>`. Cold start mounts that route twice (the initial route and the redirect). Both copies share one clock (`createParityClock`). Separate timers reached the light→dark boundary apart and each `useLayoutEffect` wrote the opposite preference until React threw `Maximum update depth exceeded` (run `38807875046`, head `e60400eb2`). The shared clock on head `4d25dfa03` logged every frame through `F13 dark #25` (run `38816093468`) and did not throw. That run still failed the distinct-PNG check because `simctl io screenshot` blocked for 61s and 54s. A single 90s timeout stopped before F7 (run `38823255381`). A 500ms tick stopped before F2 (run `38831101582`). Repeating the 15s timeout until 90s of wall time kept a 90s cadence through F8 light and then never logged F9 (run `38837550765`, head `1ad359fc4`). The capture script no longer waits on that clock. For each fixture it writes `Documents/parity-frame.json`, relaunches, and waits for `[parity] ready <id> <theme> #0`. The preview reads the file with `File.textSync()` before it logs or arms the clock. A query `?fixture=&theme=` still pins one frame and disables the cycle, for the react-native-web capture. The script screenshots Springboard before the first launch and does not call `simctl openurl`. The `ios-simulator` job timeout stays 120 minutes.
6. Recordings for F4, F12, and F13 are `.mov` files muxed from the light PNG of that fixture (`mp4-duration.py --write-mjpeg`, 8s). They are still frames. They do not play the in-app reveal, tree draw-in, or pill swap, so S10 and S30 stay `not_run`. The script fails if the Springboard shot is the known black scene hash, if the F1 light shot is that hash or the pair-screen hash, or if F1-light and F12-light match. It also fails when one launch logs a ready line for a different fixture.
7. Reduce Motion run (S11): same deep link with `motion=reduced`, which sets the app's reduced-motion override; additionally record once with the system setting where the runner allows it.
8. `actions/upload-artifact` with `if: always()`, `retention-days: 14`, one artifact `ios-parity-<run_id>` containing screenshots, recordings, the fixture index, device/Xcode/runtime versions (`xcodebuild -version`, `xcrun simctl list runtimes`), and a `summary.md`. The job summary links the artifact so AruNi can download it from the run page.
9. The ubuntu `structural` job also exports the parity preview with `expo export --platform web` and screenshots pinned `?fixture=&theme=` URLs in headless Chrome (`scripts/agent-chat-parity/rn-web-capture.ts`). Those PNGs are **react-native-web**, not iOS and not Next.js. They are uploaded as `parity-rn-web`. S31 stays `not_run` because it asks for the Next web app. `next dev` was OOM-killed on a 15.6 GB machine and is not run on `ubuntu-latest`.

Known risks: first Pod/Xcode build is slow (budget 20–30 min uncached); simulator boot flakiness (retry once, then fail with logs); `simctl recordVideo` on iOS 26 can store a movie header longer than the samples and omit the audio track, so the capture script does not use it. The preview route must be inert in production builds (TECH D8, Security).

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
5. Phone screenshots exist for every fixture in light and dark. Web PNGs exist for F1, F3, F4 (end state), F5, F6, F9, F10, F12 only when S31 actually runs. If the out-of-tree harness cannot import the web components without a new web route, S31 is `not_run` and the artifact is the phone PNG plus the structural tree JSON, labeled as such. Do not add an `apps/web` route to force S31.
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

Recorded 2026-10-15. Commands below ran on Linux unless a GitHub run id is named. Simulator scenarios stay `not_run` until a green job's artifacts are reviewed.

### Commands

- `cd apps/mobile && bun test` → pass, exit 0. bun test v1.3.14: 351 pass, 0 fail, 1279 expect() calls, 88 files. Includes `ios-launch-scene.test.js`, `parity-cycle.test.ts` (`parseParityDiskFrame`), and `parity-composer-cards.test.ts`.
- The same suite includes the scenario files re-run as `cd apps/mobile && bun test src/features/agent-chat/user-message.test.ts src/features/agent-chat/assistant-footer.test.ts src/features/agent-chat/assistant-process.test.ts src/features/agent-chat/process-fold.test.ts src/features/agent-chat/expand-store.test.ts src/features/agent-chat/commit-buffer-wire.test.ts src/features/agent-chat/stick.test.ts src/features/agent-chat/transcript-pad.test.ts src/features/agent-chat/card-lane.test.ts src/features/agent-chat/composer-cards.test.ts src/features/agent-chat/composer-capabilities.test.ts src/features/agent-chat/copy-parity.test.ts src/features/agent-chat/token-map.test.ts src/features/agent-chat/actions.test.ts` → pass, exit 0. 70 pass, 0 fail, 14 files.
- `bun scripts/agent-chat-parity/compare.ts` → pass, exit 0. Output: `13 fixtures match`.
- `bun scripts/agent-chat-parity/export-trees.ts` → pass, exit 0. Wrote 13 `artifacts/structural/F1.tree.json`–`F13.tree.json` files. `artifacts/` is gitignored. The trees were not committed.
- `bun --filter @atmos/agent-transcript test` → pass, exit 0. 31 pass, 0 fail, 5 files (`folded-part`, `parity-tree`, `assistant-turn-chrome`, `classify`, `message-text`). No test in that package calls `countMessagesBelowViewport`.
- `bash -n scripts/agent-chat-parity/ios-capture.sh` → pass, exit 0. The capture script was not executed. This machine has no iOS simulator.
- `python3 scripts/agent-chat-parity/mp4-duration.py --self-test` → pass, exit 0. The same parser printed `1.270` for run `38780693297` `F4.mp4`. `--write-mjpeg` of two complete JPEGs decoded with ffmpeg as an 8.000s mjpeg track (`/tmp/mjpeg-test2.mov`). ffmpeg logged `EOI missing, emulating` and still decoded both frames.
- `CI=1 bunx expo prebuild -p ios --no-install` in `apps/mobile` → generated `ios/Atmos/Info.plist` has no `UISceneDelegateClassName` and no `SceneDelegate` source file. `AppDelegate.swift` calls `startReactNative` on its own `UIWindow`. `bunx expo config --type public` reports no `UIApplicationSceneManifest`.
- Headless Chrome on the react-native-web export (`EXPO_PUBLIC_PARITY_PREVIEW=1`, `/preview-chat?fixture=F1&theme=light`) rendered the F1 transcript (user bubble, “Release notes”, table, code, mermaid). Console logged `[parity] preview-chat module` and `[parity] preview-chat route`. No page exception. This is not an iOS screenshot.

### pass

Marked only where the test file exists and the command above ran it.

- **S1** — `apps/mobile/src/features/agent-chat/user-message.test.ts`. Collapse uses shared `USER_MESSAGE_COLLAPSE_LINES` (3).
- **S2** — `apps/mobile/src/features/agent-chat/assistant-footer.test.ts`. Footer chrome stays hidden until the turn completes with text, usage, or work.
- **S5** — `bun scripts/agent-chat-parity/compare.ts` matched all 13 fixtures. `assistant-process.test.ts` and `process-fold.test.ts` also call `segmentAssistantParts` and passed inside `bun test`.
- **S7** — `expand-store.test.ts` (expand keys, remount) and `process-fold.test.ts` (settle / auto-collapse).
- **S12** — `commit-buffer-wire.test.ts`. 56 ms commit, flush on turn end, stop, and error.
- **S13** — `stick.test.ts` `reduceStick` cases. Slack is 24 px.
- **S16** — `transcript-pad.test.ts`. Pad is 40 plus expanded card height plus pill row height.
- **S17** — `card-lane.test.ts`, including re-tap collapse.
- **S18** — `composer-cards.test.ts` card titles, including "Message Queue" and "Research".
- **S22** — `composer-capabilities.test.ts`.
- **S24** — `copy-parity.test.ts`.
- **S25** — `token-map.test.ts`. Every mapped phone role exists on light and dark.
- **S32** — `stick.test.ts` "scroll pill rules". The pill and row cases in that file passed.
- **S29** — run `38789917018` (head `75cbb201e`) `ios-simulator` succeeded. 26 PNGs, all different hashes, none equal to the black scene `fbcb6a8c2222…`. F1-light is the release-notes transcript (`dae7bb5e…`). F12-light is "Continue" / "Done." (`b560aee6…`). Status bar time is 9:41. Those shots are iOS Simulator frames from before the in-app carousel and the preview card lane. They do not show pills or an expanded card. Run `38849287823` (head `37e873ad3`) is a later iOS Simulator matrix on the card-lane preview: 26 PNGs, all different, none flat, none equal to the black or pair hashes. `default-route.png` equals `F1-light` (`b0b84429…`) and shows "Release notes". `F11-dark` (`68d2ab6f…`) shows "Questions for you" / "Apply the edit?" / Allow and Deny. `F12-light` (`a4b2a19c…`) shows the same card for "Edit src/lib.ts" and the 15% context trigger. Title pills are not in those iOS frames. The react-native-web F12 from that run's `parity-rn-web` artifact shows "Questions for you", "Plan", and "Message Queue" between the card and the composer. Those web-export frames are react-native-web, not iOS. Runs `38807875046`, `38816093468`, `38823255381`, `38831101582`, and `38837550765` are not part of this pass. See `not_run`.

### advisory

- **S28** — ran on the parent Linux box against scratch head `1a8ed362b`. react-native-web, not iOS. 26 frames, hashes all different. Label hit rate 241/250. The 9 misses are card channels. Not a substitute for S29.
- **S27** — partial, same box, same react-native-web shots. F3 pass. F12 message body 3/11 and 8 card items fail. F6 fail is a suspected false positive (turn-end "2 files changed" footer; web has `AssistantTurnFileChanges`) and needs a human confirmation. Do not mark F12 pass.

### not_run

- **S3, S4, S6, S8, S19** — `compare.ts` exited 0 against the committed expected trees. These scenarios still ask for web and phone trees. S31 did not produce web PNGs, so they stay `not_run`.
- **S9** — no test asserts the motion constants (`TREE_DRAW_MS` and the shared ease / stagger values). `process-fold.test.ts` asserts tree path geometry, not those timings.
- **S10, S30** — `F4.mov`, `F12.mov`, and `F13.mov` from run `38789917018` are 8.000s mjpeg, 1206×2622, and each file's frames are identical. They show the fixture staying on screen. They do not show reveal, tree draw-in, shimmer, or a pill swap.
- **S11, S14, S21, S23, S33** — `not_run`. Not driven by the capture script.
- Cold start on `38789917018` painted "Pair this phone with your Computer." (`default-route.png` `51cd7923…`) even though the preview route function ran. Run `38797183648` (head `af9bc6ba8`) redirects `/` to `/preview-chat`. Its `default-route.png` hash equals `F3-light` (`14bbae46…`) and shows fixture F3 ("Check src/main.ts", "The file is ready.") before any deep link. F1-light and F12-light hashes are unchanged from the previous green run. The carousel that follows starts at F1 light and does not use `openurl`. That path is not in those two artifacts.
- **S15** — not covered by `packages/agent-transcript` tests. `stick.test.ts` only checks that `AgentChatTranscript.tsx` contains the name `countMessagesBelowViewport`.
- **S20** — not tested as queue edit / reorder / remove wrapper calls. `actions.test.ts` lists action name constants. `composer-cards.test.ts` covers `moveQueueItem`, not those action calls.
- **S26** — no test asserts that a duplicate assistant-process module is gone. `assistant-process.test.ts` covers shared fold behavior.
- **S31** — not_run. Next.js web screenshots were not produced (`next dev` OOM). Run `38807875046` uploaded `parity-rn-web` (26 distinct PNGs). Those frames are react-native-web, not iOS and not Next, and do not close S31.
- **Carousel iOS path** — not pass. Run `38843429024` (head `8887761c4`) `structural` and `ios-simulator` both succeeded. 26 PNGs had different hashes, `default-route.png` equals `F1-light` (`46440730…`), and every launch logged one `[parity] ready <id> <theme> #0` plus `[parity] disk <id> <theme>`. That hash gate missed two empty frames: `F1-light` is 97% the preview background `#f4f4f6` (status bar only) and `F11-dark` is 99% black. `F1-dark` shows the release notes, and `F12-light` shows the expanded permission card ("Questions for you", "Allow the edit?", "Edit src/lib.ts", "Allow"). The follow-up screenshots again when `png-flat.py` says the frame is at least 95% one color. Run `38849287823` (head `37e873ad3`) is that retry. `structural` passed, including `png-flat.py --self-test`, and uploaded [parity-rn-web](https://github.com/AruNi-01/atmos/actions/runs/38849287823/artifacts/12024279302) (react-native-web, not iOS, not Next). `ios-simulator` passed. [ios-parity](https://github.com/AruNi-01/atmos/actions/runs/38849287823/artifacts/12027645661) has 26 fixture PNGs. `png-flat.py` exits 1 on every one (F1-light dominant fraction 0.584, F11-dark 0.627). Hashes are all different. `default-route.png` equals `F1-light` (`b0b84429…`) and shows the release notes, the table, the TypeScript block, and the mermaid fence. `F11-dark` (`68d2ab6f…`) shows the expanded permission card. Springboard (`5943537c…`) is not the black scene. Every launch logged one `[parity] ready <id> <theme> #0`. No `Maximum update depth`. The iOS frames do not show the title pill row. The same component on that run's react-native-web F12 does. A horizontal `ScrollView` on iOS lays out at height 0 unless the style sets one. That height is not in the `38849287823` artifact. Run `38807875046` (head `e60400eb2`) `structural` succeeded, including `parity-rn-web`. `ios-simulator` capture wrote every `F*-light.png` and `F1-dark.png`, then exited 1. `parity-stream.log` shows each light ready line twice (~30–100 ms apart) and `[parity] preview-chat route` twice at boot, so two preview screens stayed mounted. `ready F1 dark #13` was logged once at 21:54:06. At 21:54:14 the route rendered again and React threw `Maximum update depth exceeded` at `UserMessage`. No `F2-dark` onward and no `.mov`. Run `38816093468` (head `4d25dfa03`) is the shared-clock follow-up. `structural` succeeded. The device log contains every ready line through `F13 dark #25` and no `Maximum update depth`. `default-route.png` equals `F1-light` (`210adf69…`), not the pair screen or the black hash. Capture then exited 1 because the PNGs were not all distinct: `simctl io screenshot` blocked for 61s (F5 light) and 54s (F12 light) while the 15s hold had already advanced. Shared hashes: `623387db3458` is `F1-dark` and `F13-light` (the file named F13-light is the dark "Explain the change" frame); `2b4359f5471d` is `F2-light` and `F3-light`; `f0a964492fc9` is `F3-dark` and `F4-dark`; `4a3c1b585c7e` is `F6-light`, `F7-light`, and `F8-light`. Run `38823255381` (head `afd34968d`) logged ready lines 90s apart through `F6 light #5`, then `F7 light #6` never arrived. Run `38831101582` (head `993d9c2b8`) logged `F1 light #0` and never logged `F2 light #1`. Run `38837550765` (head `1ad359fc4`) `structural` succeeded. Ready lines ran `F1 light #0` through `F8 light #7` on a 90.0s cadence, then `F9 light #8` was missing. The expected F9 timestamp was inside the 120s wait. No JS exception. The follow-up relaunches once per fixture with `Documents/parity-frame.json`. That pin is not in the `38837550765` artifact.
- **图一 pixel metrics** — image missing, pill height 36 provisional.
