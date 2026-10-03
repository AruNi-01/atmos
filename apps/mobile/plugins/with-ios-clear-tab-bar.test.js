const { describe, expect, test } = require("bun:test");
const { ensureClearHomeTabBar } = require("./with-ios-clear-tab-bar");

const DELEGATE = `import Expo
import React

@main
class AppDelegate: ExpoAppDelegate {
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

describe("ensureClearHomeTabBar", () => {
  test("installs clear glass before the tab bar is created", () => {
    const next = ensureClearHomeTabBar(DELEGATE);
    expect(next).toContain("import UIKit");
    expect(next).toContain("HomeTabBarClearGlass.install()");
    expect(next).toContain("UIGlassEffect.Style.clear");
    expect(next.indexOf("HomeTabBarClearGlass.install()")).toBeLessThan(
      next.indexOf("return super.application"),
    );
  });

  test("leaves an already patched AppDelegate unchanged", () => {
    const once = ensureClearHomeTabBar(DELEGATE);
    expect(ensureClearHomeTabBar(once)).toBe(once);
  });

  test("refuses an AppDelegate Expo did not generate", () => {
    expect(() => ensureClearHomeTabBar("import UIKit\n")).toThrow(/didFinishLaunchingWithOptions/);
  });
});
