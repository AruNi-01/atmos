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
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
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
          if (finished && onEnd) scheduleOnRN(onEnd);
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
  const wantsRow = composerRowVisible(showScroll, pills.length);
  const [mounted, setMounted] = useState(wantsRow);
  const [slotClosed, setSlotClosed] = useState(!showScroll);
  const onLayoutRef = useRef(onLayout);
  const wasMounted = useRef(mounted);
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

  return (
    <View
      onLayout={onLayout}
      style={[styles.row, showScroll || !slotClosed ? styles.rowWithScroll : null]}
    >
      <ScrollPillSlot onClosed={onSlotClosed} visible={showScroll}>
        <ScrollToBottomPill count={belowCount} onPress={onScrollToBottom} />
      </ScrollPillSlot>
      <HideScrollEdge style={styles.scrollerWrap}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollerContent,
            showScroll ? styles.scrollerContentWithScroll : null,
          ]}
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
  measure: {
    left: 0,
    position: "absolute",
    top: 0,
  },
  slot: {
    height: COMPOSER_GLASS_CONTROL_SIZE,
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
