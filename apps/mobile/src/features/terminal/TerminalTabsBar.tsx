import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LayoutGridIcon, PlusIcon } from "@/ui/icons/lucide-native";
import { radii } from "@/theme/radii";
import { spacing } from "@/theme/spacing";
import { useMobileTheme } from "@/theme/theme-store";

export type TerminalTabItem = {
  id: string;
  label: string;
};

export function TerminalTabsBar({
  activeEntryId,
  entries,
  leading,
  onCreate,
  onOpenGroup,
  onSelect,
}: {
  activeEntryId: string | null;
  entries: TerminalTabItem[];
  leading?: ReactNode;
  onCreate: () => void;
  onOpenGroup: () => void;
  onSelect: (entryId: string) => void;
}) {
  const theme = useMobileTheme();

  return (
    <View style={[styles.root, { borderBottomColor: theme.colors.glassBorder }]}>
      {leading}
      <ScrollView
        contentContainerStyle={styles.tabs}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroller}
      >
        {entries.map((entry) => {
          const selected = entry.id === activeEntryId;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={entry.id}
              onPress={() => onSelect(entry.id)}
              style={[
                styles.tab,
                {
                  backgroundColor: selected ? theme.colors.terminalKeycap : "transparent",
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.tabLabel,
                  { color: selected ? theme.colors.terminalFg : theme.colors.terminalMuted },
                ]}
              >
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        accessibilityLabel="New terminal"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onCreate}
        style={styles.iconButton}
      >
        <PlusIcon color={theme.colors.terminalFg} size={18} strokeWidth={2.4} />
      </Pressable>
      <Pressable
        accessibilityLabel="Terminal list"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onOpenGroup}
        style={styles.iconButton}
      >
        <LayoutGridIcon color={theme.colors.terminalFg} size={18} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  root: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    minHeight: spacing.terminalHeaderMinHeight,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  scroller: {
    flex: 1,
    minWidth: 0,
    overflow: "scroll",
  },
  tab: {
    borderCurve: "continuous",
    borderRadius: radii.terminalKeycap,
    flexShrink: 0,
    justifyContent: "center",
    maxWidth: 160,
    minHeight: 32,
    paddingHorizontal: 10,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  tabs: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    paddingRight: 8,
  },
});
