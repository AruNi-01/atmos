import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
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
  const scrollRef = useRef<ScrollView>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = entries.findIndex((entry) => entry.id === activeEntryId);
  const contentWidth = entries.length * TAB_SLOT;

  useEffect(() => {
    if (selectedIndex < 0 || trackWidth <= 0 || contentWidth <= trackWidth) return;
    const x = Math.max(0, selectedIndex * TAB_SLOT - (trackWidth - TAB_SLOT) / 2);
    scrollRef.current?.scrollTo({ x, animated: true });
  }, [contentWidth, selectedIndex, trackWidth]);

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
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scroller}
        >
          {contentWidth > 0 ? (
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
          ) : null}
        </ScrollView>
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
    flexShrink: 0,
    width: TAB_SLOT,
  },
  scroller: {
    flex: 1,
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
