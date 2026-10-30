// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { existsSync, readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(here, "../../..");

function source(relative: string): string {
  return readFileSync(join(mobileRoot, relative), "utf8");
}

describe("liquid glass surface policy", () => {
  test("does not ship the private UITabBar _glassEffect swizzle", () => {
    const app = source("app.json");
    expect(app).not.toContain("with-ios-clear-tab-bar");
    expect(existsSync(join(mobileRoot, "plugins/with-ios-clear-tab-bar.js"))).toBe(false);
    expect(source("script/verify-ios-scene-lifecycle.sh")).not.toContain(
      "HomeTabBarClearGlass.install()",
    );
    expect(source("script/verify-ios-scene-lifecycle.sh")).toContain("HomeTabBarClearGlass");
  });

  test("keeps one adaptive-glass provider on Android and none nested in home tabs", () => {
    const root = source("app/_layout.tsx");
    const home = source("app/(home)/_layout.tsx");
    const androidRoot = source("src/ui/primitives/android-glass-root.android.tsx");
    const iosRoot = source("src/ui/primitives/android-glass-root.tsx");
    expect(root).toContain("AndroidGlassRoot");
    expect(root).not.toContain("@rbayuokt/expo-adaptive-glass");
    expect(root.match(/<GlassProvider/g)).toBeNull();
    expect(home).not.toContain("GlassProvider");
    expect(home).not.toContain("@rbayuokt/expo-adaptive-glass");
    expect(androidRoot).toContain('<GlassProvider clarity={0} quality="ultra">');
    expect(androidRoot.match(/<GlassProvider/g)).toHaveLength(1);
    expect(iosRoot).not.toContain("GlassProvider");
    expect(iosRoot).not.toContain("@rbayuokt/expo-adaptive-glass");
  });

  test("keeps adaptive-glass off iOS control paths", () => {
    expect(source("app/(home)/android-home-tabs.tsx")).not.toContain(
      "@rbayuokt/expo-adaptive-glass",
    );
    expect(source("app/(home)/android-home-tabs.tsx")).toContain('from "expo-router"');
    expect(source("app/(home)/android-home-tabs.tsx")).not.toContain("return null");
    expect(source("app/(home)/android-home-tabs.android.tsx")).toContain(
      "@rbayuokt/expo-adaptive-glass/navigation",
    );
    expect(source("app/(home)/android-home-tabs.android.tsx")).not.toContain("GlassProvider");
    expect(source("src/features/terminal/terminal-tab-track.tsx")).not.toContain(
      "@rbayuokt/expo-adaptive-glass",
    );
    expect(source("src/features/terminal/terminal-tab-track.tsx")).toContain("GlassPanel");
    expect(source("src/features/terminal/terminal-tab-track.android.tsx")).toContain("GlassTabBar");
    expect(source("src/features/terminal/workspace-switcher-trigger.tsx")).toContain("GlassPanel");
    expect(source("src/features/terminal/workspace-switcher-trigger.tsx")).not.toContain(
      "@rbayuokt/expo-adaptive-glass",
    );
    expect(source("src/features/terminal/WorkspaceSwitcherPopover.tsx")).toContain(
      'overflow: "visible"',
    );
    expect(source("src/features/terminal/workspace-switcher-trigger.android.tsx")).toContain(
      "GlassSurface",
    );
    expect(source("src/features/terminal/TerminalTabsBar.tsx")).not.toContain(
      "@rbayuokt/expo-adaptive-glass",
    );
    expect(source("src/features/terminal/WorkspaceSwitcherPopover.tsx")).not.toContain(
      "@rbayuokt/expo-adaptive-glass",
    );
    expect(source("src/features/terminal/TerminalTabActions.ios.tsx")).toContain("glassEffect(");
    expect(source("src/features/terminal/TerminalTabActions.ios.tsx")).not.toContain(
      "@rbayuokt/expo-adaptive-glass",
    );
  });
});
