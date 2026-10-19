# TEST · QUALITY-011: Mobile iOS 27 UIScene lifecycle

> Test Plan · how we verify the iOS 27 cold start and that deep links still reach `RCTLinkingManager`. References TECH QUALITY-011.

## Test strategy

The crash is inside UIKit on a simulator this Linux environment cannot boot. CI and local Linux prove the prebuild shape and the Swift rewrite. A Mac with the iOS 27.0 and iOS 26.5 runtimes proves launch and the native log line. There is no web UI and no Playwright surface.

- Unit: `bun test` on the pure plugin rewrite and the plist dictionary. No prebuild, no simulator.
- Structural: `expo prebuild --platform ios --no-install`, then `apps/mobile/script/verify-ios-scene-lifecycle.sh structural`. The parity workflow runs the same script on the generated project and `built-plist` on the built app.
- Manual simulator: `verify-ios-scene-lifecycle.sh simulator` on a Mac. The 2026-10-19 run tested `3929803de`, before `NSLog` moved into `notify` and before `sceneDidDisconnect`. That Mac run does not cover this head. GitHub `ios-simulator` on `74a2e1841` built and cold-launched the parity Release app on iOS 26.5. iOS 27 of this head, the notify log, and S8 are not run.
- Exploratory agent-browser: omitted. The app under test is a native iOS binary, not a browser page.

## Coverage map

| Requirement                                                                                                 | Scenario IDs |
| ----------------------------------------------------------------------------------------------------------- | ------------ |
| M1. iOS 27.0 Release cold start does not hit `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` | S1, S2, S6   |
| M2. iOS 26.5 Release cold start still launches                                                              | S3, S6       |
| M3. Cold-start custom URL reaches `RCTLinkingManager`                                                       | S4, S6       |
| M4. Warm `openURL` reaches `RCTLinkingManager`                                                              | S4, S6       |
| M5. Browsing-web user activity is forwarded even though no associated domain is configured                  | S5           |
| M6. Parity preview must not strip the scene class or the scene plugin                                       | S3, S7       |
| M7. iOS 27 background and foreground still reach React Native `AppState`                                    | S8           |

## Execution map

| Scenario | Level      | Expected tool                             | Target command / method                                                                                                         | Fixture / data                                                             | Signals                                                                                                                  | Status  |
| -------- | ---------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| S1       | Unit       | `bun test`                                | `cd apps/mobile && bun test plugins/with-ios-scene-lifecycle.test.js ios-launch-scene.test.js app.config.test.js`               | Expo SDK 56 AppDelegate fixture in the test                                | `class SceneDelegate`; no `UIWindow(frame:`; launch-option key strings; `openURLContexts`                                | pass    |
| S2       | Structural | shell                                     | `cd apps/mobile && CI=1 bunx expo prebuild --platform ios --no-install && bash script/verify-ios-scene-lifecycle.sh structural` | clean prebuild                                                             | source plist class is `$(PRODUCT_MODULE_NAME).SceneDelegate`; Swift checks from S1 hold on `ios/Atmos/AppDelegate.swift` | pass    |
| S3       | CI build   | GitHub Actions                            | `.github/workflows/ci-mobile-ios-parity.yml` `ios-simulator` job                                                                | `EXPO_PUBLIC_PARITY_PREVIEW=1`, iPhone 17 Pro, iOS 26.5, Release           | job green; built plist class is `Atmos.SceneDelegate`; parity PNGs are not the black scene                               | pass    |
| S4       | Manual     | `verify-ios-scene-lifecycle.sh simulator` | see Manual verification steps                                                                                                   | iPhone 18 Pro, iOS 27.0, Release                                           | cold and warm logs contain `AtmosSceneLifecycle delivered URL to RCTLinkingManager`; the log is inside `notify`          | partial |
| S5       | Unit       | `bun test`                                | same file as S1                                                                                                                 | fixture                                                                    | `userActivities`, `NSUserActivityTypeBrowsingWeb`, both user-activity launch-option keys                                 | pass    |
| S6       | Manual     | same script, both runtimes                | see Manual verification steps                                                                                                   | iOS 27.0 and iOS 26.5 Release                                              | `simctl launch` exit 0; no `EXC_BREAKPOINT` / runtime-issue line                                                         | partial |
| S7       | Unit       | `bun test`                                | `app.config.test.js`                                                                                                            | `EXPO_PUBLIC_PARITY_PREVIEW=1` and `./plugins/with-ios-scene-lifecycle.js` | parity config keeps the manifest and that plugin                                                                         | pass    |
| S8       | Manual     | iOS 27 simulator                          | background, then foreground, on a Release build of this head                                                                    | iPhone 18 Pro, iOS 27.0                                                    | JS `AppState` sees `background` then `active`                                                                            | pending |

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
- **Then**: `verify-ios-scene-lifecycle.sh built-plist` reads `Atmos.SceneDelegate`. The job does not fail for the presence of a scene delegate. Existing parity screenshot gates still reject a black window. After main includes #326, `ios-simulator` runs on `workflow_dispatch` or when the PR has the `ios-parity` label. The positive class check stays.
- **Signals**: workflow job conclusion success. This Linux session does not download those artifacts until the job exists.

### S4 — Cold and warm custom URLs reach RCTLinkingManager

- **Level**: Unit for the source shape; manual for the running process
- **Given**: a Release install on the iOS 27.0 simulator.
- **When**: the app is terminated and `xcrun simctl openurl` opens `atmos://scene-lifecycle-probe`, then opened again while the process is up with `atmos://scene-lifecycle-probe-warm`.
- **Then**: the simulator log contains `AtmosSceneLifecycle delivered URL to RCTLinkingManager` at least twice. That string is inside the `notify` closure, so a line means this path called `RCTLinkingManager.application`. If `body` already posted `RCTOpenURLNotification` for the same URL, `notify` does not run and the line is absent. Launch options include `UIApplicationLaunchOptionsURLKey` for the cold URL. The format string does not interpolate the URL. Removing `if !observer.wasNotified` or calling `notify()` outside that guard fails `plugins/with-ios-scene-lifecycle.test.js`.
- **Signals**: the unit test parses the generated `static func deliver` and fails when `notify()` is unconditional. Simulator log lines from the script. UIKit may still write the URL into the system log. The 2026-10-19 simulator count used the older unconditional `NSLog` and does not cover this placement.

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
- **Signals**: script sections `cold-start`. The Mac run is in Coverage Status.

### S7 — Parity config keeps the manifest and the scene plugin

- **Level**: Unit
- **Given**: a config whose `ios.infoPlist` already has `UIApplicationSceneManifest`, whose `plugins` include `./plugins/with-ios-scene-lifecycle.js`, and `EXPO_PUBLIC_PARITY_PREVIEW=1`.
- **When**: `applyParityPreviewConfig` runs.
- **Then**: the manifest is still present, `expo-dev-client` is still removed, and `./plugins/with-ios-scene-lifecycle.js` is still in `plugins`.
- **Signals**: `app.config.test.js`.

### S8 — iOS 27 background and foreground reach AppState

- **Level**: Manual
- **Status**: pending. Not run.
- **Given**: a Release install of this head on iOS 27.0 (iPhone 18 Pro).
- **When**: the app is sent to the background and brought back to the foreground.
- **Then**: React Native `AppState` reports `background`, then `active`. Session reconnect that depends on that transition still runs.
- **Signals**: not defined until the Mac run. `RCTAppState` in React Native 0.85.3 listens for `UIApplicationDidBecomeActiveNotification`, `UIApplicationWillResignActiveNotification`, `UIApplicationDidEnterBackgroundNotification`, and `UIApplicationWillEnterForegroundNotification`. `SceneDelegate` calls the matching app-delegate methods and does not post those notifications. UIKit may still post them. This Linux session cannot check that.

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
- [x] The parity workflow no longer fails because a scene delegate exists. It fails when the class or the built plist name is wrong. Run [39236707389](https://github.com/AruNi-01/atmos/actions/runs/39236707389) on `74a2e1841a97f36667a88164b02078d3f5f215b6` concluded success (`ios-simulator` built `Atmos.SceneDelegate`). The earlier run [39206606309](https://github.com/AruNi-01/atmos/actions/runs/39206606309) on `01075c6024a9f4a05d4b641991034ffcf1bf3188` also succeeded.
- [x] S4 and S6 passed on `3929803de674dec8cd916355848620502dd95471` (`verify-ios-scene-lifecycle.sh simulator` exit 0). `74a2e1841` changes `SceneDelegate` (`sceneDidDisconnect`, `NSLog` only inside `notify`). The Mac script is not run again on that Swift. Universal links stay `not_run`. S8 stays pending. S3 is the GitHub iOS 26.5 parity job, which did rebuild `74a2e1841`.
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

Recorded 2026-10-19. Linux commands ran on the cloud VM. S3 is the GitHub Actions parity job on `74a2e1841a97f36667a88164b02078d3f5f215b6`. The Mac simulator script on `3929803de674dec8cd916355848620502dd95471` is historical: that binary logged unconditionally and had no `sceneDidDisconnect`. This head is not rebuilt on that Mac. Universal links and S8 stay not run.

### Commands

- `cd apps/mobile && bun test plugins/with-ios-scene-lifecycle.test.js ios-launch-scene.test.js app.config.test.js` → pass, exit 0. 10 pass, 0 fail, 72 expect() calls.
- `cd apps/mobile && bun test` → pass, exit 0. 415 pass, 0 fail, 1801 expect() calls, 102 files.
- `cd apps/mobile && rm -rf ios && CI=1 bunx expo prebuild --platform ios --no-install && bash script/verify-ios-scene-lifecycle.sh structural` → pass, exit 0. Printed `source UISceneDelegateClassName=$(PRODUCT_MODULE_NAME).SceneDelegate` and `AppDelegate.swift scene lifecycle ok`.
- Same structural script after `EXPO_PUBLIC_PARITY_PREVIEW=1` via `apps/mobile/.env` and `expo prebuild --clean` → pass, exit 0. `.env` was deleted and is not part of the diff.
- `bash -n apps/mobile/script/verify-ios-scene-lifecycle.sh` → pass, exit 0.
- A copy of the prebuild plist with the class string replaced by `Atmos.SceneDelegate` passed `verify-ios-scene-lifecycle.sh built-plist`. The unexpanded source plist failed that mode, as intended. This is not a built `.app`.
- `bunx oxlint --max-warnings=450` from the repo root → pass, exit 0.
- Mac, 2026-10-19, tested SHA `3929803de674dec8cd916355848620502dd95471`: `cd apps/mobile && bun install && bash script/verify-ios-scene-lifecycle.sh simulator` with the script defaults (iPhone 18 Pro / iOS 27.0, then iPhone 17 Pro / iOS 26.5). No `ATMOS_IOS27_*` or `ATMOS_IOS26_*` overrides. Not a parity preview (`EXPO_PUBLIC_PARITY_PREVIEW` unset). Prebuild structural check printed `source UISceneDelegateClassName=$(PRODUCT_MODULE_NAME).SceneDelegate` and `AppDelegate.swift scene lifecycle ok`.
  - Attempt 1: `pod install` failed on a transient hermes-engine fetch (maven existence check, then `git ls-remote` hit `SSL_ERROR_SYSCALL` and an empty commit, `[!] Error installing hermes-engine`). Unrelated to this change. Script exit 1.
  - Attempt 2: the same script, rerun, exit 0. Both runtimes: Release `BUILD SUCCEEDED`; built `UISceneDelegateClassName=Atmos.SceneDelegate`; cold launch pass (no `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`, no `EXC_BREAKPOINT`, 0 new Atmos `.ips`). `AtmosSceneLifecycle delivered URL to RCTLinkingManager` twice on each runtime (cold `atmos://scene-lifecycle-probe`, then warm `atmos://scene-lifecycle-probe-warm`). After each probe the app showed Expo Router "Route not found". That route is not a product screen; it shows the URL reached the JS router. Script printed `NOT RUN: universal links` and `PASS simulator: iOS 27.0 and iOS 26.5 cold start + custom-scheme deep links`.
- `5c2f5072c8bb6606a9e7ec28d41eb1c497f35f14` only renames the spec. It was not rebuilt, and its native code matches `3929803de`.
- Dedup lock: `expectNotifyOnlyWhenLinkingManagerDidNotPost` parses `static func deliver`. Replacing the guard with unconditional `body(); notify()` fails that test (`expect(guardAt).toBeGreaterThan(-1)` received -1). Keeping the guard and adding a second `notify()` also fails (`expect(outsideGuard).not.toContain("notify()")`). Restored plugin exits 0. Universal links → **not run**. S8 → **pending / not run**.
- `ci-mobile-ios-parity.yml` on `74a2e1841a97f36667a88164b02078d3f5f215b6` → pass. Run [39236707389](https://github.com/AruNi-01/atmos/actions/runs/39236707389). `structural` job success (2m39s), including mobile `bun test`. `ios-simulator` job success (50m2s): Xcode 26.5, iPhone 17 Pro, iOS 26.5, Release, `EXPO_PUBLIC_PARITY_PREVIEW=1`. Prebuild printed `source UISceneDelegateClassName=$(PRODUCT_MODULE_NAME).SceneDelegate` and `AppDelegate.swift scene lifecycle ok`. The Release build printed `BUILD SUCCEEDED` and `built UISceneDelegateClassName=Atmos.SceneDelegate`. The parity capture cold-launches `land.atmos.mobile` and rejects a black window. This VM did not download the PNG artifacts. The job does not grep `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` and does not call `simctl openurl`. The earlier run [39206606309](https://github.com/AruNi-01/atmos/actions/runs/39206606309) on `01075c602` is the same gate before `sceneDidDisconnect`.
- CI - JS run [39236707320](https://github.com/AruNi-01/atmos/actions/runs/39236707320) on the same SHA → `oxlint` pass (52s), `oxfmt` pass (51s).
- CodeQL run [39236702328](https://github.com/AruNi-01/atmos/actions/runs/39236702328) → pass. Not a functional check for this change.
- Mac rebuild of `74a2e1841` (iOS 27.0 cold start, notify-only URL log, `sceneDidDisconnect`) → **not run**.

### Status

| Scenario | Status                                                                                                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1       | pass — `plugins/with-ios-scene-lifecycle.test.js`                                                                                                                                                                                        |
| S2       | pass — `verify-ios-scene-lifecycle.sh structural` after prebuild, including the parity-preview prebuild                                                                                                                                  |
| S3       | pass — GitHub `ios-simulator` on run 39236707389 (`74a2e1841`, iOS 26.5 Release, built plist `Atmos.SceneDelegate`, parity capture). PNGs were not downloaded here.                                                                      |
| S4       | partial — unit lock passes (`notify()` only inside `if !observer.wasNotified`, log only inside `notify`). Simulator 2× log on `3929803de` used the unconditional `NSLog`. This head's log placement is not_run. Universal links not_run. |
| S5       | pass — unit test (user-activity keys and `scene(_:continue:)`). Universal-link end to end not_run.                                                                                                                                       |
| S6       | partial — GitHub iOS 26.5 Release of `74a2e1841` built and the parity job cold-launched it (no runtime-issue grep). Mac cold start, including iOS 27.0, passed on `3929803de` only. This head's Mac script is not_run.                   |
| S7       | pass — `app.config.test.js` keeps `UIApplicationSceneManifest` and `./plugins/with-ios-scene-lifecycle.js` under `EXPO_PUBLIC_PARITY_PREVIEW=1`.                                                                                         |
| S8       | pending — iOS 27 background then foreground `AppState`. not_run.                                                                                                                                                                         |
