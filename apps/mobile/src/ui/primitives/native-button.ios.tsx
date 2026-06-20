import { Button as ExpoButton, Host } from "@expo/ui";
import type { UniversalStyle } from "@expo/ui";
import type { ModifierConfig } from "@expo/ui/swift-ui/modifiers";
import { border, buttonBorderShape, clipShape, tint } from "@expo/ui/swift-ui/modifiers";
import { colors, radii } from "@/theme/colors";
import type { NativeButtonProps } from "./native-button.types";

export function NativeButton({
  disabled,
  label,
  onPress,
  tone = "default",
  variant = "filled",
}: NativeButtonProps) {
  const nativeVariant = variant === "outlined" ? "text" : variant;

  return (
    <Host matchContents colorScheme="light">
      <ExpoButton
        disabled={disabled}
        label={label}
        modifiers={buttonModifiersByVariant(tone)[variant]}
        onPress={disabled ? undefined : onPress}
        style={buttonStyleByVariant[variant]}
        variant={nativeVariant}
      />
    </Host>
  );
}

function buttonModifiersByVariant(
  tone: NonNullable<NativeButtonProps["tone"]>,
): Record<NonNullable<NativeButtonProps["variant"]>, ModifierConfig[]> {
  const tintColor = tone === "inverse" ? colors.labelInverse : colors.label;
  return {
    filled: [buttonBorderShape("roundedRectangle", radii.control), tint(tintColor)],
    outlined: [
      buttonBorderShape("roundedRectangle", radii.control),
      tint(tintColor),
      border({ color: tintColor, width: 1 }),
      clipShape("roundedRectangle", radii.control),
    ],
    text: [tint(tintColor)],
  };
}

const buttonStyleByVariant: Record<NonNullable<NativeButtonProps["variant"]>, UniversalStyle> = {
  filled: {
    borderRadius: radii.control,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  outlined: {
    borderRadius: radii.control,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  text: {
    borderRadius: radii.control,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
};
