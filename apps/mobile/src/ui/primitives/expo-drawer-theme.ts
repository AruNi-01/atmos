import {
  getMobileThemeColors,
  type MobileThemeColorScheme,
  type MobileThemeColors,
} from "@/theme/colors";

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
