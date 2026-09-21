// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { getMobileThemeColors } from "@/theme/colors";
import { drawerPalette } from "./expo-drawer-theme";

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
