import { useEffect, useRef } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { PlusIcon } from "@/ui/icons/lucide-native";
import { colors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import { terminalTabLabel } from "@/features/terminal/terminal-selection";

export type TerminalTabStripItem = {
  id: string;
  label: string;
  dynamicTitle?: string;
  oscTitle?: string;
};

export function TerminalTabStrip({
  activeEntryId,
  entries,
  onCreateEntry,
  onSelectEntry,
}: {
  activeEntryId: string | null;
  entries: TerminalTabStripItem[];
  onCreateEntry: () => void;
  onSelectEntry: (entryId: string) => void;
}) {
  const theme = useMobileTheme();
  const scrollRef = useRef<ScrollView>(null);
  const tabOffsetsRef = useRef<Record<string, { x: number; width: number }>>({});
  const viewportWidthRef = useRef(0);

  useEffect(() => {
    if (!activeEntryId) return;
    const layout = tabOffsetsRef.current[activeEntryId];
    if (!layout || viewportWidthRef.current <= 0) return;
    const targetX = Math.max(0, layout.x - Math.max(12, (viewportWidthRef.current - layout.width) / 2));
    scrollRef.current?.scrollTo({ x: targetX, animated: true });
  }, [activeEntryId, entries.length]);

  const handleViewportLayout = (event: LayoutChangeEvent) => {
    viewportWidthRef.current = event.nativeEvent.layout.width;
  };

  const strip = (
    <View style={styles.row}>
      <ScrollView
        ref={scrollRef}
        horizontal
        onLayout={handleViewportLayout}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={styles.scroll}
      >
        {entries.map((entry) => {
          const selected = entry.id === activeEntryId;
          return (
            <Pressable
              key={entry.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={terminalTabLabel(entry)}
              onLayout={(event) => {
                tabOffsetsRef.current[entry.id] = {
                  x: event.nativeEvent.layout.x,
                  width: event.nativeEvent.layout.width,
                };
              }}
              onPress={() => onSelectEntry(entry.id)}
              style={[
                styles.tab,
                {
                  backgroundColor: selected
                    ? theme.isDark
                      ? "rgba(255, 255, 255, 0.14)"
                      : "rgba(10, 10, 11, 0.08)"
                    : "transparent",
                  borderColor: selected ? theme.colors.separatorStrong : "transparent",
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.tabLabel,
                  {
                    color: selected ? theme.colors.terminalFg : theme.colors.terminalMuted,
                    fontWeight: selected ? "700" : "500",
                  },
                ]}
              >
                {terminalTabLabel(entry)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        accessibilityLabel="New terminal"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onCreateEntry}
        style={[
          styles.addButton,
          {
            backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(10, 10, 11, 0.06)",
            borderColor: theme.colors.separator,
          },
        ]}
      >
        <PlusIcon color={theme.colors.terminalFg} size={16} strokeWidth={2.4} />
      </Pressable>
    </View>
  );

  if (Platform.OS === "ios") {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.terminalBg }]}>
        <GlassPanel
          fallbackStyle={[
            styles.glassFallback,
            {
              backgroundColor: theme.isDark ? "rgba(9, 9, 11, 0.92)" : "rgba(248, 250, 252, 0.94)",
            },
          ]}
          glassEffectStyle={{ style: "regular", animate: true }}
          interactive
          shadow={false}
          style={[styles.glass, { borderColor: theme.colors.glassBorder }]}
          tintColor={theme.isDark ? "rgba(9, 9, 11, 0.72)" : "rgba(255, 255, 255, 0.55)"}
        >
          {strip}
        </GlassPanel>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        styles.androidChrome,
        {
          backgroundColor: theme.colors.terminalBg,
          borderBottomColor: theme.colors.separator,
        },
      ]}
    >
      {strip}
    </View>
  );
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    justifyContent: "center",
    marginLeft: 4,
    width: 32,
  },
  androidChrome: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  container: {
    backgroundColor: colors.terminalBg,
    paddingBottom: 6,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  glass: {
    borderCurve: "continuous",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  glassFallback: {
    borderRadius: 16,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  scroll: {
    flex: 1,
  },
  tab: {
    borderCurve: "continuous",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 168,
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tabLabel: {
    color: colors.terminalFg,
    fontSize: 13,
    lineHeight: 16,
  },
  tabs: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    paddingRight: 4,
  },
});
