import { useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import type { CardId } from "./card-lane";
import {
  COMPOSER_GLASS_CONTROL_RADIUS,
  COMPOSER_GLASS_CONTROL_SIZE,
  COMPOSER_GLASS_WELL,
} from "./composer-glass";
import { PILL_SCROLL_FADE_PX, agentChatHorizontalEdgeFadeGradient } from "./edge-fade-stops";
import { HideScrollEdge } from "./hide-scroll-edge";
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
  onCardScroll,
  onLayout,
  onPillPress,
  onScrollPillX,
  onScrollToBottom,
  pills,
  stickToEnd,
}: {
  belowCount: number;
  messageCount: number;
  onCardScroll?: (x: number) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  onPillPress: (id: CardId) => void;
  onScrollPillX?: (pageX: number, contentX?: number) => void;
  onScrollToBottom: () => void;
  pills: readonly CardPill[];
  stickToEnd: boolean;
}) {
  const { width } = useWindowDimensions();
  const maxPillWidth = Math.round(width * 0.6);
  const showScroll = scrollPillVisible(messageCount, stickToEnd);
  const pillAnchorRef = useRef<View>(null);
  const pillSampleSeq = useRef(0);

  if (!composerRowVisible(showScroll, pills.length)) return null;

  const publishPillX = (contentX?: number) => {
    if (!onScrollPillX) return;
    const seq = ++pillSampleSeq.current;
    pillAnchorRef.current?.measureInWindow((x) => {
      if (seq !== pillSampleSeq.current) return;
      onScrollPillX(Math.round(x), contentX);
    });
  };

  return (
    <View onLayout={onLayout} style={[styles.row, showScroll ? styles.rowWithScroll : null]}>
      {showScroll ? (
        onScrollPillX ? (
          <View
            collapsable={false}
            onLayout={() => publishPillX()}
            ref={pillAnchorRef}
            style={styles.pillAnchor}
          >
            <ScrollToBottomPill count={belowCount} onPress={onScrollToBottom} />
          </View>
        ) : (
          <ScrollToBottomPill count={belowCount} onPress={onScrollToBottom} />
        )
      ) : null}
      <HideScrollEdge style={styles.scrollerWrap}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollerContent,
            showScroll ? styles.scrollerContentWithScroll : null,
          ]}
          horizontal
          keyboardShouldPersistTaps="handled"
          onScroll={(event) => {
            const contentX = Math.round(event.nativeEvent.contentOffset.x);
            if (onScrollPillX && pillAnchorRef.current) {
              publishPillX(contentX);
              return;
            }
            onCardScroll?.(contentX);
          }}
          scrollEventThrottle={48}
          showsHorizontalScrollIndicator={false}
          style={styles.scroller}
          testID="agent-chat-card-pill-scroller"
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
        <PillScrollerFade edge="left" />
        <PillScrollerFade edge="right" />
      </HideScrollEdge>
    </View>
  );
}

function PillScrollerFade({ edge }: { edge: "left" | "right" }) {
  const theme = useMobileTheme();
  const fade = agentChatHorizontalEdgeFadeGradient(theme.colors.background, edge);
  return (
    <LinearGradient
      colors={fade.colors}
      end={fade.end}
      pointerEvents="none"
      start={fade.start}
      style={[styles.fade, edge === "left" ? styles.fadeLeft : styles.fadeRight]}
    />
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
    <GlassPanel {...COMPOSER_GLASS_WELL} style={[styles.pill, { maxWidth }]}>
      <Pressable
        accessibilityLabel={pill.title}
        accessibilityRole="button"
        accessibilityState={{ selected: pill.selected }}
        onPress={() => onPress(pill.id)}
        style={({ pressed }) => ({
          alignItems: "center",
          height: COMPOSER_GLASS_CONTROL_SIZE,
          justifyContent: "center",
          maxWidth,
          opacity: pressed ? 0.6 : 1,
          paddingHorizontal: 14,
        })}
        testID={`agent-chat-card-pill-${pill.id}`}
      >
        <View style={styles.pillInner}>
          <Text
            numberOfLines={1}
            style={{
              color: pill.selected ? theme.colors.label : theme.colors.secondaryLabel,
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
      </Pressable>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  dot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  fade: {
    bottom: 0,
    position: "absolute",
    top: 0,
    width: PILL_SCROLL_FADE_PX,
  },
  fadeLeft: {
    left: 0,
  },
  fadeRight: {
    right: 0,
  },
  pill: {
    alignItems: "center",
    borderRadius: COMPOSER_GLASS_CONTROL_RADIUS,
    height: COMPOSER_GLASS_CONTROL_SIZE,
    justifyContent: "center",
  },
  pillAnchor: {
    alignSelf: "flex-start",
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
    height: COMPOSER_GLASS_CONTROL_SIZE,
  },
  rowWithScroll: {
    paddingLeft: 18,
  },
  scroller: {
    flex: 1,
    // A horizontal ScrollView on iOS has no intrinsic height, so this row
    // collapsed to 0 on the simulator while react-native-web still showed it.
    height: COMPOSER_GLASS_CONTROL_SIZE,
  },
  scrollerContent: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
  },
  scrollerContentWithScroll: {
    paddingLeft: PILL_SCROLL_FADE_PX,
  },
  scrollerWrap: {
    flex: 1,
    minWidth: 0,
  },
});
