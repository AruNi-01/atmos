import { Button as ExpoButton, Host } from "@expo/ui";
import type { UniversalStyle } from "@expo/ui";
import { Text } from "react-native";
import { colors, radii } from "@/theme/colors";
import type { NativeButtonProps } from "./native-button.types";

export function NativeButton({
  disabled,
  label,
  onPress,
  tone = "default",
  variant = "filled",
}: NativeButtonProps) {
  return (
    <Host matchContents colorScheme="light">
      <ExpoButton
        disabled={disabled}
        onPress={onPress}
        style={buttonStyleByVariant(tone)[variant]}
        variant={variant}
      >
        <Text style={buttonLabelStyleByVariant(tone)[variant]}>{label}</Text>
      </ExpoButton>
    </Host>
  );
}

function buttonStyleByVariant(tone: NonNullable<NativeButtonProps["tone"]>): Record<NonNullable<NativeButtonProps["variant"]>, UniversalStyle> {
  const isInverse = tone === "inverse";
  return {
  filled: {
    backgroundColor: isInverse ? colors.labelInverse : colors.label,
    borderColor: isInverse ? colors.labelInverse : colors.label,
    borderRadius: radii.control,
    borderWidth: 1,
    height: 42,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  outlined: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: radii.control,
    borderWidth: 0,
    height: 38,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  text: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: radii.control,
    borderWidth: 0,
    height: 38,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  };
}

function buttonLabelStyleByVariant(tone: NonNullable<NativeButtonProps["tone"]>): Record<NonNullable<NativeButtonProps["variant"]>, { color: string; fontWeight: "700" }> {
  const isInverse = tone === "inverse";
  return {
  filled: {
    color: isInverse ? colors.label : colors.labelInverse,
    fontWeight: "700",
  },
  outlined: {
    color: isInverse ? colors.labelInverse : colors.label,
    fontWeight: "700",
  },
  text: {
    color: isInverse ? colors.labelInverse : colors.label,
    fontWeight: "700",
  },
  };
}
