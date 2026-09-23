import { Pressable, StyleSheet, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { LayoutGridIcon, PlusIcon } from "@/ui/icons/lucide-native";

export function TerminalTabActions({
  onCreate,
  onOpenGroup,
}: {
  onCreate: () => void;
  onOpenGroup: () => void;
}) {
  const theme = useMobileTheme();

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel="New terminal"
        accessibilityRole="button"
        hitSlop={12}
        onPress={onCreate}
      >
        <PlusIcon color={theme.colors.terminalFg} size={22} strokeWidth={2.2} />
      </Pressable>
      <Pressable
        accessibilityLabel="Terminal list"
        accessibilityRole="button"
        hitSlop={12}
        onPress={onOpenGroup}
      >
        <LayoutGridIcon color={theme.colors.terminalFg} size={22} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
});
