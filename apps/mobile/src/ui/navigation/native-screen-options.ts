import { colors, type MobileThemeColors } from "@/theme/colors";

export function nativeLargeTitleOptions(title: string, themeColors: MobileThemeColors = colors) {
  return {
    title,
    headerLargeTitleEnabled: true,
    headerLargeTitleShadowVisible: false,
    headerTitleAlign: "center" as const,
    headerLargeTitleStyle: {
      color: themeColors.label,
      fontWeight: "800" as const,
    },
    headerTitleStyle: {
      color: themeColors.label,
      fontWeight: "700" as const,
    },
  };
}

export function nativeCompactTitleOptions(title: string, themeColors: MobileThemeColors = colors) {
  return {
    title,
    headerLargeTitleEnabled: false,
    headerTransparent: false,
    headerStyle: { backgroundColor: themeColors.background },
    headerTitleAlign: "center" as const,
    headerTitleStyle: {
      color: themeColors.label,
      fontWeight: "700" as const,
    },
  };
}

/** Compact header that matches the always-dark terminal surface. */
export function nativeTerminalTitleOptions(title: string, themeColors: MobileThemeColors = colors) {
  return {
    title,
    headerLargeTitleEnabled: false,
    headerTransparent: false,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: themeColors.terminalBg },
    headerTintColor: themeColors.terminalFg,
    headerTitleAlign: "center" as const,
    headerTitleStyle: {
      color: themeColors.terminalFg,
      fontWeight: "600" as const,
    },
  };
}
