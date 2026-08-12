import { Pressable, StyleSheet, Text } from "react-native";
import { pressed as pressedTokens } from "@/theme/pressed";
import { radii } from "@/theme/radii";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassPanel } from "./glass-panel";
import { getNativeButtonControlColors } from "./native-button-colors";
import type { NativeButtonControlTone, NativeButtonProps } from "./native-button.types";

export function NativeButtonControl({
  disabled,
  grow,
  icon: Icon,
  label,
  onPress,
  tone = "default",
}: Pick<
  NativeButtonProps,
  "disabled" | "grow" | "icon" | "label" | "onPress" | "tone"
> & {
  tone?: NativeButtonControlTone;
}) {
  const theme = useMobileTheme();
  const controlTone: NativeButtonControlTone =
    tone === "secondary" || tone === "danger" || tone === "text" ? tone : "default";
  const color = getNativeButtonControlColors({
    colors: theme.colors,
    disabled: Boolean(disabled),
    tone: controlTone,
  });
  const isText = controlTone === "text";

  return (
    <GlassPanel
      fallbackStyle={{ backgroundColor: color.background }}
      glassEffectStyle="clear"
      interactive={!disabled}
      shadow={false}
      style={[
        styles.frame,
        grow ? styles.grow : null,
        isText ? styles.textFrame : null,
        {
          backgroundColor: color.background,
          borderColor: color.border,
        },
      ]}
      tintColor={color.tint}
    >
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={disabled ? undefined : onPress}
        style={({ pressed: isPressed }) => [
          styles.content,
          isText ? styles.textContent : null,
          isPressed ? { opacity: pressedTokens.controlOpacity } : null,
        ]}
      >
        {Icon ? <Icon color={color.text} size={17} strokeWidth={2.4} /> : null}
        <Text style={[styles.label, typography.controlLabel, { color: color.text }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16,
  },
  frame: {
    alignSelf: "flex-start",
    borderCurve: "continuous",
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 46,
  },
  grow: {
    alignSelf: "stretch",
    flexGrow: 1,
    flexShrink: 1,
  },
  label: {
    fontWeight: "700",
  },
  textContent: {
    alignSelf: "flex-start",
    minHeight: 36,
    paddingHorizontal: 2,
  },
  textFrame: {
    alignSelf: "flex-start",
    borderWidth: 0,
    minHeight: 36,
  },
});
