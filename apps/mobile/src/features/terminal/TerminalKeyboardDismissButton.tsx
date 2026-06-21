import { Pressable, StyleSheet } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { KeyboardIcon } from "@/ui/icons/lucide-native";

export function TerminalKeyboardDismissButton({ onPress }: { onPress: () => void }) {
  const theme = useMobileTheme();
  const buttonStyle = {
    backgroundColor: theme.isDark ? "rgba(248, 250, 252, 0.10)" : "rgba(244, 244, 245, 0.93)",
    borderColor: theme.isDark ? theme.colors.glassBorder : theme.colors.separator,
  };
  const buttonPressedStyle = {
    backgroundColor: theme.isDark ? "rgba(248, 250, 252, 0.16)" : "rgba(228, 228, 231, 0.96)",
  };
  const iconColor = theme.isDark ? theme.colors.label : "#111827";

  return (
    <Pressable
      accessibilityLabel="Dismiss keyboard"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, buttonStyle, pressed && buttonPressedStyle]}
    >
      <KeyboardIcon color={iconColor} size={20} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: "rgba(244, 244, 245, 0.93)",
    borderColor: "rgba(10, 10, 11, 0.08)",
    borderCurve: "continuous",
    borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
});
