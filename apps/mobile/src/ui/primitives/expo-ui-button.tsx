import { Button as ExpoButton, Host } from "@expo/ui";
import type { UniversalStyle } from "@expo/ui";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { controlSize, frame } from "@expo/ui/swift-ui/modifiers";
import { Platform, StyleSheet } from "react-native";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";
import {
  resolveExpoUiButtonColors,
  type ExpoUiButtonTone,
  type ExpoUiButtonVariant,
} from "./expo-ui-button-colors";

export type ExpoUiButtonProps = {
  disabled?: boolean;
  /** Share horizontal space in a flex-row of actions. */
  grow?: boolean;
  label: string;
  onPress?: () => void;
  tone?: ExpoUiButtonTone;
  variant?: ExpoUiButtonVariant;
};

/** Official per-platform width/size modifiers (Universal `style.width` is numeric-only). */
const stretchModifiers = Platform.select({
  ios: [frame({ maxWidth: Number.POSITIVE_INFINITY }), controlSize("large")],
  android: [fillMaxWidth()],
  default: undefined,
});

/**
 * Thin `@expo/ui` Button wrapper.
 * `Host matchContents={{ vertical: true }}` + Button `label` / `variant` / `style`
 * — no outer RN paint shell, no RN Text children, no fixed Host height stack.
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

  const buttonStyle: UniversalStyle = {
    backgroundColor: colors.backgroundColor,
    borderColor: colors.borderColor,
    borderRadius: radii.control,
    borderWidth: colors.borderWidth,
    // Documented Button `style.height` → native frame (not Host height hacks).
    height: 52,
    paddingHorizontal: 22,
  };

  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      // Tint / Material seed drives native label contrast (no Universal labelColor API).
      seedColor={colors.seedColor}
      style={grow ? styles.growHost : styles.stretchHost}
    >
      <ExpoButton
        disabled={disabled}
        label={label}
        modifiers={stretchModifiers}
        onPress={disabled ? undefined : onPress}
        style={buttonStyle}
        variant={variant}
      />
    </Host>
  );
}

const styles = StyleSheet.create({
  growHost: {
    alignSelf: "stretch",
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  stretchHost: {
    alignSelf: "stretch",
    width: "100%",
  },
});
