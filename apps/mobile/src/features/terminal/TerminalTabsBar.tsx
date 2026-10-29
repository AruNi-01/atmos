import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { TerminalTabActions } from "@/features/terminal/TerminalTabActions";
import { TerminalTabTrack } from "@/features/terminal/terminal-tab-track";
import { TERMINAL_TAB_SLOT } from "@/features/terminal/terminal-tab-slot";
import { spacing } from "@/theme/spacing";

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
  const scrollRef = useRef<ScrollView>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = entries.findIndex((entry) => entry.id === activeEntryId);
  const contentWidth = entries.length * TERMINAL_TAB_SLOT;

  useEffect(() => {
    if (selectedIndex < 0 || trackWidth <= 0 || contentWidth <= trackWidth) return;
    const x = Math.max(0, selectedIndex * TERMINAL_TAB_SLOT - (trackWidth - TERMINAL_TAB_SLOT) / 2);
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
            <TerminalTabTrack
              activeEntryId={activeEntryId}
              contentWidth={contentWidth}
              entries={entries}
              onSelect={onSelect}
            />
          ) : null}
        </ScrollView>
      </View>
      <TerminalTabActions onCreate={onCreate} onOpenGroup={onOpenGroup} />
    </View>
  );
}

const styles = StyleSheet.create({
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
