import {
  getMobileThemeColors,
  type MobileThemeColorScheme,
  type MobileThemeColors,
} from "@/theme/colors";

/**
 * iOS sheet corners are continuous. A square child fill ghosts in those
 * corners, so the system `presentationBackground` owns the iOS fill.
 */
export function drawerContentFill(
  os: string,
  fillBackground: boolean,
  sheetBackground: string,
): string | undefined {
  if (os === "ios" || !fillBackground) return undefined;
  return sheetBackground;
}

export function drawerPalette(
  appColors: MobileThemeColors,
  appScheme: MobileThemeColorScheme,
  overlayScheme?: MobileThemeColorScheme,
) {
  const scheme = overlayScheme ?? appScheme;
  return {
    colors: overlayScheme ? getMobileThemeColors(overlayScheme) : appColors,
    isDark: scheme === "dark",
    scheme,
  };
}
