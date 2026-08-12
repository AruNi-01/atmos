import type { MobileThemeColors } from "@/theme/colors";
import type { NativeButtonControlTone } from "./native-button.types";

type ThemeColors = Pick<
  MobileThemeColors,
  | "control"
  | "controlBorder"
  | "controlDisabled"
  | "controlElevated"
  | "controlGlassTint"
  | "label"
  | "red"
  | "redBorder"
  | "redSurface"
  | "separator"
  | "tertiaryLabel"
>;

export function getNativeButtonControlColors({
  colors,
  disabled,
  tone,
}: {
  colors: ThemeColors;
  disabled: boolean;
  tone: NativeButtonControlTone;
}) {
  if (disabled) {
    return {
      background: tone === "text" ? "transparent" : colors.controlDisabled,
      border: tone === "text" ? "transparent" : colors.separator,
      text: colors.tertiaryLabel,
      tint: tone === "text" ? "transparent" : colors.controlGlassTint,
    };
  }

  if (tone === "danger") {
    return {
      background: colors.redSurface,
      border: colors.redBorder,
      text: colors.red,
      tint: colors.redSurface,
    };
  }

  if (tone === "secondary") {
    return {
      background: colors.control,
      border: colors.controlBorder,
      text: colors.label,
      tint: colors.controlGlassTint,
    };
  }

  if (tone === "text") {
    return {
      background: "transparent",
      border: "transparent",
      text: colors.label,
      tint: "transparent",
    };
  }

  return {
    background: colors.controlElevated,
    border: colors.controlBorder,
    text: colors.label,
    tint: colors.controlGlassTint,
  };
}
