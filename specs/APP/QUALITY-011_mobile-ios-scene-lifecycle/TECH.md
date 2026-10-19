# TECH · QUALITY-011: Mobile iOS 27 UIScene lifecycle

> Technical Design · HOW. Cold start of `apps/mobile` on the iOS 27 SDK dies in UIKit before JavaScript runs. This spec adopts the scene lifecycle without an Expo SDK upgrade.

## Scope summary

Adopt the UIKit scene lifecycle for the Expo SDK 56 mobile app so a Release build cold-starts on iOS 27.0, and so custom-scheme URLs and browsing-web user activities still reach `RCTLinkingManager`. iOS 26.5 must keep launching and painting.

This is an engineering crash fix, not a product feature. Out of scope:

- An Expo SDK 57/58 or React Native upgrade.
- New universal-link domains. The app has no `associatedDomains` today. The scene delegate still forwards `NSUserActivityTypeBrowsingWeb` so a later domain does not need a second lifecycle change.
- Android, web, theme, or Agent Chat behavior.
- Hand-editing generated `apps/mobile/ios`. That tree stays gitignored and is produced by `expo prebuild`.

## Verified root cause

Checked on `main` at `52ee1365561954475faebedcb3f32c8711852908` (same commit as `origin/main` after fetch), then `CI=1 bunx expo prebuild --platform ios --no-install` in `apps/mobile`.

The reported hypothesis is not what this tree does.

| Check                                                             | Result                                                                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/app.json` `ios.infoPlist.UIApplicationSceneManifest` | Absent. `ios-launch-scene.test.js` asserts it stays absent.                                                          |
| Generated `ios/Atmos/Info.plist`                                  | No `UIApplicationSceneManifest`, no `UISceneDelegateClassName`.                                                      |
| Generated Swift                                                   | Only `ios/Atmos/AppDelegate.swift`. No `SceneDelegate` type.                                                         |
| Window owner                                                      | `didFinishLaunchingWithOptions` builds `UIWindow(frame: UIScreen.main.bounds)` and calls `factory.startReactNative`. |

UIKit's `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` fires when a binary built with the iOS 27 SDK has not adopted scenes. That matches this project: there is no scene manifest and the app delegate still owns the window. An earlier black window (manifest named `Atmos.SceneDelegate`, class never generated) was removed on purpose. Removing the manifest fixed iOS 26 and left the app illegal on the iOS 27 SDK. See Expo issue [expo/expo#46663](https://github.com/expo/expo/issues/46663) and Apple TN3187.

`apps/mobile/app.config.js` still deletes `UIApplicationSceneManifest` when `EXPO_PUBLIC_PARITY_PREVIEW=1`, and `.github/workflows/ci-mobile-ios-parity.yml` fails the job if the plist names a scene delegate. Both guards assumed Expo would never generate the class. They must be inverted once the class exists, or the parity build either crashes on iOS 27 or boots with no window.

## Decision

Stay on Expo SDK 56 (`expo ~56.0.12`, `react-native 0.85.3`). Add one config plugin that mirrors the scene lifecycle Expo later shipped in SDK 58 (`ExpoAppSceneDelegate` + `SceneEventForwarder`), using only APIs that exist in SDK 56.

Rejected:

| Option                                                         | Why not                                                                                                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Expo SDK 58, scenes on by default                              | React Native 0.87, strict TypeScript deep-import break, template and module churn across mobile. Not required to create a window from a scene. |
| Expo SDK 57 + `expo-build-properties` `ios.enableSceneSupport` | Still a full SDK bump (CLI currently suggests 57.0.7 / RN 0.86). The opt-in depends on `ExpoAppSceneDelegate`, which SDK 56 does not export.   |
| Put `UIApplicationSceneManifest` back in `app.json` only       | Prebuild still emits no `SceneDelegate`. That is the old black-window bug.                                                                     |
| Edit `ios/` and commit it                                      | `apps/mobile/.gitignore` ignores `/ios`. The next prebuild would drop the class.                                                               |

SDK 56's `ExpoReactNativeFactory` inherits `startReactNative(withModuleName:in:launchOptions:)` from `RCTReactNativeFactory` and does not override it. Launch options passed there become `bridge.launchOptions`, which `RCTLinkingManager.getInitialURL` reads.

## Architecture

```text
app.json plugins
  plugins/with-ios-clear-tab-bar.js          (unchanged; still patches didFinishLaunching)
  plugins/with-ios-scene-lifecycle.js        (new)
        │
        ▼
expo prebuild --platform ios
        │
        ├─ Info.plist UIApplicationSceneManifest
        │     UISceneDelegateClassName = $(PRODUCT_MODULE_NAME).SceneDelegate
        │     UIApplicationSupportsMultipleScenes = false
        │
        └─ ios/Atmos/AppDelegate.swift
              AppDelegate.didFinishLaunching
                creates ExpoReactNativeFactory only
                does not allocate UIWindow
              class SceneDelegate: UIWindowSceneDelegate
                UIWindow(windowScene:) + startReactNative
                forwards URLs / user activities to AppDelegate, then RCTLinkingManager
```

The scene class lives in `AppDelegate.swift` so the Xcode project does not gain a file reference. `PRODUCT_NAME` is `Atmos`, so the expanded class name is `Atmos.SceneDelegate`. The Swift type must stay `class SceneDelegate` with no custom `@objc` name.

`with-ios-clear-tab-bar.js` keeps injecting `HomeTabBarClearGlass.install()` at the start of `didFinishLaunchingWithOptions`. The scene plugin only deletes the `UIWindow(frame:)` / `startReactNative` block.

Parity preview (`EXPO_PUBLIC_PARITY_PREVIEW=1`) still drops `expo-dev-client`. It must not drop the scene manifest. Window creation no longer happens in the app delegate, so a preview build without a scene would have no window on every iOS version.

## Module design

### `apps/mobile/plugins/with-ios-scene-lifecycle.js`

Pure helpers, unit-tested without prebuild:

- `sceneManifest()` — plist dictionary written by `withInfoPlist`.
- `ensureSceneLifecycle(contents)` — rewrites the Swift AppDelegate. When the marker `Atmos adopts the UIScene lifecycle` is present, `UIWindow(frame:` is gone, and `class SceneDelegate: UIResponder, UIWindowSceneDelegate` is still in the file, it returns the same string. If the marker is present and that class line is missing, it deletes from the marker comment through the end of the file and writes the scene source again. It does not treat a marker alone as success. Throws if the Expo window block is missing, or if the marker and the old window block are both present.

`withAppDelegate` runs only for Swift and throws otherwise. The current template is Swift.

### Scene delegate behavior

`scene(_:willConnectTo:options:)`:

1. Require a `UIWindowScene`, `AppDelegate`, and `reactNativeFactory`. Otherwise `fatalError` (a silent return is a black window).
2. Allocate `UIWindow(windowScene:)`, assign it to the scene delegate and `appDelegate.window` (readers such as `UIApplication.shared.delegate?.window` keep working).
3. Call `factory.startReactNative(withModuleName: "main", in: window, launchOptions:)`.
4. Rebuild launch options from connection options, not from `didFinishLaunching` launch options. Under scenes UIKit does not put the cold-start URL there.
5. Forward every `connectionOptions.urlContexts` entry and every `connectionOptions.userActivities` entry.

`scene(_:openURLContexts:)` forwards each warm URL.

`scene(_:continue:)` forwards a warm user activity.

Scene active / resign / foreground / background call the matching `ExpoAppDelegate` methods. SDK 56 subscribers (`expo-linking`, `expo-dev-launcher`, and the rest) only observe app-delegate callbacks. UIKit stops delivering those once a scene manifest is present. This is the same split Expo's `SceneEventForwarder` documents.

`sceneDidDisconnect` sets `window = nil`. UIKit calls it when the scene session is discarded. A single-scene iPhone rarely does that.

`RCTAppState` in React Native 0.85.3 observes `UIApplicationDidBecomeActiveNotification`, `UIApplicationWillResignActiveNotification`, `UIApplicationDidEnterBackgroundNotification`, and `UIApplicationWillEnterForegroundNotification`. Calling the app-delegate methods does not post those notifications. UIKit may still post them under a scene lifecycle. That has not been checked on a simulator. See TEST S8.

No shortcut-item forwarding. The app has no quick actions.

### Deep links into `RCTLinkingManager`

Generated `AppDelegate` already contains:

```swift
return super.application(app, open: url, options: options)
  || RCTLinkingManager.application(app, open: url, options: options)
```

and the universal-link override, which always calls `RCTLinkingManager.application(_:continue:restorationHandler:)` before `super`.

`super` reaches `ExpoAppDelegate` subscribers (`LinkingAppDelegateSubscriber`, `ExpoDevLauncherAppDelegateSubscriber`). `expo-dev-launcher`'s `onDeepLink` returns true for an external URL while the app is not yet running, and the `||` then skips `RCTLinkingManager`. The scene forwarder must not depend on that return value.

Delivery rule, copied from Expo's `LinkingManagerObserver`:

1. Register for `Notification.Name("RCTOpenURLNotification")` (the name `RCTLinkingManager.mm` posts; it is not a public header).
2. Call the app delegate method so subscribers still run.
3. If that call did not post the notification for this URL, call `RCTLinkingManager` directly.

Cold start, custom scheme (`atmos://…`, also `land.atmos.mobile` and `exp+atmos-mobile` from the generated URL types):

- `connectionOptions.urlContexts` supplies the URL.
- Launch options include `UIApplicationLaunchOptionsURLKey` so `RCTLinkingManager.getInitialURL` returns it. The `url` event can fire before JavaScript subscribes; the launch-options path is what `Linking.getInitialURL()` uses.
- The same URL is then delivered through the rule above, so a subscriber that swallowed the delegate return cannot drop `RCTLinkingManager`.

Warm open:

- `scene(_:openURLContexts:)` uses the same rule. JavaScript is already listening, so the notification becomes the `url` event.

Universal links (not configured; path still implemented):

- Cold: the first `NSUserActivityTypeBrowsingWeb` activity is stored under `UIApplicationLaunchOptionsUserActivityDictionaryKey` with `UIApplicationLaunchOptionsUserActivityTypeKey` and `UIApplicationLaunchOptionsUserActivityKey`. That is the dictionary `getInitialURL` reads.
- Cold and warm: `scene` connection user activities and `scene(_:continue:)` go through the same dedupe rule. `RCTLinkingManager` posts only for browsing-web activities that have a `webpageURL`.

Keys are built with `UIApplication.LaunchOptionsKey(rawValue:)` so the code does not touch the iOS 26-deprecated `.url` accessor. React Native 0.85 still reads the raw strings.

The fixed `NSLog` strings sit inside the `notify` closure, so they run only when this path calls `RCTLinkingManager`. A body that already posted `RCTOpenURLNotification` does not log. The strings do not include the URL:

- `AtmosSceneLifecycle delivered URL to RCTLinkingManager`
- `AtmosSceneLifecycle delivered userActivity to RCTLinkingManager`

The Mac script greps for the URL line. That count is the scene path's own `RCTLinkingManager` call, not a log that always prints after `deliver`. The 2026-10-19 simulator run was the older unconditional log. This placement has not been run on a simulator.

## Info.plist shape

```xml
<key>UIApplicationSceneManifest</key>
<dict>
  <key>UIApplicationSupportsMultipleScenes</key>
  <false/>
  <key>UISceneConfigurations</key>
  <dict>
    <key>UIWindowSceneSessionRoleApplication</key>
    <array>
      <dict>
        <key>UISceneConfigurationName</key>
        <string>Default Configuration</string>
        <key>UISceneDelegateClassName</key>
        <string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>
      </dict>
    </array>
  </dict>
</dict>
```

Single scene. `supportsTablet: true` stays. iOS 27 resizability does not require multiple scenes.

## Rollout

1. Register this spec.
2. Land the config plugin, point `app.json` at it, stop parity config from deleting the manifest, and invert the parity workflow gate.
3. Prove the rewrite with `bun test` and a Linux `expo prebuild` plus `script/verify-ios-scene-lifecycle.sh structural`.
4. Mac Release builds on iOS 27.0 and iOS 26.5 run the simulator mode of that script. This environment cannot run them.

## Risks & tradeoffs

- **Class name lookup.** If Xcode expands the plist to something other than `Atmos.SceneDelegate`, UIKit creates an empty scene and the screen stays black. The built-plist check expects exactly `Atmos.SceneDelegate`. The Swift class must not gain `@objc(SceneDelegate)`.
- **Lifecycle forwarded twice.** If a future iOS still calls both scene and app-delegate lifecycle methods, subscribers run twice. URL delivery is deduped. Lifecycle is not. Splash and dev-menu code in SDK 56 is idempotent enough that a double active/resign should not blank the window. The iOS 26.5 parity job is the regression net for painting.
- **Debug + `expo-dev-launcher`.** The launcher stores an external cold URL as a pending deep link and returns true. We still call `RCTLinkingManager` when that happens. A debug cold start can therefore surface the URL both as `getInitialURL` and as the launcher's pending link. Release parity builds exclude the dev client. Do not "fix" that by removing the direct `RCTLinkingManager` call.
- **Template drift.** `ensureSceneLifecycle` throws when the `UIWindow(frame: UIScreen.main.bounds)` block disappears from the Expo template. Prebuild fails instead of shipping an app delegate that still owns the window.
- **Rollback.** Revert the plugin and the iOS 27 crash returns. Do not restore a workflow gate that fails when `Info.plist` contains `UISceneDelegateClassName`. After #326 landed on main, this branch keeps that PR's `concurrency` group and the `ios-parity` label gate on `ios-simulator`. The job still requires `Atmos.SceneDelegate` through `verify-ios-scene-lifecycle.sh structural` and `built-plist`. `specs/README.md` keeps QUALITY-009, QUALITY-010, and QUALITY-011 in that order.
- **AppState.** Scene method forwarding and `RCTAppState`'s notification observers are different channels. S8 is pending.

## Dependencies & compatibility

- Expo SDK 56.0.x, React Native 0.85.3, deployment target 16.4 (already the app minimum; scenes exist since iOS 13).
- No new package and no `NOTICE` entry.
- Does not change Hub OAuth, `expo-web-browser`, or the `atmos` scheme. Those URLs now arrive through the scene callbacks instead of `application(_:open:options:)`.

## Open questions

- None for this fix. Whether to move the whole app to Expo SDK 58 is a separate upgrade.
