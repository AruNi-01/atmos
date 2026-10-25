// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
import { getMobileThemeColors } from "@/theme/colors";
import { drawerContentFill, drawerPalette } from "./expo-drawer-theme";

describe("drawer content fill", () => {
  test("lets the iOS system sheet own the fill in both schemes", () => {
    expect(drawerContentFill("ios", true, "#1c1c1e")).toBeUndefined();
    expect(drawerContentFill("ios", true, "#f8f8f9")).toBeUndefined();
    expect(drawerContentFill("ios", false, "#1c1c1e")).toBeUndefined();
  });

  test("keeps the android rect when a fill is requested", () => {
    expect(drawerContentFill("android", true, "#1c1c1e")).toBe("#1c1c1e");
    expect(drawerContentFill("android", false, "#1c1c1e")).toBeUndefined();
  });
});

describe("drawer palette", () => {
  test("follows the app scheme when no overlay scheme is set", () => {
    const light = getMobileThemeColors("light");
    const palette = drawerPalette(light, "light");
    expect(palette.scheme).toBe("light");
    expect(palette.colors.sheetBackground).toBe(light.sheetBackground);
    expect(palette.isDark).toBe(false);
  });

  test("keeps a terminal overlay dark while the app is light", () => {
    const light = getMobileThemeColors("light");
    const dark = getMobileThemeColors("dark");
    const palette = drawerPalette(light, "light", "dark");
    expect(palette.scheme).toBe("dark");
    expect(palette.isDark).toBe(true);
    expect(palette.colors.sheetBackground).toBe(dark.sheetBackground);
    expect(palette.colors.cardElevated).toBe(dark.cardElevated);
    expect(palette.colors.label).toBe(dark.label);
    expect(palette.colors.sheetBackground).not.toBe(light.sheetBackground);
  });
});

describe("drawer sheet fill", () => {
  test("uses the system sheet fill and does not paint into the keyboard", () => {
    const source = readFileSync(new URL("./expo-drawer.tsx", import.meta.url), "utf8");
    expect(source).toContain("presentationBackground(palette.colors.sheetBackground)");
    expect(source).not.toContain("shapes.containerRelativeShape()");
    expect(source).not.toContain('ignoreSafeArea({ regions: "container" })');
  });
});
