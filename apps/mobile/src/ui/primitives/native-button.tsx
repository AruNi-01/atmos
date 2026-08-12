import { Button as ExpoButton, Host } from "@expo/ui";
import type { UniversalStyle } from "@expo/ui";
import { Text, View } from "react-native";
import { radii, type MobileThemeColors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import { NativeButtonControl } from "./native-button-control";
import { getNativeButtonCtaColors } from "./native-button-cta-colors";
import type { NativeButtonControlTone, NativeButtonProps } from "./native-button.types";

function isControlSurface(props: NativeButtonProps) {
  return props.surface === "control";
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
    grow,
    label,
    onPress,
    tone = "default",
    variant = "filled",
  } = props;
  const theme = useMobileTheme();
  const frameColors = getNativeButtonCtaColors(tone, theme.colors);
  const buttonStyle = buttonStyleByVariant(tone, theme.colors)[variant];

  const button = (
    <Host matchContents colorScheme={theme.colorScheme}>
      <ExpoButton
        disabled={disabled}
        onPress={onPress}
        style={{
          ...buttonStyle,
          backgroundColor: disabled
            ? theme.colors.controlDisabled
            : buttonStyle.backgroundColor,
        }}
        variant={variant}
      >
        <Text
          style={[
            buttonLabelStyleByVariant(tone, theme.colors)[variant],
            disabled ? { color: theme.colors.tertiaryLabel } : null,
          ]}
        >
          {label}
        </Text>
      </ExpoButton>
    </Host>
  );

  if (grow) {
    return <View style={{ alignSelf: "stretch", width: "100%" }}>{button}</View>;
  }

  return button;
}

function buttonStyleByVariant(
  tone: NonNullable<NativeButtonProps["tone"]>,
  themeColors: MobileThemeColors,
): Record<NonNullable<NativeButtonProps["variant"]>, UniversalStyle> {
  const frameColors = getNativeButtonCtaColors(tone, themeColors);
  const isInverse = tone === "inverse";
  return {
  filled: {
    backgroundColor: frameColors.background,
    borderColor: frameColors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    height: 52,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  outlined: {
    backgroundColor: "transparent",
    borderColor: isInverse ? themeColors.ctaLabel : themeColors.controlBorder,
    borderRadius: radii.control,
    borderWidth: 1,
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
  const frameColors = getNativeButtonCtaColors(tone, themeColors);
  const isInverse = tone === "inverse";
  return {
  filled: {
    color: frameColors.text,
    fontWeight: "700",
  },
  outlined: {
    color: isInverse ? themeColors.ctaLabel : themeColors.label,
    fontWeight: "700",
  },
  text: {
    color: isInverse ? themeColors.ctaLabel : themeColors.label,
    fontWeight: "700",
  },
  };
}
