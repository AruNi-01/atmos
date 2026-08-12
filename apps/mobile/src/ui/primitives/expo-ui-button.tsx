import { Button as ExpoButton, Host } from "@expo/ui";
import { StyleSheet, Text, View } from "react-native";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";
import { getNativeButtonCtaColors } from "./native-button-cta-colors";

/** Fixed Host height — never use matchContents (clips CTA labels). */
const CTA_MIN_HEIGHT = 52;

export type ExpoUiButtonProps = {
  disabled?: boolean;
  label: string;
  onPress?: () => void;
  variant?: "filled" | "outlined";
};

/**
 * Primary CTA path for Home / Connect social actions.
 * Uses `@expo/ui` Button with an explicitly sized Host (no matchContents).
 */
export function ExpoUiButton({
  disabled = false,
  label,
  onPress,
  variant = "filled",
}: ExpoUiButtonProps) {
  const theme = useMobileTheme();
  const cta = getNativeButtonCtaColors("default", theme.colors);
  const isFilled = variant === "filled";
  const backgroundColor = disabled
    ? theme.colors.controlDisabled
    : isFilled
      ? cta.background
      : theme.colors.control;
  const borderColor = disabled
    ? theme.colors.separator
    : isFilled
      ? "transparent"
      : theme.colors.controlBorder;
  const labelColor = disabled
    ? theme.colors.tertiaryLabel
    : isFilled
      ? cta.text
      : theme.colors.label;

  return (
    <View
      style={[
        styles.frame,
        {
          backgroundColor,
          borderColor,
          borderWidth: isFilled ? 0 : 1,
        },
      ]}
    >
      <Host colorScheme={theme.colorScheme} style={styles.host}>
        <ExpoButton
          disabled={disabled}
          onPress={disabled ? undefined : onPress}
          style={styles.button}
          variant="text"
        >
          <Text numberOfLines={1} style={[styles.label, { color: labelColor }]}>
            {label}
          </Text>
        </ExpoButton>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radii.control,
    height: CTA_MIN_HEIGHT,
    paddingHorizontal: 22,
    width: "100%",
  },
  frame: {
    alignSelf: "stretch",
    borderCurve: "continuous",
    borderRadius: radii.control,
    justifyContent: "center",
    minHeight: CTA_MIN_HEIGHT,
    overflow: "hidden",
    width: "100%",
  },
  host: {
    alignSelf: "stretch",
    height: CTA_MIN_HEIGHT,
    minHeight: CTA_MIN_HEIGHT,
    width: "100%",
  },
  label: {
    fontWeight: "700",
    textAlign: "center",
    width: "100%",
  },
});
