const { withAppDelegate } = require("expo/config-plugins");

const MARKER = "Atmos pins the home tab bar to clear glass";

const SWIFT_BLOCK = `
// ${MARKER}.
// The system platter owns a UIGlassEffect and ignores a replacement effect,
// keeping the device style. The style field on that live effect is what draws.
private enum HomeTabBarClearGlass {
  static func install() {
    guard #available(iOS 26.0, *) else { return }
    let original = #selector(UITabBar.layoutSubviews)
    let replacement = #selector(UITabBar.atmos_layoutSubviewsPinningClearGlass)
    guard let current = class_getInstanceMethod(UITabBar.self, original),
      let pinned = class_getInstanceMethod(UITabBar.self, replacement)
    else { return }
    method_exchangeImplementations(current, pinned)
  }
}

extension UITabBar {
  @objc func atmos_layoutSubviewsPinningClearGlass() {
    atmos_layoutSubviewsPinningClearGlass()
    guard #available(iOS 26.0, *) else { return }
    for subview in subviews {
      let name = NSStringFromClass(type(of: subview))
      guard name.contains("ItemPlatterView"),
        subview.responds(to: NSSelectorFromString("_glassEffect")),
        let effect = subview.perform(NSSelectorFromString("_glassEffect"))?.takeUnretainedValue() as? UIGlassEffect,
        let style = class_getInstanceVariable(UIGlassEffect.self, "_style")
      else { continue }
      let slot = Unmanaged.passUnretained(effect).toOpaque()
        .advanced(by: ivar_getOffset(style))
        .assumingMemoryBound(to: Int.self)
      let clear = Int(UIGlassEffect.Style.clear.rawValue)
      if slot.pointee != clear {
        slot.pointee = clear
      }
    }
  }
}
`;

function ensureClearHomeTabBar(contents) {
  if (contents.includes(MARKER)) return contents;
  const start = contents.indexOf("didFinishLaunchingWithOptions launchOptions:");
  if (start < 0) {
    throw new Error("AppDelegate is missing didFinishLaunchingWithOptions, so clear tab bar glass cannot be installed.");
  }
  const brace = contents.indexOf("{", start);
  if (brace < 0) {
    throw new Error("AppDelegate didFinishLaunchingWithOptions has no body.");
  }
  let next = `${contents.slice(0, brace + 1)}\n    HomeTabBarClearGlass.install()\n${contents.slice(brace + 1)}`;
  if (!next.includes("import UIKit")) {
    const firstLineEnd = next.indexOf("\n");
    next = `${next.slice(0, firstLineEnd)}\nimport UIKit${next.slice(firstLineEnd)}`;
  }
  return `${next}\n${SWIFT_BLOCK}`;
}

function withIosClearTabBar(config) {
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift") return mod;
    mod.modResults.contents = ensureClearHomeTabBar(mod.modResults.contents);
    return mod;
  });
}

module.exports = withIosClearTabBar;
module.exports.ensureClearHomeTabBar = ensureClearHomeTabBar;
