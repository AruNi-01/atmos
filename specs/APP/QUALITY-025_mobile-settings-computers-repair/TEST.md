# TEST · QUALITY-025: Mobile Settings Computers and Re-pair

> Test Plan · how we verify the Settings computer count, the computers list, the Re-pair camera sheet, and the removal of the Developer Test page. References TECH QUALITY-025.

## Test strategy

The behaviors are mobile view-model decisions and a few React trees. Bun tests cover the formatters, the selection dismiss rule, the camera state machine, and rendered fallback panels. A source scan locks the deleted Test page and the missing chevron. There is no Playwright project for the Expo app. iOS light/dark screenshots need a simulator and a camera permission reset, so they stay manual.

- Unit: `bun --filter @atmos/mobile test` on the new `*.test.ts` files under `apps/mobile/src/features/settings` and `apps/mobile/src/features/onboarding`.
- Component: `react-dom/server` `renderToStaticMarkup` with a `react-native` mock, same harness as `glass-text-button.test.ts`.
- Lint cap: root `package.json` `lint` stays `oxlint --max-warnings=455`.
- Exploratory agent-browser: omitted. The mobile sheet is not a web page. `agent-browser` cannot drive the iOS form sheet.
- Manual: iOS simulator screenshots. This environment has no booted simulator for acceptance shots.

## Coverage map

| Requirement                                              | Scenario IDs |
| -------------------------------------------------------- | ------------ |
| M1. Meta is `online/total`                               | S1           |
| M1. Online digit uses `onlineStatusColor`                | S2           |
| M1. Accessibility label keeps "online"                   | S1           |
| M1. Empty list stays "None"                              | S1           |
| M2. Row has a check and no arrow                         | S3           |
| M2. Selection dismisses the sheet after it commits       | S4           |
| M3. Undetermined permission asks once                    | S5           |
| M3. Denied with `canAskAgain` false opens Settings       | S5, S6       |
| M3. Loading, denied, and error are visible and not black | S6           |
| M3. Light pair dock is glass unless the preview is live  | S10          |
| M3. Render throw shows the fallback                      | S6           |
| M4. Test page, route, fixtures, and store are gone       | S7           |
| M4. Parity `preview-chat` stays                          | S7           |
| Lint cap stays 455                                       | S8           |

## Execution map

| Scenario | Level         | Expected tool | Target command / method                                                                   | Fixture / data                               | Signals                                                                       | Status  |
| -------- | ------------- | ------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- | ------- |
| S1       | Bun unit      | `bun test`    | `bun --filter @atmos/mobile test src/features/settings/computer-settings.test.ts`         | online/total pairs                           | `1/2` fields, `1 of 2 online`, empty `None`                                   | pass    |
| S2       | Bun component | `bun test`    | `bun --filter @atmos/mobile test src/features/settings/computer-online-count.test.ts`     | mocked theme `green`                         | online digit color equals `onlineStatusColor`                                 | pass    |
| S3       | Bun unit      | `bun test`    | `computer-settings.test.ts` plus a read of `ComputerPicker.tsx`                           | source text                                  | no `ChevronRightIcon`, no `onManage`                                          | pass    |
| S4       | Bun unit      | `bun test`    | `runComputerSelection` in `computer-settings.test.ts`                                     | online and offline fakes                     | offline dismisses immediately; online dismisses only from `onSuccess`         | pass    |
| S5       | Bun unit      | `bun test`    | `bun --filter @atmos/mobile test src/features/onboarding/camera-permission-state.test.ts` | permission snapshots                         | `prompt`+`autoRequest`, `settings`, `starting`, `error`                       | pass    |
| S6       | Bun component | `bun test`    | `bun --filter @atmos/mobile test src/features/onboarding/camera-permission-view.test.ts`  | loading, settings, error models              | visible copy; background is `sheetBackground`, not `#000000` or `#0a0a0b`     | pass    |
| S7       | Bun unit      | `bun test`    | `bun --filter @atmos/mobile test src/features/settings/test-page-removed.test.ts`         | repo files                                   | deleted paths absent; `preview-chat.tsx` present; Settings has no "Test page" | pass    |
| S8       | Review        | `rg`          | root `package.json` script `lint`                                                         | repo                                         | value is `oxlint --max-warnings=455`                                          | pass    |
| S9       | Manual        | iOS Simulator | steps below                                                                               | booted simulator, bundle `land.atmos.mobile` | light/dark shots of the row, the list, and Re-pair permission states          | planned |
| S10      | Bun unit      | `bun test`    | `bun --filter @atmos/mobile test src/features/onboarding/pair-dock-chrome.test.ts`        | scanner kind, theme, scanner open            | glass only for light + open + not `preview`; dark and closed stay inverted    | pass    |

## Scenarios

### S1 — Online count is a ratio

- **Level**: Unit
- **Given**: 1 online of 2 computers, 2 online of 2, 0 online of 2, and 0 computers.
- **When**: `formatComputerOnlineCount` runs.
- **Then**: the ratio cases expose `online` and `total` for the `1/2` and `2/2` text, and accessibility labels `1 of 2 online`, `2 of 2 online`, and `0 of 2 online`. Zero computers is `None` / `No computers`.
- **Signals**: returned fields.

### S2 — Online digit reuses the Online status color

- **Level**: Component
- **Given**: a theme whose `green` is the Online status token.
- **When**: `ComputerOnlineCount` renders `1/2`.
- **Then**: the online digit's color equals `onlineStatusColor(theme.colors)`, and the total digit does not.
- **Signals**: rendered color attribute and accessibility label `1 of 2 online`.

### S3 — Computer rows do not drill in

- **Level**: Unit
- **Given**: `ComputerPicker.tsx` and `SettingsComputersScreen.tsx`.
- **When**: the sources are read.
- **Then**: neither file mentions `ChevronRightIcon`, `onManage`, or `/settings/computer`. A selected row still has a check.
- **Signals**: source text.

### S4 — Selecting a computer closes the sheet

- **Level**: Unit
- **Given**: `runComputerSelection` with fake select, switch, and dismiss functions.
- **When**: an offline computer is chosen, then an online computer is chosen.
- **Then**: offline calls select and dismiss immediately, and does not call switch. Online calls switch with dismiss as the success callback and does not dismiss before that callback runs.
- **Signals**: call order.

### S5 — Permission model

- **Level**: Unit
- **Given**: `cameraScannerModel`.
- **When**: permission is null, undetermined, denied with `canAskAgain`, denied without `canAskAgain`, granted but not ready, granted and timed out, and granted plus `onMountError`.
- **Then**: the kinds are `loading`, `prompt` with `autoRequest`, `prompt` without `autoRequest`, `settings`, `starting`, `error`, `error`.
- **Signals**: model kind and message.

### S6 — Permission views are not a black sheet

- **Level**: Component
- **Given**: loading, settings, and error models, and a child that throws inside `PairScannerErrorBoundary`.
- **When**: each tree renders.
- **Then**: loading shows "Checking camera", settings shows "Open Settings", error shows the message. Each panel background is the sheet token. None of the markup uses `#000000` or `#0a0a0b`.
- **Signals**: text and background attribute.

### S7 — Test page is gone

- **Level**: Unit
- **Given**: the mobile tree after the deletion.
- **When**: the fixture paths and Settings source are read.
- **Then**: `app/preview.tsx`, `PreviewModeSwitch.tsx`, `PreviewTerminalScreen.tsx`, `preview-fixtures.ts`, and `preview-store.ts` are absent. Settings source has neither "Test page" nor "Preview terminals without a Computer". `app/preview-chat.tsx` is still present.
- **Signals**: filesystem and source text.

### S8 — Lint cap

- **Level**: Review
- **Given**: root `package.json`.
- **When**: the `lint` script is read.
- **Then**: it is `oxlint --max-warnings=455`.
- **Signals**: script string.

### S9 — Simulator screenshots

- **Level**: Manual
- **Given**: a booted iOS simulator and a dev-client build of `apps/mobile`.
- **When**: the maintainer captures light and dark frames of the Settings row, the My Computers list, and Re-pair in the not-yet-determined permission state.
- **Then**: the row reads `online/total` with a green online digit, rows have a check and no arrow, and Re-pair shows copy rather than a black sheet. The system permission alert is visible when the camera permission is reset.
- **Signals**: screenshots kept outside the git repo.

### S10 — Pair dock follows the theme until the camera is live

- **Level**: Unit
- **Given**: `pairScannerDockUsesThemeGlass` and the pair screen source.
- **When**: the scanner is open in light theme with kind `loading`, `prompt`, `settings`, `starting`, `error`, or no kind yet, then with `preview`. The same kinds are checked in dark theme and with the scanner closed.
- **Then**: light non-preview states use the theme glass dock. `preview`, dark theme, and a closed scanner keep the inverted dock. The glass branch is `GlassPanel` with `glassFallbackStrong`, `glassTint`, `glassBorder`, `secondaryLabel`, `label`, `cardSubtle`, `ctaFill`, and `ctaLabel`, and that branch has no hex color.
- **Signals**: boolean result and source text.

## Regression checklist

- Relay row and theme control on Settings still render.
- `/preview-chat` parity capture still mounts.
- An offline computer is still stored as the selection before the sheet closes.
- A failed online switch does not close the sheet.

## Acceptance criteria

- [x] S1–S7 pass under `bun --filter @atmos/mobile test`.
- [x] S10 passes under `bun --filter @atmos/mobile test`.
- [x] `bun --filter @atmos/mobile typecheck` exits 0.
- [x] oxlint on the touched files does not raise the repo warning cap above 455.
- [x] S9 is recorded as manual. Shots are not committed.

## Manual verification steps

Bundle id: `land.atmos.mobile` (`apps/mobile/app.json` `expo.ios.bundleIdentifier`).

From the repo root, with Xcode and a simulator installed:

```bash
just mobile-ios
```

That runs `apps/mobile` `bun run ios`, which builds the dev client and opens the simulator. Equivalent: `cd apps/mobile && bun run ios`.

Sign in or pair once so Settings is available. On the Workspace screen, use the header Settings button (`accessibilityLabel` "Settings").

Appearance:

```bash
xcrun simctl ui booted appearance light
xcrun simctl ui booted appearance dark
```

Capture, outside the repo (do not `git add` the PNGs):

1. Settings, Computer section, My Computers row (`1/2` or `2/2`).
2. My Computers list: selected row has a check, other rows have no chevron. Tap a computer and confirm the sheet returns to Workspace.
3. Settings → Re-pair phone.

Reset the camera permission before the Re-pair shot so the system prompt can appear again:

```bash
xcrun simctl privacy booted reset camera land.atmos.mobile
```

Then force-quit Atmos and open Re-pair phone again. The sheet shows copy ("Checking camera" or the allow / Settings guidance) and the system dialog when the status is not determined. Deny once to confirm the guidance and the Open Settings button. Repeat the three shots in dark appearance.

In light appearance, the How to pair panel and Hide scanner match the sheet while permission is pending, denied, or the preview has not started. That panel turns dark only after the camera preview is live. Dark appearance keeps the elevated dock the whole time.

## Non-coverage

- No automated tap on a real `CameraView`. The simulator has no reliable video device; TECH treats a missing `onCameraReady` as an error view, covered by S5.
- No Playwright journey.
- Agent-browser is not run. The mobile UI is not served as a web document in this change.

## Coverage Status

Run on 2026-10-21 in this workspace.

- S1, S3, S4, S7: `bun --filter @atmos/mobile test` on `computer-settings.test.ts` and `test-page-removed.test.ts`. Pass. S7 also checks the lint script string for S8.
- S2: `computer-online-count.test.ts`. Pass, including when the file runs after `glass-text-button.test.ts`.
- S5: `camera-permission-state.test.ts`. Pass.
- S6: `camera-permission-view.test.ts`. Pass. `renderToStaticMarkup` does not recover a thrown child, so the boundary case calls `getDerivedStateFromError` and `render`, then checks the markup.
- Full mobile suite: `bun --filter @atmos/mobile test` — 584 pass, 0 fail.
- `bun --filter @atmos/mobile typecheck` exits 0. Two pre-existing diagnostics in `glass-text-button.test.ts` and `open-thread-resync.test.ts` were cleared in this change so the command can exit 0: a `react-dom/server` type comment, and `publish` callbacks that returned the `push` length.
- `bun lint` (`oxlint --max-warnings=455`) exits 0. That run reported 434 warnings, under the unchanged cap.
- S9 stays planned. This environment has no booted iOS simulator, so the screenshots were not taken and are not in git.
- Review follow-up: a second camera attempt can arm the preview timer again; returning to the app re-reads camera permission; a new account does not keep the previous Computer session unless that Computer is still listed; a stale computer switch is ignored; the sign-in crash fallback no longer says Re-pair. Covered by `shouldArmCameraPreviewTimer`, `retainedServerIdAfterAuthMiss`, and `shouldApplyComputerSwitch`.
- 2026-10-21 dock follow-up: S10 `pair-dock-chrome.test.ts` pass (light non-preview kinds use glass; `preview`, dark theme, and a closed scanner stay inverted; the glass branch names theme tokens and no hex). Full mobile suite: `bun --filter @atmos/mobile test` — 593 pass, 0 fail. `bun --filter @atmos/mobile typecheck` exits 0. `bun lint` (`oxlint --max-warnings=455`) exits 0 with 434 warnings. S9 stays planned.
