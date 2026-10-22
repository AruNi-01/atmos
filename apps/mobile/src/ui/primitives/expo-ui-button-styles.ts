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
 * Button `modifiers={expoUiButtonStretchModifiersFor(variant)}` and, on iOS,
 * a framed SwiftUI `Text` child (`expoUiButtonLabelStretchModifiers`).
 * `Number.POSITIVE_INFINITY` does not reach SwiftUI. A Button-level
 * `frame(maxWidth:)` only sizes the layout slot; filled `borderedProminent`
 * still hugs the label and looks like a short capsule (outlined `bordered`
 * paints the slot, so Turn off looked full-width). Frame the label, put
 * `buttonStyle` after `frame`, and do not pass `style.height` (`FrameModifier`
 * ignores maxWidth when height is set). Never layer custom fill/stroke on
 * `filled`/`outlined`.
 */
export function expoUiPrimaryStyle(colors: MobileThemeColors, disabled = false): ExpoUiButtonLook {
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

export function expoUiDangerStyle(colors: MobileThemeColors, disabled = false): ExpoUiButtonLook {
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
