import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GlassTabBar } from "@rbayuokt/expo-adaptive-glass";
import { TerminalTabActions } from "@/features/terminal/TerminalTabActions";
import { spacing } from "@/theme/spacing";
import { useMobileTheme } from "@/theme/theme-store";

export type TerminalTabItem = {
  id: string;
  label: string;
};

/** Same reason as the home tab bar: a flex slot wider than the label lets the lens drag the text. */
const TAB_SLOT = 104;

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
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = entries.findIndex((entry) => entry.id === activeEntryId);
  const barWidth =
    trackWidth > 0 && entries.length > 0 ? Math.min(trackWidth, entries.length * TAB_SLOT) : 0;

  return (
    <View style={styles.root}>
      {leading}
      <View
        collapsable={false}
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          setTrackWidth((current) => (current === next ? current : next));
        }}
        style={styles.track}
      >
        {barWidth > 0 ? (
          <GlassTabBar
            onSelect={(index) => {
              const entry = entries[index];
              if (entry) onSelect(entry.id);
            }}
            // Past the last child, the native lens stays unplaced instead of lighting tab 0.
            selectedIndex={selectedIndex >= 0 ? selectedIndex : entries.length}
            style={{ alignSelf: "flex-start", width: barWidth }}
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
        ) : null}
      </View>
      <TerminalTabActions onCreate={onCreate} onOpenGroup={onOpenGroup} />
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
  },
  root: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.terminalChromeX,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  track: {
    flex: 1,
    minWidth: 0,
  },
});
