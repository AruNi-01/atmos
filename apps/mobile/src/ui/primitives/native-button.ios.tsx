import { Button as ExpoButton, Host } from "@expo/ui";
import type { UniversalStyle } from "@expo/ui";
import type { ModifierConfig } from "@expo/ui/swift-ui/modifiers";
import { border, buttonBorderShape, clipShape } from "@expo/ui/swift-ui/modifiers";
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { radii, type MobileThemeColors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassPanel } from "./glass-panel";
import { NativeButtonControl } from "./native-button-control";
import { getNativeButtonCtaColors } from "./native-button-cta-colors";
import { resolveNativeButtonLabelColor } from "./native-button-label-color";
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
  const frameColors = buttonFrameColorsByVariant(tone, theme.colors, Boolean(disabled))[variant];
  const labelColor = resolveNativeButtonLabelColor({
    disabled: Boolean(disabled),
    themeColors: theme.colors,
    tone,
    variant,
  });
  const labelStyle: TextStyle = {
    color: labelColor,
    fontWeight: "700",
    textAlign: "center",
    width: "100%",
  };
  const hostStyle = grow ? styles.hostGrow : undefined;
  const buttonStyle: UniversalStyle = {
    ...buttonStyleByVariant[variant],
    ...(grow ? { width: "100%" } : null),
  };

  // Explicit Text children (android/universal path): ExpoButton `label=` + tint() can
  // still paint the system dark label on filled CTAs in light mode (dark-on-dark).
  const button = (
    <Host colorScheme={theme.colorScheme} matchContents style={hostStyle}>
      <ExpoButton
        disabled={disabled}
        modifiers={buttonModifiersByVariant(tone, theme.colors)[variant]}
        onPress={disabled ? undefined : onPress}
        style={buttonStyle}
        variant="text"
      >
        <Text style={labelStyle}>{label}</Text>
      </ExpoButton>
    </Host>
  );

  // Filled primary CTAs must stay solid dark + light label. Liquid Glass tint on
  // GlassPanel can wash the fill and let system label color win (dark-on-dark).
  if (variant === "filled") {
    return (
      <View
        style={[
          styles.frame,
          styles.filledFrame,
          grow ? styles.grow : null,
          buttonFrameStyleByVariant.filled,
          {
            backgroundColor: frameColors.background,
            borderColor: frameColors.border,
          },
        ]}
      >
        {button}
      </View>
    );
  }

  return (
    <GlassPanel
      fallbackStyle={[
        styles.fallback,
        grow ? styles.grow : null,
        { backgroundColor: frameColors.background },
      ]}
      glassEffectStyle="clear"
      interactive={!disabled}
      shadow={false}
      style={[
        styles.frame,
        grow ? styles.grow : null,
        buttonFrameStyleByVariant[variant],
        {
          backgroundColor: frameColors.background,
          borderColor: frameColors.border,
        },
      ]}
      tintColor={frameColors.tint}
    >
      {button}
    </GlassPanel>
  );
}

function buttonModifiersByVariant(
  tone: NonNullable<NativeButtonProps["tone"]>,
  themeColors: MobileThemeColors,
): Record<NonNullable<NativeButtonProps["variant"]>, ModifierConfig[]> {
  return {
    filled: [buttonBorderShape("roundedRectangle", radii.control)],
    outlined: [
      buttonBorderShape("roundedRectangle", radii.control),
      border({
        color: tone === "inverse" ? themeColors.ctaLabel : themeColors.controlBorder,
        width: 1,
      }),
      clipShape("roundedRectangle", radii.control),
    ],
    text: [],
  };
}

function buttonBorderColorByVariant(
  tone: NonNullable<NativeButtonProps["tone"]>,
  themeColors: MobileThemeColors,
): Record<NonNullable<NativeButtonProps["variant"]>, string> {
  return {
    filled: "transparent",
    outlined: tone === "inverse" ? themeColors.ctaLabel : themeColors.controlBorder,
    text: "transparent",
  };
}

function buttonFrameColorsByVariant(
  tone: NonNullable<NativeButtonProps["tone"]>,
  themeColors: MobileThemeColors,
  disabled: boolean,
): Record<NonNullable<NativeButtonProps["variant"]>, { background: string; border: string; tint: string }> {
  const borderColor = buttonBorderColorByVariant(tone, themeColors);
  const ctaColors = getNativeButtonCtaColors(tone, themeColors);
  return {
    filled: {
      background: disabled ? themeColors.controlDisabled : ctaColors.background,
      border: disabled ? themeColors.separator : borderColor.filled,
      tint: "transparent",
    },
    outlined: {
      background: disabled ? themeColors.controlDisabled : themeColors.control,
      border: disabled ? themeColors.separator : borderColor.outlined,
      tint: themeColors.controlGlassTint,
    },
    text: {
      background: "transparent",
      border: "transparent",
      tint: "transparent",
    },
  };
}

const buttonStyleByVariant: Record<NonNullable<NativeButtonProps["variant"]>, UniversalStyle> = {
  filled: {
    borderRadius: radii.control,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  outlined: {
    borderRadius: radii.control,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  text: {
    borderRadius: radii.control,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
};

const buttonFrameStyleByVariant: Record<NonNullable<NativeButtonProps["variant"]>, ViewStyle> = {
  filled: {
    minHeight: 52,
  },
  outlined: {
    minHeight: 52,
  },
  text: {
    minHeight: 38,
  },
};

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: "transparent",
  },
  filledFrame: {
    borderWidth: 0,
    overflow: "hidden",
  },
  frame: {
    alignItems: "stretch",
    alignSelf: "center",
    borderCurve: "continuous",
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minWidth: 1,
  },
  grow: {
    alignSelf: "stretch",
    width: "100%",
  },
  hostGrow: {
    alignSelf: "stretch",
    width: "100%",
  },
});
