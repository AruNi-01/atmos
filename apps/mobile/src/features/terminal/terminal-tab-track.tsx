import { Pressable, StyleSheet, Text, View } from "react-native";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { useMobileTheme } from "@/theme/theme-store";
import { TERMINAL_TAB_SLOT, type TerminalTabTrackItem } from "./terminal-tab-slot";

export type { TerminalTabTrackItem };
export { TERMINAL_TAB_SLOT };

/**
 * iOS / default: expo-glass-effect GlassPanel on the selected tab.
 * Adaptive-glass `GlassTabBar` is Android-only (`terminal-tab-track.android.tsx`).
 */
export function TerminalTabTrack({
  activeEntryId,
  contentWidth,
  entries,
  onSelect,
}: {
  activeEntryId: string | null;
  contentWidth: number;
  entries: TerminalTabTrackItem[];
  onSelect: (entryId: string) => void;
}) {
  const theme = useMobileTheme();

  return (
    <View style={[styles.row, { width: contentWidth }]}>
      {entries.map((entry) => {
        const selected = entry.id === activeEntryId;
        const label = (
          <Text
            numberOfLines={1}
            style={[
              styles.label,
              { color: selected ? theme.colors.terminalFg : theme.colors.terminalMuted },
            ]}
          >
            {entry.label}
          </Text>
        );
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={entry.id}
            onPress={() => onSelect(entry.id)}
            style={styles.labelWrap}
          >
            {selected ? (
              <GlassPanel colorScheme="dark" interactive shadow={false} style={styles.selected}>
                {label}
              </GlassPanel>
            ) : (
              label
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  labelWrap: {
    alignItems: "center",
    flexShrink: 0,
    justifyContent: "center",
    width: TERMINAL_TAB_SLOT,
  },
  row: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
  },
  selected: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    overflow: "visible",
    paddingHorizontal: 8,
  },
});
