import type { MobileThemeColors } from "@/theme/colors";
import { getNativeButtonCtaColors } from "./native-button-cta-colors";
import type { NativeButtonProps } from "./native-button.types";

/** Visible glyph color for CTA buttons (never rely on ExpoButton label+tint alone). */
export function resolveNativeButtonLabelColor({
  disabled,
  themeColors,
  tone,
  variant,
}: {
  disabled?: boolean;
  themeColors: MobileThemeColors;
  tone: NonNullable<NativeButtonProps["tone"]>;
  variant: NonNullable<NativeButtonProps["variant"]>;
}): string {
  if (disabled) return themeColors.tertiaryLabel;
  const ctaColors = getNativeButtonCtaColors(tone, themeColors);
  if (variant === "filled") return ctaColors.text;
  return tone === "inverse" ? themeColors.ctaFill : themeColors.label;
}
