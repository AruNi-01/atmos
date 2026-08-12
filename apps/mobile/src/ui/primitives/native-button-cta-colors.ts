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
    // Filled CTAs must paint with ctaLabel (light), never theme label (can be dark).
    text: isInverse ? themeColors.ctaFill : themeColors.ctaLabel,
    // Solid fills do not use glass tint; keep transparent so wrappers cannot wash contrast.
    tint: "transparent",
  };
}
