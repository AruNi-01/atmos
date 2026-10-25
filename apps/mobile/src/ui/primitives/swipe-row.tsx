import {
  Children,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useMobileTheme } from "@/theme/theme-store";
import { SEPARATOR_THICKNESS } from "@/ui/layout/row";
import {
  applySwipeRowTouch,
  SWIPE_ROW_ACTION_GAP,
  SWIPE_ROW_ACTION_SIZE,
  SWIPE_ROW_BUTTON_EDGE,
  SWIPE_ROW_BUTTON_FADE_MS,
  SWIPE_ROW_BUTTON_MIN_SCALE,
  SWIPE_ROW_ITEM_INSET,
  swipeRowBayWidth,
  swipeRowActionReveal,
  swipeRowButtonReveal,
  swipeRowButtonShownScale,
  swipeRowCardFrame,
  swipeRowClosedCorners,
  swipeRowDragOffset,
  swipeRowGestureConfig,
  swipeRowIsOpen,
  swipeRowReleaseTarget,
  swipeRowSettleVelocity,
  SWIPE_ROW_SETTLE_SPRING,
  swipeRowSurfaceColor,
  swipeRowSurfaceOpacity,
} from "@/ui/primitives/swipe-row-press";
import type { SwipeRowAction, SwipeRowProps } from "./swipe-row.types";

const ACTION_BUTTON = SWIPE_ROW_ACTION_SIZE;
const TAP_GUARD_MS = 480;

type SwipeRowHandlers = {
  onPanFinalize: (velocityX: number, success: boolean) => void;
  onPanStart: () => void;
  onTap: () => void;
};

type SwipeEdge = "leading" | "trailing";

const rowHandlers = new Map<string, SwipeRowHandlers>();

function dispatchSwipeTap(id: string) {
  rowHandlers.get(id)?.onTap();
}

function dispatchSwipePanStart(id: string) {
  rowHandlers.get(id)?.onPanStart();
}

function dispatchSwipePanFinalize(id: string, velocityX: number, success: boolean) {
  rowHandlers.get(id)?.onPanFinalize(velocityX, success);
}

function actionWidth(count: number) {
  return swipeRowBayWidth(count);
}

function SwipeIconButton({
  color,
  icon,
  label,
  onPress,
}: {
  color: string;
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: color,
        borderRadius: ACTION_BUTTON / 2,
        height: ACTION_BUTTON,
        justifyContent: "center",
        width: ACTION_BUTTON,
      }}
    >
      {icon}
    </Pressable>
  );
}

function RevealedAction({
  align,
  count,
  indexFromEdge,
  offset,
  children,
}: {
  align: SwipeEdge;
  children: ReactNode;
  count: number;
  indexFromEdge: number;
  offset: SharedValue<number>;
}) {
  const reducedMotion = useReducedMotion() === true;
  const presence = useSharedValue(0);
  const fadeMs = useSharedValue(reducedMotion ? 0 : SWIPE_ROW_BUTTON_FADE_MS);

  useEffect(() => {
    fadeMs.set(reducedMotion ? 0 : SWIPE_ROW_BUTTON_FADE_MS);
  }, [fadeMs, reducedMotion]);

  useAnimatedReaction(
    () => {
      const opened = align === "trailing" ? -offset.get() : offset.get();
      return swipeRowButtonReveal(opened, indexFromEdge, count).scale >= SWIPE_ROW_BUTTON_MIN_SCALE;
    },
    (visible, previous) => {
      if (visible === previous) return;
      const duration = previous == null ? 0 : fadeMs.get();
      presence.set(withTiming(visible ? 1 : 0, { duration }));
    },
    [align, count, fadeMs, indexFromEdge, offset, presence],
  );

  const style = useAnimatedStyle(() => {
    const opened = align === "trailing" ? -offset.get() : offset.get();
    const reveal = swipeRowButtonReveal(opened, indexFromEdge, count);
    const scale = reveal.scale;
    const size = ACTION_BUTTON * scale;
    const screen = indexFromEdge === 0 ? SWIPE_ROW_BUTTON_EDGE * scale : 0;
    const gap = indexFromEdge > 0 ? SWIPE_ROW_ACTION_GAP * scale : 0;
    return {
      height: size,
      marginLeft: align === "leading" ? screen + gap : 0,
      marginRight: align === "trailing" ? screen + gap : 0,
      width: size,
    };
  });
  const glyphStyle = useAnimatedStyle(() => {
    const opened = align === "trailing" ? -offset.get() : offset.get();
    const reveal = swipeRowButtonReveal(opened, indexFromEdge, count);
    const fading = reveal.scale < SWIPE_ROW_BUTTON_MIN_SCALE && presence.get() > 0;
    const shown = fading ? SWIPE_ROW_BUTTON_MIN_SCALE : swipeRowButtonShownScale(reveal.scale);
    const shift = (ACTION_BUTTON * reveal.scale - ACTION_BUTTON) / 2;
    return {
      left: shift,
      opacity: presence.get(),
      top: shift,
      transform: [{ scale: shown }],
    };
  });

  return (
    <Reanimated.View style={[{ overflow: "visible" }, style]}>
      <Reanimated.View
        style={[
          {
            height: ACTION_BUTTON,
            position: "absolute",
            transformOrigin: "center",
            width: ACTION_BUTTON,
          },
          glyphStyle,
        ]}
      >
        {children}
      </Reanimated.View>
    </Reanimated.View>
  );
}

function ActionSlot({
  align,
  children,
  offset,
  revealed,
  width,
}: {
  align: SwipeEdge;
  children: ReactNode;
  offset: SharedValue<number>;
  revealed: boolean;
  width: SharedValue<number>;
}) {
  const items = Children.toArray(children);
  const slotStyle = useAnimatedStyle(() => {
    const slot = swipeRowActionReveal(offset.get(), width.get(), align);
    return { width: slot.width };
  });
  const itemGapStyle = useAnimatedStyle(() => {
    const opened = align === "trailing" ? -offset.get() : offset.get();
    const outer = swipeRowButtonReveal(opened, 0, items.length);
    return { width: SWIPE_ROW_ITEM_INSET * outer.scale };
  });
  const itemGap = <Reanimated.View style={[{ flexShrink: 0 }, itemGapStyle]} />;

  return (
    <Reanimated.View
      accessibilityElementsHidden={!revealed}
      importantForAccessibility={revealed ? "auto" : "no-hide-descendants"}
      pointerEvents={revealed ? "box-none" : "none"}
      style={[
        {
          alignItems: "center",
          flexDirection: "row",
          flexGrow: 0,
          flexShrink: 0,
          justifyContent: align === "leading" ? "flex-end" : "flex-start",
          overflow: "visible",
          width: 0,
        },
        slotStyle,
      ]}
    >
      {align === "trailing" ? itemGap : null}
      {items.map((child, visualIndex) => {
        const indexFromEdge = align === "trailing" ? items.length - 1 - visualIndex : visualIndex;
        return (
          <RevealedAction
            align={align}
            count={items.length}
            indexFromEdge={indexFromEdge}
            key={visualIndex}
            offset={offset}
          >
            {child}
          </RevealedAction>
        );
      })}
      {align === "leading" ? itemGap : null}
    </Reanimated.View>
  );
}

export function SwipeRow({
  children,
  leading = [],
  onPress,
  onRevealedChange,
  roundedBottom = false,
  roundedTop = false,
  trailing = [],
}: SwipeRowProps) {
  const theme = useMobileTheme();
  const reducedMotion = useReducedMotion() === true;
  const leadingWidth = actionWidth(leading.length);
  const trailingWidth = actionWidth(trailing.length);
  const rowWidth = useSharedValue(0);
  const offset = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const leadingW = useSharedValue(leadingWidth);
  const trailingW = useSharedValue(trailingWidth);
  const openColor = useSharedValue(theme.colors.secondaryBackground);
  const pressColor = useSharedValue(theme.colors.mutedPressed);
  const pressed = useSharedValue(false);
  const roundedTopSv = useSharedValue(roundedTop);
  const roundedBottomSv = useSharedValue(roundedBottom);
  const revealedRef = useRef(false);
  const panActiveRef = useRef(false);
  const suppressNavigateRef = useRef(false);
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowId = useId();
  const onPressRef = useRef(onPress);
  const onRevealedChangeRef = useRef(onRevealedChange);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    leadingW.set(leadingWidth);
    trailingW.set(trailingWidth);
    openColor.set(theme.colors.secondaryBackground);
    pressColor.set(theme.colors.mutedPressed);
    roundedTopSv.set(roundedTop);
    roundedBottomSv.set(roundedBottom);
  }, [
    leadingW,
    leadingWidth,
    openColor,
    pressColor,
    roundedBottom,
    roundedBottomSv,
    roundedTop,
    roundedTopSv,
    theme.colors.mutedPressed,
    theme.colors.secondaryBackground,
    trailingW,
    trailingWidth,
  ]);

  const commitRevealed = useCallback((open: boolean) => {
    revealedRef.current = open;
    setRevealed(open);
  }, []);

  const settle = useCallback(
    (target: number, velocityX = 0) => {
      commitRevealed(target !== 0);
      const finished = (done?: boolean) => {
        "worklet";
        if (done) scheduleOnRN(commitRevealed, target !== 0);
      };
      const velocity = swipeRowSettleVelocity(velocityX, target - offset.get());
      offset.set(
        reducedMotion
          ? withTiming(target, { duration: 0 }, finished)
          : withSpring(target, { ...SWIPE_ROW_SETTLE_SPRING, velocity }, finished),
      );
    },
    [commitRevealed, offset, reducedMotion],
  );

  const onTap = useCallback(() => {
    if (suppressNavigateRef.current) {
      if (revealedRef.current) settle(0);
      return;
    }
    applySwipeRowTouch(
      { kind: "tap", revealed: revealedRef.current },
      {
        close: () => settle(0),
        navigate: () => onPressRef.current?.(),
      },
    );
  }, [settle]);

  const armNavigateSuppression = useCallback(() => {
    suppressNavigateRef.current = true;
    if (suppressTimer.current) clearTimeout(suppressTimer.current);
    suppressTimer.current = setTimeout(() => {
      suppressNavigateRef.current = false;
    }, TAP_GUARD_MS);
  }, []);

  const onPanStart = useCallback(() => {
    // Set before the finger lifts so a same-turn tap cannot navigate.
    panActiveRef.current = true;
    suppressNavigateRef.current = true;
    if (suppressTimer.current) clearTimeout(suppressTimer.current);
    suppressTimer.current = null;
    applySwipeRowTouch(
      { kind: "pan", revealed: revealedRef.current },
      { close() {}, navigate() {} },
    );
  }, []);

  const onPanFinalize = useCallback(
    (velocityX: number, success: boolean) => {
      if (!panActiveRef.current && !success) return;
      panActiveRef.current = false;
      armNavigateSuppression();
      if (!success) {
        settle(0, velocityX);
        return;
      }
      settle(
        swipeRowReleaseTarget(offset.get(), velocityX, leadingWidth, trailingWidth),
        velocityX,
      );
    },
    [armNavigateSuppression, leadingWidth, offset, settle, trailingWidth],
  );

  useEffect(() => {
    onPressRef.current = onPress;
    onRevealedChangeRef.current = onRevealedChange;
    rowHandlers.set(rowId, { onPanFinalize, onPanStart, onTap });
    return () => {
      rowHandlers.delete(rowId);
    };
  }, [onPanFinalize, onPanStart, onPress, onRevealedChange, onTap, rowId]);

  const reportRevealed = useCallback((open: boolean) => {
    onRevealedChangeRef.current?.(open);
  }, []);

  useAnimatedReaction(
    () => swipeRowIsOpen(offset.get()),
    (open, previous) => {
      if (previous == null || open === previous) return;
      scheduleOnRN(reportRevealed, open);
    },
    [offset, reportRevealed],
  );

  useEffect(
    () => () => {
      if (suppressTimer.current) clearTimeout(suppressTimer.current);
      onRevealedChangeRef.current?.(false);
    },
    [],
  );

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetX([
        -swipeRowGestureConfig.panActiveOffsetX,
        swipeRowGestureConfig.panActiveOffsetX,
      ])
      .failOffsetY([-swipeRowGestureConfig.panFailOffsetY, swipeRowGestureConfig.panFailOffsetY])
      .onTouchesDown(() => {
        pressed.set(true);
      })
      .onTouchesUp(() => {
        pressed.set(false);
      })
      .onTouchesCancelled(() => {
        pressed.set(false);
      })
      .onStart(() => {
        dragStart.set(offset.get());
        scheduleOnRN(dispatchSwipePanStart, rowId);
      })
      .onUpdate((event) => {
        offset.set(
          swipeRowDragOffset(dragStart.get(), event.translationX, leadingW.get(), trailingW.get()),
        );
      })
      .onFinalize((event, success) => {
        pressed.set(false);
        scheduleOnRN(dispatchSwipePanFinalize, rowId, event.velocityX, success);
      });
    const tap = Gesture.Tap()
      .maxDistance(swipeRowGestureConfig.tapMaxDistance)
      .onEnd((_event, success) => {
        if (success) scheduleOnRN(dispatchSwipeTap, rowId);
      });
    return Gesture.Exclusive(pan, tap);
  }, [dragStart, leadingW, offset, pressed, rowId, trailingW]);

  const cardStyle = useAnimatedStyle(() => {
    const frame = swipeRowCardFrame(offset.get(), roundedTopSv.get(), roundedBottomSv.get());
    return {
      borderBottomLeftRadius: frame.radiusBottomLeft,
      borderBottomRightRadius: frame.radiusBottomRight,
      borderTopLeftRadius: frame.radiusTopLeft,
      borderTopRightRadius: frame.radiusTopRight,
      borderWidth: frame.borderWidth,
    };
  });
  const trackStyle = useAnimatedStyle(() => {
    const x = offset.get();
    const width = rowWidth.get();
    const lead = Math.max(x, 0);
    const trail = Math.max(-x, 0);
    return {
      transform: [{ translateX: Math.min(x, 0) }],
      width: width > 0 ? width + lead + trail : undefined,
    };
  });
  const contentStyle = useAnimatedStyle(() => {
    const width = rowWidth.get();
    if (!(width > 0)) return {};
    return { maxWidth: width, width };
  });
  const fillStyle = useAnimatedStyle(() => {
    const x = offset.get();
    const frame = swipeRowCardFrame(x, roundedTopSv.get(), roundedBottomSv.get());
    const fade = swipeRowSurfaceOpacity(x);
    const showPress = pressed.get() && fade === 0;
    return {
      backgroundColor: swipeRowSurfaceColor(x, pressed.get(), {
        mutedPressed: pressColor.get(),
        secondaryBackground: openColor.get(),
      }),
      borderBottomLeftRadius: frame.radiusBottomLeft,
      borderBottomRightRadius: frame.radiusBottomRight,
      borderCurve: "continuous" as const,
      borderTopLeftRadius: frame.radiusTopLeft,
      borderTopRightRadius: frame.radiusTopRight,
      bottom: -SEPARATOR_THICKNESS,
      left: 0,
      opacity: showPress ? 1 : fade,
      position: "absolute" as const,
      right: 0,
      top: -SEPARATOR_THICKNESS,
    };
  });

  const activates = onPress != null || revealed;
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "activate") onTap();
  };
  const runAction = (action: (() => void) | undefined) => {
    if (!action) return;
    settle(0);
    action();
  };

  const pressAction = (action: SwipeRowAction) => runAction(action.onPress);

  return (
    <View
      collapsable={false}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        // Only the closed row. Measuring while the track is wider makes the
        // fill run over the buttons.
        if (next > 0 && Math.abs(offset.get()) < 0.5 && Math.abs(rowWidth.get() - next) > 0.5) {
          rowWidth.set(next);
        }
      }}
      style={styles.bounds}
    >
      <View
        style={[
          styles.clip,
          // The card corner stays put. The item translates inside it, so a
          // square fill cannot paint outside the first or last row's curve.
          { borderCurve: "continuous" },
          swipeRowClosedCorners(roundedTop, roundedBottom),
        ]}
      >
        <Reanimated.View style={[styles.track, trackStyle]}>
          {leading.length > 0 ? (
            <ActionSlot align="leading" offset={offset} revealed={revealed} width={leadingW}>
              {[...leading].reverse().map((action, index) => (
                <SwipeIconButton
                  color={action.color}
                  icon={action.icon}
                  key={`${action.label}:${index}`}
                  label={action.label}
                  onPress={() => pressAction(action)}
                />
              ))}
            </ActionSlot>
          ) : null}
          <GestureDetector gesture={gesture}>
            <Reanimated.View
              accessibilityActions={activates ? [{ name: "activate" }] : undefined}
              accessibilityRole={activates ? "button" : undefined}
              accessibilityState={activates ? { expanded: revealed } : undefined}
              accessible={activates}
              collapsable={false}
              onAccessibilityAction={activates ? onAccessibilityAction : undefined}
              onAccessibilityTap={activates ? onTap : undefined}
              style={[
                {
                  borderCurve: "continuous",
                  flexGrow: 0,
                  flexShrink: 0,
                  ...swipeRowClosedCorners(roundedTop, roundedBottom),
                },
                contentStyle,
                cardStyle,
                { overflow: "hidden" },
              ]}
            >
              <Reanimated.View pointerEvents="none" style={fillStyle} />
              {children}
            </Reanimated.View>
          </GestureDetector>
          {trailing.length > 0 ? (
            <ActionSlot align="trailing" offset={offset} revealed={revealed} width={trailingW}>
              {trailing.map((action, index) => (
                <SwipeIconButton
                  color={action.color}
                  icon={action.icon}
                  key={`${action.label}:${index}`}
                  label={action.label}
                  onPress={() => pressAction(action)}
                />
              ))}
            </ActionSlot>
          ) : null}
        </Reanimated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bounds: {
    width: "100%",
  },
  clip: {
    overflow: "hidden",
    width: "100%",
  },
  track: {
    flexDirection: "row",
  },
});

export function useOpenSwipeRows() {
  const [openIds, setOpenIds] = useState<readonly string[]>([]);
  const setOpen = useCallback((id: string, open: boolean) => {
    setOpenIds((current) => {
      const without = current.filter((item) => item !== id);
      return open ? [...without, id] : without;
    });
  }, []);
  return { openIds, setOpen };
}

export type { SwipeRowAction, SwipeRowProps } from "./swipe-row.types";
