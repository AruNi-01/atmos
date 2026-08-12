import type { MobileThemeColors } from "@/theme/colors";

export type ExpoUiButtonTone = "default" | "danger";
export type ExpoUiButtonVariant = "filled" | "outlined";

type ThemeColors = Pick<
  MobileThemeColors,
  | "control"
  | "controlBorder"
  | "controlDisabled"
  | "ctaFill"
  | "ctaLabel"
  | "label"
  | "red"
  | "redBorder"
  | "redSurface"
  | "separator"
  | "tertiaryLabel"
>;

export function resolveExpoUiButtonColors({
  colors,
  disabled,
  tone,
  variant,
}: {
  colors: ThemeColors;
  disabled: boolean;
  tone: ExpoUiButtonTone;
  variant: ExpoUiButtonVariant;
}): { backgroundColor: string; borderColor: string; labelColor: string; borderWidth: number } {
  if (disabled) {
    return {
      backgroundColor: variant === "outlined" ? colors.control : colors.controlDisabled,
      borderColor: colors.separator,
      borderWidth: variant === "outlined" ? 1 : 0,
      labelColor: colors.tertiaryLabel,
    };
  }

  if (tone === "danger") {
    return {
      backgroundColor: colors.redSurface,
      borderColor: colors.redBorder,
      borderWidth: 1,
      labelColor: colors.red,
    };
  }

  if (variant === "outlined") {
    return {
      backgroundColor: colors.control,
      borderColor: colors.controlBorder,
      borderWidth: 1,
      labelColor: colors.label,
    };
  }

  return {
    backgroundColor: colors.ctaFill,
    borderColor: "transparent",
    borderWidth: 0,
    labelColor: colors.ctaLabel,
  };
}
