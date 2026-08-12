import { Pressable, StyleSheet } from "react-native";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";
import { KeyboardIcon } from "@/ui/icons/lucide-native";

export function TerminalKeyboardDismissButton({ onPress }: { onPress: () => void }) {
  const theme = useMobileTheme();
  const buttonStyle = {
    backgroundColor: theme.colors.terminalKeycap,
    borderColor: theme.colors.glassBorder,
    borderRadius: radii.terminalChrome,
  };
  const buttonPressedStyle = {
    backgroundColor: theme.colors.terminalKeycapPressed,
  };

  return (
    <Pressable
      accessibilityLabel="Dismiss keyboard"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, buttonStyle, pressed && buttonPressedStyle]}
    >
      <KeyboardIcon color={theme.colors.terminalFg} size={20} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
});
