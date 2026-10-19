# TEST · QUALITY-011: Mobile iOS 27 UIScene lifecycle

> Test Plan · how we verify the iOS 27 cold start and that deep links still reach `RCTLinkingManager`. References TECH QUALITY-011.

## Test strategy

The crash is inside UIKit on a simulator this Linux environment cannot boot. CI and local Linux prove the prebuild shape and the Swift rewrite. A Mac with the iOS 27.0 and iOS 26.5 runtimes proves launch and the native log line. There is no web UI and no Playwright surface.

- Unit: `bun test` on the pure plugin rewrite and the plist dictionary. No prebuild, no simulator.
- Structural: `expo prebuild --platform ios --no-install`, then `apps/mobile/script/verify-ios-scene-lifecycle.sh structural`. The parity workflow runs the same script on the generated project and `built-plist` on the built app.
- Manual simulator: `verify-ios-scene-lifecycle.sh simulator` on a Mac. The 2026-10-19 run on `3929803de` counted an unconditional URL `NSLog`. `42801c19` reached the JS unmatched route with that log at 0, and the script's old count failed closed. The script now requires `ATMOS_ROUTE unmatched` to increase on the cold open and again on the warm open. That Mac rerun is not done yet.
- Launch proof on Linux: `bun test` on `script/scene-launch-evidence.test.js`. Fake pod install logs and a fake DiagnosticReports directory drive the shell. A cold launch passes only when the pid is still alive at least 3 seconds later, no new Atmos `.ips` appeared, and the old runtime-issue checks still pass. A prebuilt miss prints `NOT RUN` and exits 2, which is neither 0 nor 1.
- Exploratory agent-browser: omitted. The app under test is a native iOS binary, not a browser page.

## Coverage map

| Requirement                                                                                                 | Scenario IDs   |
| ----------------------------------------------------------------------------------------------------------- | -------------- |
| M1. iOS 27.0 Release cold start does not hit `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` | S1, S2, S6, S9 |
| Prebuilt download failure is NOT RUN, not PASS and not FAIL                                                 | S10            |
| M2. iOS 26.5 Release cold start still launches                                                              | S3, S6         |
| M3. Cold-start custom URL reaches `RCTLinkingManager`                                                       | S4, S6         |
| M4. Warm `openURL` reaches `RCTLinkingManager`                                                              | S4, S6         |
| M5. Browsing-web user activity is forwarded even though no associated domain is configured                  | S5             |
| M6. Parity preview must not strip the scene class or the scene plugin                                       | S3, S7         |
| M7. iOS 27 background and foreground still reach React Native `AppState`                                    | S8             |

## Execution map

| Scenario | Level      | Expected tool                             | Target command / method                                                                                                         | Fixture / data                                                              | Signals                                                                                                                  | Status  |
| -------- | ---------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| S1       | Unit       | `bun test`                                | `cd apps/mobile && bun test plugins/with-ios-scene-lifecycle.test.js ios-launch-scene.test.js app.config.test.js`               | Expo SDK 56 AppDelegate fixture in the test                                 | `class SceneDelegate`; no `UIWindow(frame:`; launch-option key strings; `openURLContexts`                                | pass    |
| S2       | Structural | shell                                     | `cd apps/mobile && CI=1 bunx expo prebuild --platform ios --no-install && bash script/verify-ios-scene-lifecycle.sh structural` | clean prebuild                                                              | source plist class is `$(PRODUCT_MODULE_NAME).SceneDelegate`; Swift checks from S1 hold on `ios/Atmos/AppDelegate.swift` | pass    |
| S3       | CI build   | GitHub Actions                            | `.github/workflows/ci-mobile-ios-parity.yml` `ios-simulator` job                                                                | `EXPO_PUBLIC_PARITY_PREVIEW=1`, iPhone 17 Pro, iOS 26.5, Release            | job green; built plist class is `Atmos.SceneDelegate`; parity PNGs are not the black scene                               | pass    |
| S4       | Manual     | `verify-ios-scene-lifecycle.sh simulator` | see Manual verification steps                                                                                                   | iPhone 18 Pro, iOS 27.0, Release                                            | `ATMOS_ROUTE unmatched` once after the cold URL and again after the warm URL; no URL on an Atmos line                    | partial |
| S5       | Unit       | `bun test`                                | same file as S1                                                                                                                 | fixture                                                                     | `userActivities`, `NSUserActivityTypeBrowsingWeb`, both user-activity launch-option keys                                 | pass    |
| S6       | Manual     | same script, both runtimes                | see Manual verification steps                                                                                                   | iOS 27.0 and iOS 26.5 Release                                               | launch exit 0; pid alive ≥3s; no new Atmos `.ips`; no runtime-issue / `EXC_BREAKPOINT` line                              | partial |
| S7       | Unit       | `bun test`                                | `app.config.test.js`                                                                                                            | `EXPO_PUBLIC_PARITY_PREVIEW=1` and `./plugins/with-ios-scene-lifecycle.js`  | parity config keeps the manifest and that plugin                                                                         | pass    |
| S8       | Manual     | iOS 27 and iOS 26.5 simulators            | background, then foreground, without terminating                                                                                | iPhone 18 Pro / iOS 27.0, and one iOS 26.5 control round                    | each round JS `AppState` is `active`, `inactive`, `background`, `active`                                                 | pass    |
| S9       | Unit       | `bun test` + bash                         | `cd apps/mobile && bun test script/scene-launch-evidence.test.js`                                                               | fake launch output; fake DiagnosticReports with an old `.ips` and a new one | dead pid or a new `Atmos-*.ips` exits 1 and does not print `PASS`; an old `.ips` alone does not fail                     | planned |
| S10      | Unit       | `bun test` + bash                         | same file as S9                                                                                                                 | fake pod install log; fake `ReactNativeDependencies-artifacts`              | `Building from source: true`, `No prebuilt artifacts found`, or a missing release tarball exits 2 with `NOT RUN`         | planned |

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
- **Then**: the Atmos process log contains `ATMOS_ROUTE unmatched` at least once after the cold URL, and the count from the same start time is strictly greater after the warm URL. The string is a fixed `console.error` in `app/+not-found.tsx`, keyed on `pathname`, and it does not include the path. An Atmos line that contains `atmos://` or `scene-lifecycle-probe` fails. `CoreSimulatorBridge` may still print the URL. The notify `NSLog` stays inside `notify` and is not the pass signal: with the generated `super || RCTLinkingManager` path it is absent, which is the dedupe. Zero unmatched-route markers, a warm open that adds none, or the URL on an Atmos line fails `script/scene-deep-link-evidence.js`. A failure on iOS 27 still runs the iOS 26.5 section.
- **Signals**: `scene-deep-link-evidence.test.js`. On `42801c19` the screen reached Expo Router "Route not found" for both opens, the notify `NSLog` was 0, and the Atmos process log did not contain the URL. The script that counted the `NSLog` exited 1 before this change. The new judge has not been run on a simulator.

### S5 — Browsing-web user activities are wired

- **Level**: Unit
- **Given**: the rewritten AppDelegate.
- **When**: the test scans the scene delegate.
- **Then**: `willConnectTo` walks `connectionOptions.userActivities`, `scene(_:continue:)` exists, and launch options include `UIApplicationLaunchOptionsUserActivityDictionaryKey`, `UIApplicationLaunchOptionsUserActivityTypeKey`, and `UIApplicationLaunchOptionsUserActivityKey` gated on `NSUserActivityTypeBrowsingWeb`.
- **Signals**: those substrings in the unit test. No simulator universal link: `app.json` has no associated domain.

### S6 — Cold start stays up and does not hit the UIKit runtime issue

- **Level**: Manual on a Mac; the decision itself is the Linux judge in S9
- **Given**: Release builds installed on iOS 27.0 (iPhone 18 Pro) and iOS 26.5, and a snapshot of Atmos `.ips` files taken before launch.
- **When**: `xcrun simctl launch` starts `land.atmos.mobile` with no URL, then the script waits 4 seconds (at least 3).
- **Then**: launch exits 0 and its output does not contain `EXC_BREAKPOINT` or `Terminated`. The printed pid is still alive after the wait. No new Atmos `.ips` basename appeared under the DiagnosticReports roots. The unified log does not contain `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` or `EXC_BREAKPOINT`. A log line with `OS_REASON_DYLD` or `Library not loaded: @rpath/React.framework/React` also fails. Launch exit 0 alone is not a pass.
- **Signals**: `scene-launch-evidence.js judge-cold`. Mac runs recorded below used the older launch-exit check. The hardened script has not been run on a simulator.

### S7 — Parity config keeps the manifest and the scene plugin

- **Level**: Unit
- **Given**: a config whose `ios.infoPlist` already has `UIApplicationSceneManifest`, whose `plugins` include `./plugins/with-ios-scene-lifecycle.js`, and `EXPO_PUBLIC_PARITY_PREVIEW=1`.
- **When**: `applyParityPreviewConfig` runs.
- **Then**: the manifest is still present, `expo-dev-client` is still removed, and `./plugins/with-ios-scene-lifecycle.js` is still in `plugins`.
- **Signals**: `app.config.test.js`.

### S8 — iOS 27 background and foreground reach AppState

- **Level**: Manual
- **Given**: a Release install of `42801c19fe297253f726da0ff0cf37ca6e872262` on iOS 27.0 (iPhone 18 Pro), and the same built app installed on iOS 26.5 (iPhone 17 Pro).
- **When**: the app is sent to the background and brought back to the foreground without terminating it. iOS 27 did this twice. iOS 26.5 did it once as a control.
- **Then**: each round, JS `AppState` reports `active`, then `inactive`, then `background`, then `active`, in step with the native become-active / resign-active / background events. The JS sequence was read from a temporary `console.error` that was not committed.
- **Session reconnect**: not run. The simulator had no paired Computer, so there was no relay or WebSocket traffic to observe.
- **Signals**: the manual run on `42801c19`. `RCTAppState` in React Native 0.85.3 listens for `UIApplicationDidBecomeActiveNotification`, `UIApplicationWillResignActiveNotification`, `UIApplicationDidEnterBackgroundNotification`, and `UIApplicationWillEnterForegroundNotification`. `SceneDelegate` calls the matching app-delegate methods and does not post those notifications. UIKit still posted them on this run.

### S9 — A dyld death is not a cold-launch pass

- **Level**: Unit (shell subcommands, no simulator)
- **Given**: `simctl launch` output `land.atmos.mobile: <pid>` with exit 0, a runtime log that has neither `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` nor `EXC_BREAKPOINT`, and a crash-report directory that already contains an older `Atmos-*.ips`.
- **When**: `judge-cold` is run for a process that is not alive after the wait, and the directory gained a new Atmos `.ips` during the launch. Separate cases drop only the liveness bit, or only add the new `.ips`, or wait fewer than 3 seconds.
- **Then**: the command exits 1, prints `FAIL`, and does not print `PASS`. The pre-existing `.ips` is not the failure. `Atmosphere.ips` is not an Atmos crash report. The same inputs with a live pid, a wait of at least 3 seconds, and no new `.ips` exit 0 and print `PASS`.
- **Signals**: `script/scene-launch-evidence.test.js`.

### S10 — Pod install without the Release prebuilt does not build

- **Level**: Unit (shell subcommand, no CocoaPods and no Xcode)
- **Given**: a fake pod install log and a fake `ReactNativeDependencies-artifacts` directory.
- **When**: `judge-prebuilt` sees `Building from source: true`, or `No prebuilt artifacts found`, or no `reactnative-dependencies-*-release.tar.gz`. `Building from source: false` plus that Release tarball is the clean case. A debug-only tarball is not clean.
- **Then**: each anomaly exits 2 and prints `NOT RUN` with `network` or `missing prebuilt`. The clean case exits 0. Exit 2 is not 0 and not 1. `simulator` calls this judge after `pod install` and before `install_and_verify`. `structural` and `built-plist` still exit 1 on a missing tree. `simulator` with no `xcrun` still exits 2 before prebuild.
- **Signals**: `script/scene-launch-evidence.test.js`.

## Performance & load budgets

None. Scene connection replaces the old window allocation. No extra JavaScript work.

## Regression checklist

- [ ] `HomeTabBarClearGlass.install()` still runs inside `didFinishLaunchingWithOptions`.
- [ ] Parity preview still excludes `expo-dev-client` / `expo-dev-launcher` / `expo-dev-menu` / `expo-dev-menu-interface`.
- [ ] Generated URL schemes `atmos`, `land.atmos.mobile`, and `exp+atmos-mobile` are unchanged.
- [ ] The scene delegate does not log the URL or the user-activity webpage.
- [ ] `apps/mobile/ios` stays gitignored.
- [ ] A pod log with `Building from source: true` or a missing `reactnative-dependencies-*-release.tar.gz` does not reach `xcodebuild` and does not print `PASS`.
- [ ] Cold launch does not print `PASS` when the pid is gone or a new Atmos `.ips` appeared, even if `simctl launch` exited 0 and the runtime-issue line is absent.
- [ ] Deep link still fails closed on a missing `ATMOS_ROUTE unmatched` marker. `structural` and `built-plist` stay exit 0 or 1.

## Acceptance criteria

- [x] S1, S2, S5, and S7 pass on the implementation commit.
- [x] `verify-ios-scene-lifecycle.sh structural` exits 0 after prebuild.
- [x] CI `oxlint` and `oxfmt` jobs are green, and the mobile `bun test` job is green.
- [x] The parity workflow no longer fails because a scene delegate exists. It fails when the class or the built plist name is wrong. Run [39236707389](https://github.com/AruNi-01/atmos/actions/runs/39236707389) on `74a2e1841a97f36667a88164b02078d3f5f215b6` concluded success (`ios-simulator` built `Atmos.SceneDelegate`). The earlier run [39206606309](https://github.com/AruNi-01/atmos/actions/runs/39206606309) on `01075c6024a9f4a05d4b641991034ffcf1bf3188` also succeeded.
- [x] S4's screen result and S6 passed on `42801c19fe297253f726da0ff0cf37ca6e872262` by manual simulator checks. The script on that SHA exited 1 because it still required two notify `NSLog` lines, which the dedupe correctly omits. Universal links stay `not_run`. S8 AppState passed on that SHA. Session reconnect stays `not_run`. The revised script has not been run on a Mac.
- [x] No `EVIDENCE_PUSH` and no push to `agent-artifacts`.
- [ ] S9 and S10 pass from the Linux fixture tests. A Mac run of `simulator` on the hardened script stays not run.

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
3. Runs `pod install` in `ios/`, then checks the log and `ios/Pods/ReactNativeDependencies-artifacts/`. `Building from source: true`, `No prebuilt artifacts found`, or a missing `reactnative-dependencies-*-release.tar.gz` prints `NOT RUN` with `network` or `missing prebuilt` and exits 2. It does not `xcodebuild`. A non-zero `pod install` without those signals is exit 1.
4. Release-builds `Atmos` for the iOS 27.0 simulator. Default device name is `iPhone 18 Pro` (`ATMOS_IOS27_DEVICE`, `ATMOS_IOS27_RUNTIME`).
5. Installs and cold-launches `land.atmos.mobile`. Pass requires launch exit 0, the pid still alive after 4 seconds (at least 3), no new Atmos `.ips` since the pre-launch snapshot, and no `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` or `EXC_BREAKPOINT` in the unified log. `OS_REASON_DYLD` / `Library not loaded: @rpath/React.framework/React` in that log also fails.
6. Terminates, `simctl openurl atmos://scene-lifecycle-probe` (cold URL), then `openurl atmos://scene-lifecycle-probe-warm` (warm URL). Fails unless the Atmos process log gains `ATMOS_ROUTE unmatched` on the cold URL and again on the warm URL, or if an Atmos line contains the URL. The notify `NSLog` is not counted.
7. Repeats the cold launch and the same two `openurl` calls on iOS 26.5 even when the iOS 27 section failed. Default device is `iPhone 17 Pro` (`ATMOS_IOS26_DEVICE`, `ATMOS_IOS26_RUNTIME`), matching the parity workflow pin. The script exits 1 at the end if either runtime failed.
8. Prints `NOT RUN: universal links` because `app.json` has no associated domain. S5 remains the structural proof for that path.

Override examples:

```bash
ATMOS_IOS26_DEVICE="iPhone 18 Pro" bash script/verify-ios-scene-lifecycle.sh simulator
bash script/verify-ios-scene-lifecycle.sh structural
bash script/verify-ios-scene-lifecycle.sh built-plist path/to/Atmos.app/Info.plist
```

`structural` is the Linux command. `simulator` exits 2 when `xcrun` is missing, or when the prebuilt gate fails, and prints `NOT RUN`. Exit 0 is PASS. Exit 1 is a check that ran and failed.

```bash
# Linux, no simulator: fake pod log and a fake crash-report directory.
cd apps/mobile && bun test script/scene-launch-evidence.test.js
```

## Non-coverage

- Universal-link end to end. No associated domain, no apple-app-site-association.
- A physical device. The reported crash was the iOS 27.0 simulator.
- Debug + Metro + `expo-dev-launcher` cold-start dedupe. Release is the crash configuration. The dev launcher can also store the URL; see TECH risks.
- Expo SDK 58 upgrade behavior.
- A Mac re-run of `verify-ios-scene-lifecycle.sh simulator` after the cold-launch and prebuilt gates. This environment has no iOS simulator. S9 and S10 cover those decisions with fixtures. The previous Mac notes above are the older script.

## Coverage Status

Recorded 2026-10-19. Linux commands ran on the cloud VM. S3 is the GitHub Actions parity job. The Mac script on `3929803de` counted an unconditional URL `NSLog`. `42801c19` is the manual Release run below. The revised deep-link judge has not been run on a simulator. Universal links and session reconnect stay not run.

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
- Mac rebuild of `74a2e1841` (iOS 27.0 cold start, notify-only URL log, `sceneDidDisconnect`) → **not run** as a script. See the `42801c19` manual run.
- Mac, 2026-10-19, tested SHA `42801c19fe297253f726da0ff0cf37ca6e872262`. Not a parity preview (`EXPO_PUBLIC_PARITY_PREVIEW` unset, `PARITY_PREVIEW` absent from `main.jsbundle`). `verify-ios-scene-lifecycle.sh simulator` exit 1. iOS 27 Release `BUILD SUCCEEDED`, built `UISceneDelegateClassName=Atmos.SceneDelegate`, structural check ok (`sceneDidDisconnect`, `window = nil`, `if !observer.wasNotified`). Cold launch pass: no `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`, no `EXC_BREAKPOINT`, 0 new Atmos `.ips`. The script then stopped at `FAIL deep link: expected two 'AtmosSceneLifecycle delivered URL to RCTLinkingManager' lines, found 0`, so its iOS 26.5 section did not run.
  - Cause: `74a2e1841` moved that `NSLog` into `notify`. The generated AppDelegate uses `super || RCTLinkingManager`. `super` returned false, `RCTLinkingManager` posted `RCTOpenURLNotification`, and `notify` was skipped. The log count of 0 matches the dedupe. The script was still requiring 2 lines.
  - Cold and warm `openurl` both reached JS and both showed the Expo Router screen "Route not found". Notify `NSLog` was 0 on both. The Atmos process log contained neither the URL nor `scene-lifecycle-probe`. `CoreSimulatorBridge` did print the URL.
  - iOS 26.5 used that same Release `.app` (iphonesimulator SDK 27.0), installed manually on iPhone 17 Pro. Cold launch did not crash. Cold and warm deep links reached the same "Route not found" screen. Notify `NSLog` was 0. No regression.
  - S8 AppState pass. iOS 27: two rounds, process not terminated between them. Each round JS `AppState` was `active`, `inactive`, `background`, `active`, matching the native events. iOS 26.5: one control round, same sequence. The JS sequence used a temporary `console.error` that was removed and is not in the tree. Session reconnect **not run**: the simulator was not paired, and the Atmos process had no relay or WebSocket log during S8.
  - The revised script, which judges `ATMOS_ROUTE unmatched` instead of the notify `NSLog`, is **not run** on a simulator.
- Undelivered-URL proof, on this commit, Linux only: `cd apps/mobile && bun test script/scene-deep-link-evidence.test.js`. Empty logs and a warm open that does not add a marker fail the judge. The CLI test writes two logs that contain only a `CoreSimulatorBridge` URL line and expects exit 1 with `FAIL deep link: cold open did not reach`. A temporary edit that deleted the `cold < 1` and `total <= cold` checks made that suite exit 1: `fails when nothing reached the unmatched route` got `Expected: false` / `Received: true`, and the CLI test got `Expected: 1` / `Received: 0`. Restoring those checks made the file exit 0. Native `UIOpenURLAction` lines with no marker also fail.

### Status

| Scenario | Status                                                                                                                                                                                                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1       | pass — `plugins/with-ios-scene-lifecycle.test.js`                                                                                                                                                                                                                                                                           |
| S2       | pass — `verify-ios-scene-lifecycle.sh structural` after prebuild, including the parity-preview prebuild                                                                                                                                                                                                                     |
| S3       | pass — GitHub `ios-simulator` on run 39236707389 (`74a2e1841`, iOS 26.5 Release, built plist `Atmos.SceneDelegate`, parity capture). PNGs were not downloaded here.                                                                                                                                                         |
| S4       | partial — on `42801c19` cold and warm both reached "Route not found". Notify `NSLog` was 0 and the Atmos process log had no URL. The script on that SHA exited 1 because it still required two notify lines. The new `ATMOS_ROUTE unmatched` judge is unit-tested here and not run on a simulator. Universal links not_run. |
| S5       | pass — unit test (user-activity keys and `scene(_:continue:)`). Universal-link end to end not_run.                                                                                                                                                                                                                          |
| S6       | partial — iOS 27 cold start on `42801c19` passed with 0 new Atmos `.ips`. iOS 26.5 passed by installing that same Release `.app` manually. The script exited before its own iOS 26.5 section. GitHub iOS 26.5 parity of `74a2e1841` also passed.                                                                            |
| S7       | pass — `app.config.test.js` keeps `UIApplicationSceneManifest` and `./plugins/with-ios-scene-lifecycle.js` under `EXPO_PUBLIC_PARITY_PREVIEW=1`.                                                                                                                                                                            |
| S8       | pass — `42801c19` AppState. iOS 27: two rounds. iOS 26.5: one control round. Each round was `active`, `inactive`, `background`, `active`, matching the native events. The temporary JS log was not committed. Session reconnect not_run (simulator not paired).                                                             |
