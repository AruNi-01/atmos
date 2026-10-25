import type { MobileThemeColorScheme } from "@/theme/colors";

export type MobileThemePreference = "system" | "light" | "dark";
export type SystemColorScheme = "light" | "dark" | "unspecified" | null | undefined;
/** Value passed to `Appearance.setColorScheme`. `unspecified` follows the OS. */
export type NativeColorSchemeName = "light" | "dark" | "unspecified";

export const themePreferenceOptions: Array<{ label: string; value: MobileThemePreference }> = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

export function resolveMobileThemePreference(
  preference: MobileThemePreference,
  systemColorScheme: SystemColorScheme,
): MobileThemeColorScheme {
  if (preference === "dark" || preference === "light") return preference;
  return systemColorScheme === "dark" ? "dark" : "light";
}

/**
 * Native chrome (navbar, popover, alerts) reads the window style, not the JS
 * palette. `system` clears the override so those controls follow the OS.
 */
export function nativeColorSchemeForPreference(
  preference: MobileThemePreference,
): NativeColorSchemeName {
  if (preference === "system") return "unspecified";
  return preference;
}
