import { Button as ExpoButton, Host } from "@expo/ui";
import type { UniversalStyle } from "@expo/ui";
import type { ModifierConfig } from "@expo/ui/swift-ui/modifiers";
import { border, buttonBorderShape, clipShape, tint } from "@expo/ui/swift-ui/modifiers";
import { StyleSheet, type ViewStyle } from "react-native";
import { radii, type MobileThemeColors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassPanel } from "./glass-panel";
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
  const frameColors = buttonFrameColorsByVariant(tone, theme.colors, Boolean(disabled))[variant];

  return (
    <GlassPanel
      fallbackStyle={[
        styles.fallback,
        grow ? styles.grow : null,
        { backgroundColor: frameColors.background },
      ]}
      glassEffectStyle={variant === "filled" ? "regular" : "clear"}
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
      <Host matchContents colorScheme={theme.colorScheme}>
        <ExpoButton
          disabled={disabled}
          label={label}
          modifiers={buttonModifiersByVariant(tone, theme.colors)[variant]}
          onPress={disabled ? undefined : onPress}
          style={buttonStyleByVariant[variant]}
          variant="text"
        />
      </Host>
    </GlassPanel>
  );
}

function buttonModifiersByVariant(
  tone: NonNullable<NativeButtonProps["tone"]>,
  themeColors: MobileThemeColors,
): Record<NonNullable<NativeButtonProps["variant"]>, ModifierConfig[]> {
  const ctaColors = getNativeButtonCtaColors(tone, themeColors);
  const tintColor = tone === "inverse" ? themeColors.ctaFill : themeColors.ctaLabel;
  return {
    filled: [buttonBorderShape("roundedRectangle", radii.control), tint(ctaColors.text)],
    outlined: [
      buttonBorderShape("roundedRectangle", radii.control),
      tint(tintColor),
      border({ color: tintColor, width: 1 }),
      clipShape("roundedRectangle", radii.control),
    ],
    text: [tint(tintColor)],
  };
}

function buttonBorderColorByVariant(
  tone: NonNullable<NativeButtonProps["tone"]>,
  themeColors: MobileThemeColors,
): Record<NonNullable<NativeButtonProps["variant"]>, string> {
  const ctaColors = getNativeButtonCtaColors(tone, themeColors);
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
      tint: ctaColors.tint,
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
  frame: {
    alignSelf: "center",
    borderCurve: "continuous",
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 1,
  },
  grow: {
    alignSelf: "stretch",
    width: "100%",
  },
});
