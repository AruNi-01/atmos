# TEST · QUALITY-011: Mobile iOS 27 UIScene lifecycle

> Test Plan · how we verify the iOS 27 cold start and that deep links still reach `RCTLinkingManager`. References TECH QUALITY-011.

## Test strategy

The crash is inside UIKit on a simulator this Linux environment cannot boot. CI and local Linux prove the prebuild shape and the Swift rewrite. A Mac with the iOS 27.0 and iOS 26.5 runtimes proves launch and the native log line. There is no web UI and no Playwright surface.

- Unit: `bun test` on the pure plugin rewrite and the plist dictionary. No prebuild, no simulator.
- Structural: `expo prebuild --platform ios --no-install`, then `apps/mobile/script/verify-ios-scene-lifecycle.sh structural`. The parity workflow runs the same script on the generated project and `built-plist` on the built app.
- Manual simulator: `verify-ios-scene-lifecycle.sh simulator` on a Mac. Not run in this change.
- Exploratory agent-browser: omitted. The app under test is a native iOS binary, not a browser page.

## Coverage map

| Requirement                                                                                                 | Scenario IDs |
| ----------------------------------------------------------------------------------------------------------- | ------------ |
| M1. iOS 27.0 Release cold start does not hit `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` | S1, S2, S6   |
| M2. iOS 26.5 Release cold start still launches                                                              | S3, S6       |
| M3. Cold-start custom URL reaches `RCTLinkingManager`                                                       | S4, S6       |
| M4. Warm `openURL` reaches `RCTLinkingManager`                                                              | S4, S6       |
| M5. Browsing-web user activity is forwarded even though no associated domain is configured                  | S5           |
| M6. Parity preview must not strip the scene class                                                           | S3, S7       |

## Execution map

| Scenario | Level      | Expected tool                             | Target command / method                                                                                                         | Fixture / data                                                   | Signals                                                                                                                  | Status  |
| -------- | ---------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| S1       | Unit       | `bun test`                                | `cd apps/mobile && bun test plugins/with-ios-scene-lifecycle.test.js ios-launch-scene.test.js app.config.test.js`               | Expo SDK 56 AppDelegate fixture in the test                      | `class SceneDelegate`; no `UIWindow(frame:`; launch-option key strings; `openURLContexts`                                | planned |
| S2       | Structural | shell                                     | `cd apps/mobile && CI=1 bunx expo prebuild --platform ios --no-install && bash script/verify-ios-scene-lifecycle.sh structural` | clean prebuild                                                   | source plist class is `$(PRODUCT_MODULE_NAME).SceneDelegate`; Swift checks from S1 hold on `ios/Atmos/AppDelegate.swift` | planned |
| S3       | CI build   | GitHub Actions                            | `.github/workflows/ci-mobile-ios-parity.yml` `ios-simulator` job                                                                | `EXPO_PUBLIC_PARITY_PREVIEW=1`, iPhone 17 Pro, iOS 26.5, Release | job green; built plist class is `Atmos.SceneDelegate`; parity PNGs are not the black scene                               | planned |
| S4       | Manual     | `verify-ios-scene-lifecycle.sh simulator` | see Manual verification steps                                                                                                   | iPhone 18 Pro, iOS 27.0, Release                                 | cold and warm logs contain `AtmosSceneLifecycle delivered URL to RCTLinkingManager`; no runtime-issue log                | planned |
| S5       | Unit       | `bun test`                                | same file as S1                                                                                                                 | fixture                                                          | `userActivities`, `NSUserActivityTypeBrowsingWeb`, both user-activity launch-option keys                                 | planned |
| S6       | Manual     | same script, both runtimes                | see Manual verification steps                                                                                                   | iOS 27.0 and iOS 26.5 Release                                    | `simctl launch` exit 0; no `EXC_BREAKPOINT` / runtime-issue line                                                         | planned |
| S7       | Unit       | `bun test`                                | `app.config.test.js`                                                                                                            | `EXPO_PUBLIC_PARITY_PREVIEW=1`                                   | parity config keeps `UIApplicationSceneManifest`                                                                         | planned |

## Scenarios

### S1 — Prebuild rewrite removes the app-delegate window

- **Level**: Unit
- **Given**: the Swift `AppDelegate` Expo SDK 56 emits, including `HomeTabBarClearGlass.install()` and the `UIWindow(frame: UIScreen.main.bounds)` block.
- **When**: `ensureSceneLifecycle` runs once, then again.
- **Then**: `didFinishLaunchingWithOptions` no longer calls `startReactNative` or constructs `UIWindow(frame:)`. `class SceneDelegate` calls `startReactNative` with a `UIWindow(windowScene:)`. The second call returns the same string. A source that still contains both the marker and `UIWindow(frame:` throws.
- **Signals**: assertions in `plugins/with-ios-scene-lifecycle.test.js`.

### S2 — Generated Info.plist names a class the Swift file defines

- **Level**: Structural
- **Given**: a clean `expo prebuild --platform ios --no-install`.
- **When**: `verify-ios-scene-lifecycle.sh structural` runs.
- **Then**: `ios/Atmos/Info.plist` has one application scene role, `UIApplicationSupportsMultipleScenes` false, and `UISceneDelegateClassName` equal to `$(PRODUCT_MODULE_NAME).SceneDelegate`. `ios/Atmos/AppDelegate.swift` defines `class SceneDelegate` and does not use `@objc(SceneDelegate)`.
- **Signals**: script exit 0. Exit non-zero if the class or the plist key is missing.

### S3 — iOS 26.5 parity build still uses the scene class

- **Level**: CI build (GitHub-hosted macOS)
- **Given**: the parity workflow with `EXPO_PUBLIC_PARITY_PREVIEW=1`.
- **When**: the `ios-simulator` job prebuilds, builds Release, and checks the built plist.
- **Then**: `verify-ios-scene-lifecycle.sh built-plist` reads `Atmos.SceneDelegate`. The job does not fail for the presence of a scene delegate. Existing parity screenshot gates still reject a black window.
- **Signals**: workflow job conclusion success. This Linux session does not download those artifacts until the job exists.

### S4 — Cold and warm custom URLs reach RCTLinkingManager

- **Level**: Unit for the source shape; manual for the running process
- **Given**: a Release install on the iOS 27.0 simulator.
- **When**: the app is terminated and `xcrun simctl openurl` opens `atmos://scene-lifecycle-probe`, then opened again while the process is up with `atmos://scene-lifecycle-probe-warm`.
- **Then**: the simulator log contains `AtmosSceneLifecycle delivered URL to RCTLinkingManager` at least twice. The source path that prints that line calls `RCTLinkingManager.application` unless `RCTOpenURLNotification` was already posted for that URL. Launch options include `UIApplicationLaunchOptionsURLKey` for the cold URL. The `NSLog` format string does not interpolate the URL.
- **Signals**: unit assertions on the Swift strings; simulator log lines from the script. UIKit may still write the URL into the system log.

### S5 — Browsing-web user activities are wired

- **Level**: Unit
- **Given**: the rewritten AppDelegate.
- **When**: the test scans the scene delegate.
- **Then**: `willConnectTo` walks `connectionOptions.userActivities`, `scene(_:continue:)` exists, and launch options include `UIApplicationLaunchOptionsUserActivityDictionaryKey`, `UIApplicationLaunchOptionsUserActivityTypeKey`, and `UIApplicationLaunchOptionsUserActivityKey` gated on `NSUserActivityTypeBrowsingWeb`.
- **Signals**: those substrings in the unit test. No simulator universal link: `app.json` has no associated domain.

### S6 — Cold start does not hit the UIKit runtime issue

- **Level**: Manual
- **Given**: Release builds installed on iOS 27.0 (iPhone 18 Pro) and iOS 26.5.
- **When**: `xcrun simctl launch` starts `land.atmos.mobile` with no URL.
- **Then**: launch exits 0. A `log show` of the last few minutes does not contain `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` or `EXC_BREAKPOINT` for that launch.
- **Signals**: script sections `cold-start`. Not run until a Mac executes them.

### S7 — Parity config keeps the manifest

- **Level**: Unit
- **Given**: a config whose `ios.infoPlist` already has `UIApplicationSceneManifest`, and `EXPO_PUBLIC_PARITY_PREVIEW=1`.
- **When**: `applyParityPreviewConfig` runs.
- **Then**: the manifest is still present and `expo-dev-client` is still removed.
- **Signals**: `app.config.test.js`.

## Performance & load budgets

None. Scene connection replaces the old window allocation. No extra JavaScript work.

## Regression checklist

- [ ] `HomeTabBarClearGlass.install()` still runs inside `didFinishLaunchingWithOptions`.
- [ ] Parity preview still excludes `expo-dev-client` / `expo-dev-launcher` / `expo-dev-menu` / `expo-dev-menu-interface`.
- [ ] Generated URL schemes `atmos`, `land.atmos.mobile`, and `exp+atmos-mobile` are unchanged.
- [ ] The scene delegate does not log the URL or the user-activity webpage.
- [ ] `apps/mobile/ios` stays gitignored.

## Acceptance criteria

- [x] S1, S2, S5, and S7 pass on the implementation commit.
- [x] `verify-ios-scene-lifecycle.sh structural` exits 0 after prebuild.
- [x] CI `oxlint` and `oxfmt` jobs are green, and the mobile `bun test` job is green.
- [x] The parity workflow no longer fails because a scene delegate exists. It fails when the class or the built plist name is wrong. Run [39206606309](https://github.com/AruNi-01/atmos/actions/runs/39206606309) on `01075c6024a9f4a05d4b641991034ffcf1bf3188` concluded success.
- [ ] S4 and S6 stay `not_run`. This session did not run `verify-ios-scene-lifecycle.sh simulator`. S3 is the GitHub iOS 26.5 parity job, not that script.
- [x] No `EVIDENCE_PUSH` and no push to `agent-artifacts`.

## Manual verification steps

Run on the MacBook Air. Linux has no iOS simulator; do not treat a green Linux structural run as S4 or S6.

Prerequisites: Xcode that includes the iOS 27 SDK, the iOS 27.0 simulator runtime, the iOS 26.5 simulator runtime, CocoaPods, and this branch checked out with `bun install` already done.

```bash
cd apps/mobile
bash script/verify-ios-scene-lifecycle.sh simulator
```

The script:

1. Runs `CI=1 bunx expo prebuild --platform ios --no-install --clean`.
2. Runs the structural checks (S2).
3. Runs `pod install` in `ios/`.
4. Release-builds `Atmos` for the iOS 27.0 simulator. Default device name is `iPhone 18 Pro` (`ATMOS_IOS27_DEVICE`, `ATMOS_IOS27_RUNTIME`).
5. Installs, cold-launches `land.atmos.mobile`, and fails if launch exits non-zero or the unified log contains `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` or `EXC_BREAKPOINT`.
6. Terminates, `simctl openurl atmos://scene-lifecycle-probe` (cold URL), then `openurl atmos://scene-lifecycle-probe-warm` (warm URL). Fails unless the log contains `AtmosSceneLifecycle delivered URL to RCTLinkingManager` twice.
7. Repeats the cold launch and the same two `openurl` calls on iOS 26.5. Default device is `iPhone 17 Pro` (`ATMOS_IOS26_DEVICE`, `ATMOS_IOS26_RUNTIME`), matching the parity workflow pin.
8. Prints `NOT RUN: universal links` because `app.json` has no associated domain. S5 remains the structural proof for that path.

Override examples:

```bash
ATMOS_IOS26_DEVICE="iPhone 18 Pro" bash script/verify-ios-scene-lifecycle.sh simulator
bash script/verify-ios-scene-lifecycle.sh structural
bash script/verify-ios-scene-lifecycle.sh built-plist path/to/Atmos.app/Info.plist
```

`structural` is the Linux command. `simulator` exits 2 when `xcrun` is missing and prints `NOT RUN`.

## Non-coverage

- Universal-link end to end. No associated domain, no apple-app-site-association.
- A physical device. The reported crash was the iOS 27.0 simulator.
- Debug + Metro + `expo-dev-launcher` cold-start dedupe. Release is the crash configuration. The dev launcher can also store the URL; see TECH risks.
- Expo SDK 58 upgrade behavior.

## Coverage Status

Recorded 2026-10-19. Local commands ran on the Linux cloud VM. S3 is the GitHub Actions result below. S4 and S6 stay `not_run`.

### Commands

- `cd apps/mobile && bun test plugins/with-ios-scene-lifecycle.test.js ios-launch-scene.test.js app.config.test.js` → pass, exit 0. 9 pass, 0 fail, 47 expect() calls.
- `cd apps/mobile && bun test` → pass, exit 0. 414 pass, 0 fail, 1776 expect() calls, 102 files.
- `cd apps/mobile && rm -rf ios && CI=1 bunx expo prebuild --platform ios --no-install && bash script/verify-ios-scene-lifecycle.sh structural` → pass, exit 0. Printed `source UISceneDelegateClassName=$(PRODUCT_MODULE_NAME).SceneDelegate` and `AppDelegate.swift scene lifecycle ok`.
- Same structural script after `EXPO_PUBLIC_PARITY_PREVIEW=1` via `apps/mobile/.env` and `expo prebuild --clean` → pass, exit 0. `.env` was deleted and is not part of the diff.
- `bash -n apps/mobile/script/verify-ios-scene-lifecycle.sh` → pass, exit 0.
- A copy of the prebuild plist with the class string replaced by `Atmos.SceneDelegate` passed `verify-ios-scene-lifecycle.sh built-plist`. The unexpanded source plist failed that mode, as intended. This is not a built `.app`.
- `bunx oxlint --max-warnings=450` from the repo root → pass, exit 0.
- `bash apps/mobile/script/verify-ios-scene-lifecycle.sh simulator` → **not run**. This machine has no `xcrun`. The script is written to exit 2 in that case. It was not executed, so this session did not observe that exit.
- iOS 27.0 Release cold start, and both runtimes' cold/warm `simctl openurl` → **not run**. The iOS 26.5 Release launch that did happen is the parity capture in S3, which does not open a URL and does not search for the runtime-issue symbol.
- Universal links → **not run** (no associated domain). S5 covers the Swift wiring only.
- `ci-mobile-ios-parity.yml` on `01075c6024a9f4a05d4b641991034ffcf1bf3188` → pass. Run [39206606309](https://github.com/AruNi-01/atmos/actions/runs/39206606309). `structural` job success (2m20s), including mobile `bun test`. `ios-simulator` job success (1h0m15s): Xcode 26.5, iPhone 17 Pro, iOS 26.5, Release. The job runs `verify-ios-scene-lifecycle.sh built-plist` and then the parity capture, which cold-launches `land.atmos.mobile` and rejects a black window. This VM did not download the PNG artifacts. The job does not grep `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` and does not call `simctl openurl`.
- CI - JS run [39206606232](https://github.com/AruNi-01/atmos/actions/runs/39206606232) → `oxlint` pass (51s), `oxfmt` pass (54s).
- CodeQL run [39206604231](https://github.com/AruNi-01/atmos/actions/runs/39206604231) → pass. Not a functional check for this change.

### Status

| Scenario | Status                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| S1       | pass — `plugins/with-ios-scene-lifecycle.test.js`                                                                                    |
| S2       | pass — `verify-ios-scene-lifecycle.sh structural` after prebuild, including the parity-preview prebuild                              |
| S3       | pass — GitHub `ios-simulator` job on run 39206606309 (iOS 26.5 Release, built plist, parity capture). PNGs were not downloaded here. |
| S4       | partial — Swift strings pass in S1; simulator log not_run                                                                            |
| S5       | pass — same unit test (user-activity keys and `scene(_:continue:)`)                                                                  |
| S6       | not_run — simulator cold start                                                                                                       |
| S7       | pass — `app.config.test.js`                                                                                                          |
