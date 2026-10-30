import { StyleSheet, Text, View } from "react-native";
import { GlassTabBar } from "@rbayuokt/expo-adaptive-glass";
import { useMobileTheme } from "@/theme/theme-store";
import { TERMINAL_TAB_SLOT, type TerminalTabTrackItem } from "./terminal-tab-slot";

export type { TerminalTabTrackItem };
export { TERMINAL_TAB_SLOT };

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
  const selectedIndex = entries.findIndex((entry) => entry.id === activeEntryId);

  return (
    <GlassTabBar
      onSelect={(index) => {
        const entry = entries[index];
        if (entry) onSelect(entry.id);
      }}
      // Past the last child, the native lens stays unplaced instead of lighting tab 0.
      selectedIndex={selectedIndex >= 0 ? selectedIndex : entries.length}
      style={{ alignSelf: "flex-start", width: contentWidth }}
      // Terminal chrome sits on #09090b even when the app theme is light.
      tint="dark"
    >
      {entries.map((entry) => {
        const selected = entry.id === activeEntryId;
        return (
          <View key={entry.id} style={styles.labelWrap}>
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: selected ? theme.colors.terminalFg : theme.colors.terminalMuted },
              ]}
            >
              {entry.label}
            </Text>
          </View>
        );
      })}
    </GlassTabBar>
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
    width: TERMINAL_TAB_SLOT,
  },
});
