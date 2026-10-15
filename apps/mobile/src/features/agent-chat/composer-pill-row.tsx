import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { ScrollToBottomPill } from "./scroll-pill";
import { composerRowVisible, scrollPillVisible } from "./stick";

const CARD_PILL_COUNT = 0;

export function ComposerPillRow({
  belowCount,
  messageCount,
  onLayout,
  onScrollToBottom,
  stickToEnd,
}: {
  belowCount: number;
  messageCount: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  onScrollToBottom: () => void;
  stickToEnd: boolean;
}) {
  const showScroll = scrollPillVisible(messageCount, stickToEnd);
  if (!composerRowVisible(showScroll, CARD_PILL_COUNT)) return null;

  return (
    <View onLayout={onLayout} style={styles.row}>
      {showScroll ? <ScrollToBottomPill count={belowCount} onPress={onScrollToBottom} /> : null}
      <ScrollView
        contentContainerStyle={styles.scrollerContent}
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        style={styles.scroller}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
  },
  scroller: {
    flex: 1,
  },
  scrollerContent: {
    gap: 8,
    paddingRight: 18,
  },
});
