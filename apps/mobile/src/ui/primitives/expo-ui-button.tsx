import { Button as ExpoButton, Host } from "@expo/ui";
import { StyleSheet, Text, View } from "react-native";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";
import {
  resolveExpoUiButtonColors,
  type ExpoUiButtonTone,
  type ExpoUiButtonVariant,
} from "./expo-ui-button-colors";

/** Fixed Host height — never use matchContents (clips CTA labels). */
const CTA_MIN_HEIGHT = 52;

export type ExpoUiButtonProps = {
  disabled?: boolean;
  /** Share horizontal space in a flex-row of actions. */
  grow?: boolean;
  label: string;
  onPress?: () => void;
  tone?: ExpoUiButtonTone;
  variant?: ExpoUiButtonVariant;
};

/**
 * Shared `@expo/ui` Button wrapper for app chrome CTAs.
 * Explicit Host height — never matchContents (avoids clipped labels / blank hosts).
 */
export function ExpoUiButton({
  disabled = false,
  grow = false,
  label,
  onPress,
  tone = "default",
  variant = "filled",
}: ExpoUiButtonProps) {
  const theme = useMobileTheme();
  const colors = resolveExpoUiButtonColors({
    colors: theme.colors,
    disabled,
    tone,
    variant,
  });

  return (
    <View
      style={[
        styles.frame,
        grow ? styles.grow : styles.stretch,
        {
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
          borderWidth: colors.borderWidth,
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
          <Text numberOfLines={1} style={[styles.label, { color: colors.labelColor }]}>
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
    borderCurve: "continuous",
    borderRadius: radii.control,
    justifyContent: "center",
    minHeight: CTA_MIN_HEIGHT,
    overflow: "hidden",
  },
  grow: {
    flex: 1,
    minWidth: 0,
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
  stretch: {
    alignSelf: "stretch",
    width: "100%",
  },
});
