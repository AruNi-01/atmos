const { describe, expect, test } = require("bun:test");
const {
  MARKER,
  SCENE_CLASS_LINE,
  SCENE_DELEGATE_CLASS,
  ensureSceneLifecycle,
  sceneManifest,
} = require("./with-ios-scene-lifecycle");

const FIXTURE = `internal import Expo
import UIKit
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}
`;

function launchBody(source) {
  const start = source.indexOf("didFinishLaunchingWithOptions");
  const end = source.indexOf("// Linking API");
  return source.slice(start, end);
}

function balancedBlock(source, openBraceAt) {
  let depth = 0;
  for (let index = openBraceAt; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openBraceAt + 1, index);
    }
  }
  throw new Error("unbalanced braces");
}

function swiftFunctionBody(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`missing ${signature}`);
  const open = source.indexOf("{", start);
  return balancedBlock(source, open);
}

/** Fails when notify() runs even if RCTLinkingManager already posted. */
function expectNotifyOnlyWhenLinkingManagerDidNotPost(source) {
  const deliver = swiftFunctionBody(source, "static func deliver(");
  const guard = "if !observer.wasNotified {";
  const guardAt = deliver.indexOf(guard);
  expect(guardAt).toBeGreaterThan(-1);
  const bodyCall = deliver.indexOf("body()");
  expect(bodyCall).toBeGreaterThan(-1);
  expect(bodyCall).toBeLessThan(guardAt);
  const guardBody = balancedBlock(deliver, deliver.indexOf("{", guardAt));
  expect(guardBody).toContain("notify()");
  const outsideGuard = `${deliver.slice(0, guardAt)}${deliver.slice(guardAt + guard.length + guardBody.length + 1)}`;
  expect(outsideGuard).not.toContain("notify()");
}

function expectLogOnlyInsideNotify(source, signature, logLine) {
  const fn = swiftFunctionBody(source, signature);
  const notifyAt = fn.indexOf("notify: {");
  expect(notifyAt).toBeGreaterThan(-1);
  const notifyBody = balancedBlock(fn, fn.indexOf("{", notifyAt));
  expect(notifyBody).toContain("RCTLinkingManager.application");
  expect(notifyBody).toContain(logLine);
  const outsideNotify = `${fn.slice(0, notifyAt)}${fn.slice(notifyAt + "notify: ".length + notifyBody.length + 2)}`;
  expect(outsideNotify).not.toContain("NSLog(");
}

describe("ensureSceneLifecycle", () => {
  test("moves React Native startup onto SceneDelegate and keeps link forwarding", () => {
    const next = ensureSceneLifecycle(FIXTURE);
    const launch = launchBody(next);

    expect(launch).not.toContain("HomeTabBarClearGlass");
    expect(launch).not.toContain("factory.startReactNative");
    expect(launch).not.toContain("UIWindow(frame:");
    expect(next).toContain("class SceneDelegate: UIResponder, UIWindowSceneDelegate");
    expect(next).not.toContain("@objc(SceneDelegate)");
    expect(next).toContain("UIWindow(windowScene: windowScene)");
    expect(next).toContain('withModuleName: "main"');
    expect(next).toContain("appDelegate.window = window");
    expect(next).toContain(
      "func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>)",
    );
    expect(next).toContain("for context in connectionOptions.urlContexts");
    expect(next).toContain("for activity in connectionOptions.userActivities");
    expect(next).toContain("func scene(_ scene: UIScene, continue userActivity: NSUserActivity)");
    expect(next).toContain("UIApplicationLaunchOptionsURLKey");
    expect(next).toContain("UIApplicationLaunchOptionsUserActivityDictionaryKey");
    expect(next).toContain("UIApplicationLaunchOptionsUserActivityTypeKey");
    expect(next).toContain("UIApplicationLaunchOptionsUserActivityKey");
    expect(next).toContain("NSUserActivityTypeBrowsingWeb");
    expect(next).toContain('Notification.Name("RCTOpenURLNotification")');
    expect(next).toContain(
      "RCTLinkingManager.application(UIApplication.shared, open: url, options: options)",
    );
    expect(next).toContain(
      "RCTLinkingManager.application(\n        UIApplication.shared,\n        continue: userActivity,",
    );
    expect(next).toContain("func sceneDidDisconnect(_ scene: UIScene)");
    expect(next).toContain("window = nil");
    expect(next).not.toContain('NSLog("%@');
    expectNotifyOnlyWhenLinkingManagerDidNotPost(next);
    expectLogOnlyInsideNotify(
      next,
      "private func deliverOpen(",
      "AtmosSceneLifecycle delivered URL to RCTLinkingManager",
    );
    expectLogOnlyInsideNotify(
      next,
      "private func deliverContinue(",
      "AtmosSceneLifecycle delivered userActivity to RCTLinkingManager",
    );
    expect(next.match(/startReactNative\(/g)).toHaveLength(1);
    expect(launch.indexOf("let delegate = ReactNativeDelegate()")).toBeLessThan(
      launch.indexOf("return super.application"),
    );
  });

  test("leaves an already patched AppDelegate unchanged", () => {
    const once = ensureSceneLifecycle(FIXTURE);
    expect(ensureSceneLifecycle(once)).toBe(once);
  });

  test("rewrites SceneDelegate when the marker remains and the class is gone", () => {
    const once = ensureSceneLifecycle(FIXTURE);
    const broken = once.replace(/class SceneDelegate:[\s\S]*$/, "class SceneDelegateRemoved {}\n");
    expect(broken).toContain(MARKER);
    expect(broken).not.toContain(SCENE_CLASS_LINE);
    const again = ensureSceneLifecycle(broken);
    expect(again).toContain(SCENE_CLASS_LINE);
    expect(again.match(/class SceneDelegate:/g)).toHaveLength(1);
    expect(again).not.toContain("SceneDelegateRemoved");
    expect(again).toContain("func sceneDidDisconnect(_ scene: UIScene)");
    expectNotifyOnlyWhenLinkingManagerDidNotPost(again);
  });

  test("refuses an AppDelegate Expo did not generate", () => {
    expect(() => ensureSceneLifecycle("import UIKit\n")).toThrow(/UIWindow\(frame:/);
  });

  test("refuses a marker left next to the old window", () => {
    const broken = `${MARKER}\nwindow = UIWindow(frame: UIScreen.main.bounds)\n`;
    expect(() => ensureSceneLifecycle(broken)).toThrow(/still creates a UIWindow/);
  });
});

describe("sceneManifest", () => {
  test("names the module-qualified SceneDelegate and stays single-scene", () => {
    const manifest = sceneManifest();
    expect(manifest.UIApplicationSupportsMultipleScenes).toBe(false);
    const role = manifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication;
    expect(role).toHaveLength(1);
    expect(role[0].UISceneDelegateClassName).toBe(SCENE_DELEGATE_CLASS);
    expect(SCENE_DELEGATE_CLASS).toBe("$(PRODUCT_MODULE_NAME).SceneDelegate");
  });
});
