import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import type { CardId } from "./card-lane";
import { ScrollToBottomPill } from "./scroll-pill";
import { composerRowVisible, scrollPillVisible } from "./stick";

export type CardPill = {
  id: CardId;
  title: string;
  selected: boolean;
  attention: boolean;
};

export function ComposerPillRow({
  belowCount,
  messageCount,
  onLayout,
  onPillPress,
  onScrollToBottom,
  pills,
  stickToEnd,
}: {
  belowCount: number;
  messageCount: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  onPillPress: (id: CardId) => void;
  onScrollToBottom: () => void;
  pills: readonly CardPill[];
  stickToEnd: boolean;
}) {
  const { width } = useWindowDimensions();
  const maxPillWidth = Math.round(width * 0.6);
  const showScroll = scrollPillVisible(messageCount, stickToEnd);

  if (!composerRowVisible(showScroll, pills.length)) return null;

  return (
    <View onLayout={onLayout} style={styles.row}>
      {showScroll ? <ScrollToBottomPill count={belowCount} onPress={onScrollToBottom} /> : null}
      <View style={styles.scrollerWrap}>
        <ScrollView
          contentContainerStyle={styles.scrollerContent}
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          style={styles.scroller}
        >
          {pills.map((pill) => (
            <CardPillButton
              key={pill.id}
              maxWidth={maxPillWidth}
              onPress={onPillPress}
              pill={pill}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function CardPillButton({
  maxWidth,
  onPress,
  pill,
}: {
  maxWidth: number;
  onPress: (id: CardId) => void;
  pill: CardPill;
}) {
  const theme = useMobileTheme();
  return (
    <Pressable
      accessibilityLabel={pill.title}
      accessibilityRole="button"
      accessibilityState={{ selected: pill.selected }}
      onPress={() => onPress(pill.id)}
      style={{ maxWidth }}
    >
      <GlassPanel
        interactive
        style={[styles.pill, { maxWidth }]}
        tintColor={pill.selected ? theme.colors.glassTint : theme.colors.controlGlassTint}
      >
        <View style={styles.pillInner}>
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.label,
              flexShrink: 1,
              fontSize: 14,
              fontWeight: "600",
              lineHeight: 20,
            }}
          >
            {pill.title}
          </Text>
          {pill.attention ? (
            <View style={[styles.dot, { backgroundColor: theme.colors.yellow }]} />
          ) : null}
        </View>
      </GlassPanel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  pill: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  pillInner: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    height: 36,
    paddingHorizontal: 18,
  },
  scroller: {
    flex: 1,
    // A horizontal ScrollView on iOS has no intrinsic height, so this row
    // collapsed to 0 on the simulator while react-native-web still showed it.
    height: 36,
  },
  scrollerContent: {
    alignItems: "center",
    gap: 8,
    paddingRight: 18,
  },
  scrollerWrap: {
    flex: 1,
    minWidth: 0,
  },
});
