import type { MobileThemeColorScheme } from "@/theme/colors";

export type MobileThemePreference = "system" | "light" | "dark";
export type SystemColorScheme = "light" | "dark" | "unspecified" | null | undefined;

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
