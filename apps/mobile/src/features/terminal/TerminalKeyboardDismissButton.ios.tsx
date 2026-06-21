import { StyleSheet, View } from "react-native";
import { Button, Host } from "@expo/ui/swift-ui";
import {
  background,
  buttonStyle,
  frame,
  imageScale,
  labelStyle,
  shapes,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useMobileTheme } from "@/theme/theme-store";

export function TerminalKeyboardDismissButton({ onPress }: { onPress: () => void }) {
  const theme = useMobileTheme();
  const buttonModifiers = [
    buttonStyle("plain"),
    frame({ height: 46, width: 46 }),
    background(theme.isDark ? "#F8FAFC1A" : "#F4F4F5EE", shapes.circle()),
    imageScale("medium"),
    labelStyle("iconOnly"),
    tint(theme.isDark ? theme.colors.label : "#111827"),
  ];

  return (
    <View style={styles.frame}>
      <Host colorScheme={theme.colorScheme} matchContents>
        <Button
          label="Dismiss keyboard"
          modifiers={buttonModifiers}
          onPress={onPress}
          systemImage="keyboard.chevron.compact.down"
        />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    height: 46,
    justifyContent: "center",
    width: 46,
  },
});
