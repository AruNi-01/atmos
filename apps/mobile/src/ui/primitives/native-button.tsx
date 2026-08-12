import { Button as ExpoButton, Host } from "@expo/ui";
import type { UniversalStyle } from "@expo/ui";
import { Text } from "react-native";
import { radii, type MobileThemeColors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import { NativeButtonControl } from "./native-button-control";
import type { NativeButtonControlTone, NativeButtonProps } from "./native-button.types";

function isControlSurface(props: NativeButtonProps) {
  return props.surface === "control" || Boolean(props.icon);
}

function resolveControlTone(props: NativeButtonProps): NativeButtonControlTone {
  if (props.tone === "secondary" || props.tone === "danger" || props.tone === "text") {
    return props.tone;
  }
  if (props.variant === "text") {
    return "text";
  }
  return "default";
}

export function NativeButton(props: NativeButtonProps) {
  if (isControlSurface(props)) {
    return (
      <NativeButtonControl
        disabled={props.disabled}
        grow={props.grow}
        icon={props.icon}
        label={props.label}
        onPress={props.onPress}
        tone={resolveControlTone(props)}
      />
    );
  }

  const {
    disabled,
    label,
    onPress,
    tone = "default",
    variant = "filled",
  } = props;
  const theme = useMobileTheme();

  return (
    <Host matchContents colorScheme={theme.colorScheme}>
      <ExpoButton
        disabled={disabled}
        onPress={onPress}
        style={buttonStyleByVariant(tone, theme.colors)[variant]}
        variant={variant}
      >
        <Text style={buttonLabelStyleByVariant(tone, theme.colors)[variant]}>{label}</Text>
      </ExpoButton>
    </Host>
  );
}

function buttonStyleByVariant(
  tone: NonNullable<NativeButtonProps["tone"]>,
  themeColors: MobileThemeColors,
): Record<NonNullable<NativeButtonProps["variant"]>, UniversalStyle> {
  const isInverse = tone === "inverse";
  return {
  filled: {
    backgroundColor: isInverse ? themeColors.labelInverse : themeColors.label,
    borderColor: isInverse ? themeColors.labelInverse : themeColors.label,
    borderRadius: radii.control,
    borderWidth: 1,
    height: 52,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  outlined: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: radii.control,
    borderWidth: 0,
    height: 52,
    paddingHorizontal: 22,
    paddingVertical: 12,
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

function buttonLabelStyleByVariant(
  tone: NonNullable<NativeButtonProps["tone"]>,
  themeColors: MobileThemeColors,
): Record<NonNullable<NativeButtonProps["variant"]>, { color: string; fontWeight: "700" }> {
  const isInverse = tone === "inverse";
  return {
  filled: {
    color: isInverse ? themeColors.label : themeColors.labelInverse,
    fontWeight: "700",
  },
  outlined: {
    color: isInverse ? themeColors.labelInverse : themeColors.label,
    fontWeight: "700",
  },
  text: {
    color: isInverse ? themeColors.labelInverse : themeColors.label,
    fontWeight: "700",
  },
  };
}
