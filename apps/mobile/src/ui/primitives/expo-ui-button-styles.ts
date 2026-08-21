import type { UniversalStyle } from "@expo/ui";
import type { MobileThemeColors } from "@/theme/colors";

export type ExpoUiButtonLook = {
  /** Host `seedColor` — drives SwiftUI tint / Material seed (and label contrast). */
  seedColor: string;
  /**
   * Size only (`height`). Paint comes from Universal `variant` + Host seed —
   * do not set `backgroundColor` / `borderWidth` here.
   */
  style: UniversalStyle;
  variant: "filled" | "outlined" | "text";
};

/** Large control height (Universal style → native frame). */
const largeSizeStyle: UniversalStyle = {
  height: 52,
};

/**
 * Pure Expo UI looks: **variant + seedColor + size only**.
 *
 * | role      | variant    | seedColor        |
 * |-----------|------------|------------------|
 * | primary   | `filled`   | `ctaFill`        |
 * | secondary | `outlined` | `label`          |
 * | danger    | `outlined` | `red`            |
 * | disabled  | same       | `tertiaryLabel`  |
 *
 * Stretch width at the call site with `expoUiButtonHostStyle` +
 * `expoUiButtonStretchModifiers` (see `expo-ui-button-modifiers.ts`).
 * Never layer custom fill/stroke on `filled`/`outlined` (double chrome on iOS).
 */
export function expoUiPrimaryStyle(
  colors: MobileThemeColors,
  disabled = false,
): ExpoUiButtonLook {
  return {
    seedColor: disabled ? colors.tertiaryLabel : colors.ctaFill,
    style: largeSizeStyle,
    variant: "filled",
  };
}

export function expoUiSecondaryStyle(
  colors: MobileThemeColors,
  disabled = false,
): ExpoUiButtonLook {
  return {
    seedColor: disabled ? colors.tertiaryLabel : colors.label,
    style: largeSizeStyle,
    variant: "outlined",
  };
}

export function expoUiDangerStyle(
  colors: MobileThemeColors,
  disabled = false,
): ExpoUiButtonLook {
  return {
    seedColor: disabled ? colors.tertiaryLabel : colors.red,
    style: largeSizeStyle,
    variant: "outlined",
  };
}

/** Host layout for a full-width Expo UI button. */
export const expoUiButtonHostStyle = {
  alignSelf: "stretch" as const,
  minHeight: 52,
  width: "100%" as const,
};
