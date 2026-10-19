const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const MARKER = "Atmos adopts the UIScene lifecycle";
const WINDOW_LINE = "window = UIWindow(frame: UIScreen.main.bounds)";

const SCENE_DELEGATE_CLASS = "$(PRODUCT_MODULE_NAME).SceneDelegate";

function sceneManifest() {
  return {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: "Default Configuration",
          UISceneDelegateClassName: SCENE_DELEGATE_CLASS,
        },
      ],
    },
  };
}

function removeAppDelegateWindow(contents) {
  const windowAt = contents.indexOf(WINDOW_LINE);
  if (windowAt < 0) {
    throw new Error(
      "AppDelegate is missing UIWindow(frame: UIScreen.main.bounds), so the scene lifecycle cannot move window setup.",
    );
  }
  const ifAt = contents.lastIndexOf("#if os(iOS) || os(tvOS)", windowAt);
  const endMarker = "#endif";
  const endAt = contents.indexOf(endMarker, windowAt);
  if (ifAt < 0 || endAt < 0) {
    throw new Error("AppDelegate window block is not wrapped in the Expo iOS #if.");
  }
  const block = contents.slice(ifAt, endAt + endMarker.length);
  if (!block.includes("factory.startReactNative(") || !block.includes('withModuleName: "main"')) {
    throw new Error("AppDelegate window block does not start React Native.");
  }
  const replacement = [
    "    // The iOS 27 SDK rejects an app that still creates its window here.",
    "    // SceneDelegate creates the UIWindow and starts React Native.",
  ].join("\n");
  return contents.slice(0, ifAt) + replacement + contents.slice(endAt + endMarker.length);
}

function ensureSceneLifecycle(contents) {
  if (contents.includes(MARKER)) {
    if (contents.includes(WINDOW_LINE)) {
      throw new Error("AppDelegate still creates a UIWindow after the scene lifecycle marker.");
    }
    return contents;
  }
  const next = removeAppDelegateWindow(contents);
  if (!next.includes("RCTLinkingManager.application")) {
    throw new Error("AppDelegate no longer forwards links to RCTLinkingManager.");
  }
  return `${next}\n${SCENE_SOURCE}`;
}

function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = sceneManifest();
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift") {
      throw new Error("Atmos scene lifecycle requires the Swift AppDelegate.");
    }
    mod.modResults.contents = ensureSceneLifecycle(mod.modResults.contents);
    return mod;
  });
}

const SCENE_SOURCE = `// ${MARKER}.
// iOS 27 terminates a binary that still owns its window from the app delegate.
// URLs and browsing-web activities are delivered here, then to RCTLinkingManager.
// The class name must stay SceneDelegate with no custom @objc name so
// $(PRODUCT_MODULE_NAME).SceneDelegate resolves.

private enum SceneLinking {
  static let openURLNotification = Notification.Name("RCTOpenURLNotification")

  static func launchOptions(
    from connectionOptions: UIScene.ConnectionOptions
  ) -> [UIApplication.LaunchOptionsKey: Any]? {
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url = connectionOptions.urlContexts.first?.url {
      let urlKey = UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsURLKey")
      launchOptions[urlKey] = url
    }
    if let activity = connectionOptions.userActivities.first(where: {
      $0.activityType == NSUserActivityTypeBrowsingWeb
    }) {
      let activityKey = UIApplication.LaunchOptionsKey(
        rawValue: "UIApplicationLaunchOptionsUserActivityDictionaryKey")
      launchOptions[activityKey] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity,
      ]
    }
    return launchOptions.isEmpty ? nil : launchOptions
  }

  static func openURLOptions(
    from sceneOptions: UIScene.OpenURLOptions
  ) -> [UIApplication.OpenURLOptionsKey: Any] {
    var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    if let sourceApplication = sceneOptions.sourceApplication {
      options[.sourceApplication] = sourceApplication
    }
    if let annotation = sceneOptions.annotation {
      options[.annotation] = annotation
    }
    options[.openInPlace] = sceneOptions.openInPlace
    return options
  }

  /// Runs body, then notify unless RCTLinkingManager already posted for this URL.
  /// A nil URL only runs body. The app delegate override calls RCTLinkingManager itself.
  static func deliver(
    url: URL?,
    during body: () -> Void,
    notify: () -> Void
  ) {
    guard let url else {
      body()
      return
    }
    let observer = LinkingManagerObserver(expectedURL: url.absoluteString)
    body()
    if !observer.wasNotified {
      notify()
    }
  }
}

private final class LinkingManagerObserver: NSObject {
  private let expectedURL: String
  private(set) var wasNotified = false

  init(expectedURL: String) {
    self.expectedURL = expectedURL
    super.init()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(linkingManagerDidOpenURL(_:)),
      name: SceneLinking.openURLNotification,
      object: nil)
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  @objc private func linkingManagerDidOpenURL(_ notification: Notification) {
    wasNotified = wasNotified || notification.userInfo?["url"] as? String == expectedURL
  }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else {
      fatalError(
        "SceneDelegate could not start React Native. AppDelegate must create reactNativeFactory in didFinishLaunchingWithOptions."
      )
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: SceneLinking.launchOptions(from: connectionOptions))

    for context in connectionOptions.urlContexts {
      deliverOpen(context.url, options: SceneLinking.openURLOptions(from: context.options), appDelegate: appDelegate)
    }
    for activity in connectionOptions.userActivities {
      deliverContinue(activity, appDelegate: appDelegate)
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts {
      deliverOpen(context.url, options: SceneLinking.openURLOptions(from: context.options), appDelegate: appDelegate)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    deliverContinue(userActivity, appDelegate: appDelegate)
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?
      .applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?
      .applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?
      .applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?
      .applicationDidEnterBackground(UIApplication.shared)
  }

  private func deliverOpen(
    _ url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any],
    appDelegate: AppDelegate
  ) {
    SceneLinking.deliver(url: url, during: {
      _ = appDelegate.application(UIApplication.shared, open: url, options: options)
    }, notify: {
      _ = RCTLinkingManager.application(UIApplication.shared, open: url, options: options)
    })
    NSLog("AtmosSceneLifecycle delivered URL to RCTLinkingManager")
  }

  private func deliverContinue(_ userActivity: NSUserActivity, appDelegate: AppDelegate) {
    SceneLinking.deliver(url: userActivity.webpageURL, during: {
      _ = appDelegate.application(
        UIApplication.shared,
        continue: userActivity,
        restorationHandler: { _ in })
    }, notify: {
      _ = RCTLinkingManager.application(
        UIApplication.shared,
        continue: userActivity,
        restorationHandler: { _ in })
    })
    if userActivity.webpageURL != nil {
      NSLog("AtmosSceneLifecycle delivered userActivity to RCTLinkingManager")
    }
  }
}
`;

module.exports = withIosSceneLifecycle;
module.exports.ensureSceneLifecycle = ensureSceneLifecycle;
module.exports.sceneManifest = sceneManifest;
module.exports.MARKER = MARKER;
module.exports.SCENE_DELEGATE_CLASS = SCENE_DELEGATE_CLASS;
