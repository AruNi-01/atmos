import type { MobileThemeColors } from "@/theme/colors";
import type { NativeButtonProps } from "./native-button.types";

export function getNativeButtonCtaColors(
  tone: NonNullable<NativeButtonProps["tone"]>,
  themeColors: MobileThemeColors,
) {
  const isInverse = tone === "inverse";
  return {
    background: isInverse ? themeColors.ctaLabel : themeColors.ctaFill,
    border: isInverse ? themeColors.ctaLabel : themeColors.ctaFill,
    text: isInverse ? themeColors.ctaFill : themeColors.ctaLabel,
    tint: themeColors.controlGlassTint,
  };
}
