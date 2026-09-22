import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  tabItemsFromEntries,
  type TerminalGroupItem,
} from "@/features/terminal/terminal-selection";
import { getMobileThemeColors } from "@/theme/colors";
import { radii } from "@/theme/radii";
import { spacing } from "@/theme/spacing";
import { CheckIcon } from "@/ui/icons/lucide-native";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";

export { tabItemsFromEntries };
export type { TerminalGroupItem };

export function TerminalGroupDrawer({
  activeEntryId,
  entries,
  isPresented,
  onDismiss,
  onSelect,
}: {
  activeEntryId: string | null;
  entries: TerminalGroupItem[];
  isPresented: boolean;
  onDismiss: () => void;
  onSelect: (entryId: string) => void;
}) {
  // Terminal is always dark; this sheet sits on it, so it uses the dark ladder
  // even when the rest of the app is following a light system theme.
  const colors = getMobileThemeColors("dark");

  return (
    <ExpoDrawer
      colorScheme="dark"
      isPresented={isPresented}
      onDismiss={onDismiss}
      testID="terminal-group-drawer"
    >
      <Text style={[styles.title, { color: colors.label }]}>Terminals</Text>
      {entries.length === 0 ? (
        <Text style={[styles.empty, { color: colors.secondaryLabel }]}>No terminals yet</Text>
      ) : (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.cardElevated,
              borderColor: colors.glassBorder,
            },
          ]}
        >
          {entries.map((entry, index) => {
            const selected = entry.id === activeEntryId;
            return (
              <View key={entry.id}>
                {index > 0 ? (
                  <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(entry.id)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed ? { backgroundColor: colors.mutedPressed } : null,
                  ]}
                >
                  <View style={styles.copy}>
                    <Text numberOfLines={1} style={[styles.label, { color: colors.label }]}>
                      {entry.label}
                    </Text>
                    {entry.detail ? (
                      <Text numberOfLines={1} style={[styles.detail, { color: colors.secondaryLabel }]}>
                        {entry.detail}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? <CheckIcon color={colors.accent} size={18} strokeWidth={2.4} /> : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </ExpoDrawer>
  );
}

const styles = StyleSheet.create({
  card: {
    borderCurve: "continuous",
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  copy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  detail: {
    fontSize: 13,
    lineHeight: 18,
  },
  empty: {
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 8,
  },
  label: {
    fontSize: 17,
    fontWeight: "400",
    lineHeight: 22,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: spacing.rowX,
    paddingVertical: 10,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.separatorInset,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 25,
    marginBottom: 14,
  },
});
