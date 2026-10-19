import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import type { CardId } from "./card-lane";
import { COMPOSER_GLASS_CONTROL_RADIUS, COMPOSER_GLASS_CONTROL_SIZE } from "./composer-glass";
import { HideScrollEdge } from "./hide-scroll-edge";
import { useReducedMotion } from "./motion/use-reduced-motion";
import { ScrollToBottomPill } from "./scroll-pill";
import { SCROLL_PILL_SLOT_MS, scrollPillSlotWidth } from "./scroll-pill-slot";
import { composerRowVisible, scrollPillVisible } from "./stick";

const SLOT_EASE = Easing.bezier(0.16, 1, 0.3, 1);

function emptyLayout(): LayoutChangeEvent {
  return {
    nativeEvent: { layout: { height: 0, width: 0, x: 0, y: 0 } },
  } as LayoutChangeEvent;
}

export type CardPill = {
  id: CardId;
  title: string;
  selected: boolean;
  attention: boolean;
};

function ScrollPillSlot({
  children,
  onClosed,
  visible,
}: {
  children: ReactNode;
  onClosed: () => void;
  visible: boolean;
}) {
  const reduced = useReducedMotion();
  const width = useSharedValue(0);
  const opacity = useSharedValue(0);
  const measured = useRef(0);
  const opened = useRef(false);

  const animate = useCallback(
    (nextWidth: number, nextOpacity: number, onEnd?: () => void) => {
      const timing = { duration: reduced ? 0 : SCROLL_PILL_SLOT_MS, easing: SLOT_EASE };
      width.set(withTiming(nextWidth, timing));
      opacity.set(
        withTiming(nextOpacity, timing, (finished) => {
          if (finished && onEnd) runOnJS(onEnd)();
        }),
      );
    },
    [opacity, reduced, width],
  );

  useEffect(() => {
    if (!opened.current) return;
    animate(visible ? measured.current : 0, visible ? 1 : 0, visible ? undefined : onClosed);
  }, [animate, onClosed, visible]);

  const onMeasure = (event: LayoutChangeEvent) => {
    const next = scrollPillSlotWidth(Math.ceil(event.nativeEvent.layout.width));
    if (next <= 0 || next === measured.current) return;
    measured.current = next;
    if (!opened.current) {
      opened.current = true;
      animate(visible ? next : 0, visible ? 1 : 0, visible ? undefined : onClosed);
      return;
    }
    if (visible) animate(next, 1);
  };

  const slotStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    width: width.get(),
  }));

  return (
    <Animated.View
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      pointerEvents={visible ? "auto" : "none"}
      style={[styles.slot, slotStyle]}
    >
      <View onLayout={onMeasure} style={styles.measure}>
        {children}
      </View>
    </Animated.View>
  );
}

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
  const wantsRow = composerRowVisible(showScroll, pills.length);
  const [mounted, setMounted] = useState(wantsRow);
  const [slotClosed, setSlotClosed] = useState(!showScroll);
  const onLayoutRef = useRef(onLayout);
  const wasMounted = useRef(mounted);
  const pillAnchorRef = useRef<View>(null);
  const pillSampleSeq = useRef(0);
  if (showScroll && slotClosed) setSlotClosed(false);
  if (wantsRow && !mounted) setMounted(true);
  else if (mounted && !wantsRow && slotClosed) setMounted(false);

  const onSlotClosed = useCallback(() => {
    setSlotClosed(true);
  }, []);

  useEffect(() => {
    onLayoutRef.current = onLayout;
  }, [onLayout]);

  useEffect(() => {
    if (wasMounted.current && !mounted) onLayoutRef.current?.(emptyLayout());
    wasMounted.current = mounted;
  }, [mounted]);

  if (!mounted) return null;

  const publishPillX = (contentX?: number) => {
    if (!onScrollPillX) return;
    const seq = ++pillSampleSeq.current;
    pillAnchorRef.current?.measureInWindow((x) => {
      if (seq !== pillSampleSeq.current) return;
      onScrollPillX(Math.round(x), contentX);
    });
  };

  return (
    <View onLayout={onLayout} style={styles.row}>
      <ScrollPillSlot onClosed={onSlotClosed} visible={showScroll}>
        {onScrollPillX ? (
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
        )}
      </ScrollPillSlot>
      <HideScrollEdge style={styles.scrollerWrap}>
        <ScrollView
          contentContainerStyle={styles.scrollerContent}
          horizontal
          keyboardShouldPersistTaps="handled"
          onScroll={(event) => {
            const contentX = Math.round(event.nativeEvent.contentOffset.x);
            if (onScrollPillX && pillAnchorRef.current) {
              publishPillX(contentX);
              return;
            }
            onCardScroll?.(event.nativeEvent.contentOffset.x);
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
      </HideScrollEdge>
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
    <GlassPanel
      interactive
      shadow={false}
      style={[styles.pill, { maxWidth }]}
      tintColor={pill.selected ? theme.colors.glassTint : theme.colors.controlGlassTint}
    >
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
  measure: {
    left: 0,
    position: "absolute",
    top: 0,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    height: COMPOSER_GLASS_CONTROL_SIZE,
    paddingHorizontal: 18,
  },
  slot: {
    height: 36,
    overflow: "hidden",
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
    paddingRight: 18,
  },
  scrollerWrap: {
    flex: 1,
    minWidth: 0,
  },
});
