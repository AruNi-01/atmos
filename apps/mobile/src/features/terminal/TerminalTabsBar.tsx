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

const TAB_BAR_HEIGHT = 40;
/** The held lens grows past the bar. Keep that bleed inside the track so it is not clipped. */
const LENS_BLEED = 10;
const TRACK_HEIGHT = TAB_BAR_HEIGHT + LENS_BLEED * 2;
/** Slots narrower than this crush names like "claude". Extra tabs scroll. */
const MIN_TAB_SLOT = 84;

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
  const didScrollToSelection = useRef(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = entries.findIndex((entry) => entry.id === activeEntryId);
  const contentWidth = entries.length * MIN_TAB_SLOT;
  const scrolls = trackWidth > 0 && contentWidth > trackWidth;
  const barWidth = trackWidth > 0 ? (scrolls ? contentWidth : Math.min(trackWidth, contentWidth)) : 0;

  useEffect(() => {
    if (!scrolls || selectedIndex < 0) return;
    const x = Math.max(0, selectedIndex * MIN_TAB_SLOT - (trackWidth - MIN_TAB_SLOT) / 2);
    const animated = didScrollToSelection.current;
    didScrollToSelection.current = true;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ animated, x });
    });
    return () => cancelAnimationFrame(frame);
  }, [scrolls, selectedIndex, trackWidth]);

  const tabs =
    entries.length > 0 && barWidth > 0 ? (
      <GlassTabBar
        onSelect={(index) => {
          const entry = entries[index];
          if (entry) onSelect(entry.id);
        }}
        // Past the last child, the native lens stays unplaced instead of lighting tab 0.
        selectedIndex={selectedIndex >= 0 ? selectedIndex : entries.length}
        style={{ alignSelf: "flex-start", height: TAB_BAR_HEIGHT, width: barWidth }}
        // Terminal chrome sits on #09090b even when the app theme is light.
        tint="dark"
      >
        {entries.map((entry) => {
          const selected = entry.id === activeEntryId;
          return (
            <Text
              key={entry.id}
              numberOfLines={1}
              style={[
                styles.tabLabel,
                { color: selected ? theme.colors.terminalFg : theme.colors.terminalMuted },
              ]}
            >
              {entry.label}
            </Text>
          );
        })}
      </GlassTabBar>
    ) : null;

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
        {tabs && scrolls ? (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            horizontal
            ref={scrollRef}
            showsHorizontalScrollIndicator={false}
            style={styles.scroller}
          >
            {tabs}
          </ScrollView>
        ) : (
          tabs
        )}
      </View>
      <TerminalTabActions onCreate={onCreate} onOpenGroup={onOpenGroup} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.terminalChromeX,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  scrollContent: {
    alignItems: "center",
    height: TRACK_HEIGHT,
  },
  scroller: {
    height: TRACK_HEIGHT,
    width: "100%",
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    textAlign: "center",
    width: "100%",
  },
  track: {
    flex: 1,
    height: TRACK_HEIGHT,
    justifyContent: "center",
    minWidth: 0,
  },
});
