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
import {
  SCROLL_PILL_SLOT_GAP,
  SCROLL_PILL_SLOT_MS,
  dropClosedPill,
  reconcilePillPresence,
  scrollPillSlotWidth,
  type PillPresence,
} from "./scroll-pill-slot";
import { composerRowVisible, scrollPillVisible } from "./stick";

const SLOT_EASE = Easing.bezier(0.16, 1, 0.3, 1);

function emptyLayout(): LayoutChangeEvent {
  return {
    nativeEvent: { layout: { height: 0, width: 0, x: 0, y: 0 } },
  } as LayoutChangeEvent;
}

function sameShown(left: readonly ShownPill[], right: readonly ShownPill[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      !a ||
      !b ||
      a.id !== b.id ||
      a.visible !== b.visible ||
      a.title !== b.title ||
      a.selected !== b.selected ||
      a.attention !== b.attention
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Width is the only layout size, so neighbors slide with it.
 * The pill is absolute and cannot force the slot open before the timing runs.
 */
function WidthSlot({
  children,
  onClosed,
  openWidth,
  visible,
}: {
  children: ReactNode;
  onClosed?: () => void;
  openWidth: number;
  visible: boolean;
}) {
  const reduced = useReducedMotion();
  const shownAtOnce = visible && reduced && openWidth > 0;
  const width = useSharedValue(shownAtOnce ? openWidth : 0);

  useEffect(() => {
    const timing = { duration: reduced ? 0 : SCROLL_PILL_SLOT_MS, easing: SLOT_EASE };
    const show = visible && openWidth > 0;
    // Width only. Fading this view drops ancestor opacity below 1, and iOS
    // then draws no glass — the label or icon is all that remains.
    width.set(
      withTiming(show ? openWidth : 0, timing, (finished) => {
        if (finished && !visible && onClosed) scheduleOnRN(onClosed);
      }),
    );
  }, [onClosed, openWidth, reduced, visible, width]);

  const slotStyle = useAnimatedStyle(() => ({
    width: width.get(),
  }));

  return (
    <Animated.View
      accessibilityElementsHidden={!visible}
      collapsable={false}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      pointerEvents={visible ? "auto" : "none"}
      style={[styles.slot, slotStyle]}
    >
      {visible ? children : null}
    </Animated.View>
  );
}

export type CardPill = {
  id: CardId;
  title: string;
  selected: boolean;
  attention: boolean;
};

type ShownPill = PillPresence<CardPill>;

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
  const [shown, setShown] = useState<readonly ShownPill[]>(() =>
    pills.map((pill) => ({ ...pill, visible: true })),
  );
  const [mounted, setMounted] = useState(wantsRow);
  const [slotClosed, setSlotClosed] = useState(!showScroll);
  const [cardsScrolled, setCardsScrolled] = useState(false);
  const [pillWidths, setPillWidths] = useState<Readonly<Record<string, number>>>({});
  const onLayoutRef = useRef(onLayout);
  const wasMounted = useRef(mounted);
  const pillAnchorRef = useRef<View>(null);
  const pillSampleSeq = useRef(0);

  const nextShown = reconcilePillPresence(shown, pills);
  if (!sameShown(shown, nextShown)) setShown(nextShown);
  const exitRunning = nextShown.some((pill) => !pill.visible);
  if (showScroll && slotClosed) setSlotClosed(false);
  if (wantsRow && !mounted) setMounted(true);
  else if (mounted && !wantsRow && slotClosed && !exitRunning) setMounted(false);

  const onSlotClosed = useCallback(() => {
    setSlotClosed(true);
  }, []);

  const onCardClosed = useCallback((id: CardId) => {
    setShown((current) => dropClosedPill(current, id));
  }, []);

  useEffect(() => {
    onLayoutRef.current = onLayout;
  }, [onLayout]);

  useEffect(() => {
    if (wasMounted.current && !mounted) onLayoutRef.current?.(emptyLayout());
    wasMounted.current = mounted;
  }, [mounted]);

  if (!mounted) {
    if (cardsScrolled) setCardsScrolled(false);
    return null;
  }

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
      <View
        accessibilityElementsHidden
        collapsable={false}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.measureHost}
      >
        {nextShown.map((pill) => (
          <View
            key={pill.id}
            onLayout={(event) => {
              const next = Math.min(maxPillWidth, Math.ceil(event.nativeEvent.layout.width));
              if (next <= 0) return;
              setPillWidths((current) =>
                current[pill.id] === next ? current : { ...current, [pill.id]: next },
              );
            }}
            style={styles.measurerPill}
          >
            <CardPillButton maxWidth={maxPillWidth} measureOnly onPress={onPillPress} pill={pill} />
          </View>
        ))}
      </View>
      <WidthSlot
        onClosed={onSlotClosed}
        openWidth={scrollPillSlotWidth(COMPOSER_GLASS_CONTROL_SIZE)}
        visible={showScroll}
      >
        <View collapsable={false} style={styles.scrollButton}>
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
        </View>
      </WidthSlot>
      <HideScrollEdge style={styles.scrollerWrap}>
        <ScrollView
          contentContainerStyle={styles.scrollerContent}
          horizontal
          keyboardShouldPersistTaps="handled"
          onScroll={(event) => {
            const contentX = Math.round(event.nativeEvent.contentOffset.x);
            setCardsScrolled((current) => {
              const next = contentX > 0;
              return current === next ? current : next;
            });
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
          {nextShown.map((pill, index) => (
            <AnimatedCardPill
              contentWidth={pillWidths[pill.id] ?? 0}
              gap={index < nextShown.length - 1 ? SCROLL_PILL_SLOT_GAP : 0}
              key={pill.id}
              maxWidth={maxPillWidth}
              onClosed={onCardClosed}
              onPress={onPillPress}
              pill={pill}
              visible={pill.visible}
            />
          ))}
        </ScrollView>
        {cardsScrolled ? <PillScrollerFade edge="left" /> : null}
        <PillScrollerFade edge="right" />
      </HideScrollEdge>
    </View>
  );
}

function AnimatedCardPill({
  contentWidth,
  gap,
  maxWidth,
  onClosed,
  onPress,
  pill,
  visible,
}: {
  contentWidth: number;
  gap: number;
  maxWidth: number;
  onClosed: (id: CardId) => void;
  onPress: (id: CardId) => void;
  pill: ShownPill;
  visible: boolean;
}) {
  const close = useCallback(() => onClosed(pill.id), [onClosed, pill.id]);

  return (
    <View style={styles.presence}>
      <WidthSlot
        onClosed={close}
        openWidth={contentWidth > 0 ? scrollPillSlotWidth(contentWidth, gap) : 0}
        visible={visible}
      >
        {contentWidth > 0 ? (
          <View style={[styles.slotContent, { width: contentWidth }]}>
            <CardPillButton maxWidth={maxWidth} onPress={onPress} pill={pill} />
          </View>
        ) : null}
      </WidthSlot>
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
  measureOnly = false,
  onPress,
  pill,
}: {
  maxWidth: number;
  measureOnly?: boolean;
  onPress: (id: CardId) => void;
  pill: CardPill;
}) {
  const theme = useMobileTheme();
  const body = (
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
  );
  const shape = ({ pressed }: { pressed: boolean }) => ({
    alignItems: "center" as const,
    height: COMPOSER_GLASS_CONTROL_SIZE,
    justifyContent: "center" as const,
    maxWidth,
    opacity: pressed ? 0.6 : 1,
    paddingHorizontal: 14,
  });

  return (
    <GlassPanel
      {...COMPOSER_GLASS_WELL}
      interactive={!measureOnly}
      style={[styles.pill, { maxWidth }]}
    >
      {measureOnly ? (
        <Pressable accessible={false} importantForAccessibility="no-hide-descendants" style={shape}>
          {body}
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel={pill.title}
          accessibilityRole="button"
          accessibilityState={{ selected: pill.selected }}
          onPress={() => onPress(pill.id)}
          style={shape}
          testID={`agent-chat-card-pill-${pill.id}`}
        >
          {body}
        </Pressable>
      )}
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
  measureHost: {
    height: COMPOSER_GLASS_CONTROL_SIZE,
    left: 0,
    opacity: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
  },
  measurerPill: {
    alignSelf: "flex-start",
  },
  pill: {
    alignItems: "center",
    borderRadius: COMPOSER_GLASS_CONTROL_RADIUS,
    height: COMPOSER_GLASS_CONTROL_SIZE,
    justifyContent: "center",
    overflow: "visible",
  },
  pillAnchor: {
    alignSelf: "flex-start",
  },
  pillInner: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  presence: {
    flexShrink: 0,
    height: COMPOSER_GLASS_CONTROL_SIZE,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    height: COMPOSER_GLASS_CONTROL_SIZE,
    paddingLeft: PILL_SCROLL_FADE_PX,
  },
  scrollButton: {
    height: COMPOSER_GLASS_CONTROL_SIZE,
    left: 0,
    position: "absolute",
    top: 0,
    width: COMPOSER_GLASS_CONTROL_SIZE,
  },
  slot: {
    flexShrink: 0,
    height: COMPOSER_GLASS_CONTROL_SIZE,
    overflow: "visible",
  },
  slotContent: {
    left: 0,
    position: "absolute",
    top: 0,
  },
  scroller: {
    flex: 1,
    // A horizontal ScrollView on iOS has no intrinsic height, so this row
    // collapsed to 0 on the simulator while react-native-web still showed it.
    height: COMPOSER_GLASS_CONTROL_SIZE,
    overflow: "visible",
  },
  scrollerContent: {
    alignItems: "center",
    paddingRight: PILL_SCROLL_FADE_PX,
  },
  scrollerWrap: {
    flex: 1,
    minWidth: 0,
  },
});
