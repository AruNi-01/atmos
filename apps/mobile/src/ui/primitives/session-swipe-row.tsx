import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useMobileTheme } from "@/theme/theme-store";
import { ArchiveIcon, PinIcon, TrashIcon } from "@/ui/icons/lucide-native";
import {
  applySwipeRowTouch,
  swipeRowCardFrame,
  swipeRowGestureConfig,
  swipeRowWellColor,
} from "@/ui/primitives/swipe-row-press";
import type { SessionSwipeRowProps } from "./session-swipe-row.types";

const ACTION_BUTTON = 44;
const ACTION_GAP = 8;
const ACTION_PAD = 12;
const SNAP_MS = 180;

type SwipeRowHandlers = {
  onPanFinalize: (velocityX: number, success: boolean) => void;
  onPanStart: () => void;
  onTap: () => void;
};

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
  if (count <= 0) return 0;
  return ACTION_PAD + count * ACTION_BUTTON + (count - 1) * ACTION_GAP + ACTION_PAD;
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

export function SessionSwipeRow({
  archiveLabel = "Archive",
  backgroundColor,
  children,
  deleteLabel = "Delete",
  onArchive,
  onDelete,
  onPin,
  onPress,
  pinLabel,
}: SessionSwipeRowProps) {
  const theme = useMobileTheme();
  const reducedMotion = useReducedMotion() === true;
  const leadingWidth = actionWidth(1);
  const trailingCount = Number(Boolean(onArchive)) + Number(Boolean(onDelete));
  const trailingWidth = actionWidth(trailingCount);
  const offset = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const leadingW = useSharedValue(leadingWidth);
  const trailingW = useSharedValue(trailingWidth);
  const wellColor = useSharedValue(theme.colors.background);
  const cardColor = useSharedValue(backgroundColor);
  const revealedRef = useRef(false);
  const panActiveRef = useRef(false);
  const suppressNavigateRef = useRef(false);
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowId = useId();
  const onPressRef = useRef(onPress);
  const onPinRef = useRef(onPin);
  const onArchiveRef = useRef(onArchive);
  const onDeleteRef = useRef(onDelete);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    leadingW.set(leadingWidth);
    trailingW.set(trailingWidth);
    wellColor.set(theme.colors.background);
    cardColor.set(backgroundColor);
  }, [
    backgroundColor,
    cardColor,
    leadingW,
    leadingWidth,
    theme.colors.background,
    trailingW,
    trailingWidth,
    wellColor,
  ]);

  const commitRevealed = useCallback((open: boolean) => {
    revealedRef.current = open;
    setRevealed(open);
  }, []);

  const settle = useCallback(
    (target: number) => {
      commitRevealed(target !== 0);
      offset.set(
        withTiming(
          target,
          {
            duration: reducedMotion ? 0 : SNAP_MS,
            easing: Easing.out(Easing.cubic),
          },
          (finished) => {
            if (finished) scheduleOnRN(commitRevealed, target !== 0);
          },
        ),
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
    }, SNAP_MS + 80);
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
        settle(0);
        return;
      }
      const current = offset.get();
      let target = 0;
      if (current > 0 && leadingWidth > 0) {
        target = current > leadingWidth * 0.35 || velocityX > 700 ? leadingWidth : 0;
      } else if (current < 0 && trailingWidth > 0) {
        target = -current > trailingWidth * 0.35 || velocityX < -700 ? -trailingWidth : 0;
      }
      settle(target);
    },
    [armNavigateSuppression, leadingWidth, offset, settle, trailingWidth],
  );

  useEffect(() => {
    onPressRef.current = onPress;
    onPinRef.current = onPin;
    onArchiveRef.current = onArchive;
    onDeleteRef.current = onDelete;
    rowHandlers.set(rowId, { onPanFinalize, onPanStart, onTap });
    return () => {
      rowHandlers.delete(rowId);
    };
  }, [onArchive, onDelete, onPanFinalize, onPanStart, onPin, onPress, onTap, rowId]);

  useEffect(
    () => () => {
      if (suppressTimer.current) clearTimeout(suppressTimer.current);
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
      .onStart(() => {
        dragStart.set(offset.get());
        scheduleOnRN(dispatchSwipePanStart, rowId);
      })
      .onUpdate((event) => {
        const next = dragStart.get() + event.translationX;
        const clamped = Math.min(leadingW.get(), Math.max(-trailingW.get(), next));
        offset.set(clamped);
      })
      .onFinalize((event, success) => {
        scheduleOnRN(dispatchSwipePanFinalize, rowId, event.velocityX, success);
      });
    const tap = Gesture.Tap()
      .maxDistance(swipeRowGestureConfig.tapMaxDistance)
      .onEnd((_event, success) => {
        if (success) scheduleOnRN(dispatchSwipeTap, rowId);
      });
    return Gesture.Exclusive(pan, tap);
  }, [dragStart, leadingW, offset, rowId, trailingW]);

  const wellStyle = useAnimatedStyle(() => ({
    backgroundColor: swipeRowWellColor(offset.get(), wellColor.get()),
  }));
  const cardStyle = useAnimatedStyle(() => {
    const frame = swipeRowCardFrame(offset.get());
    return {
      backgroundColor: cardColor.get(),
      borderRadius: frame.radius,
      marginBottom: frame.marginBottom,
      marginLeft: frame.marginLeft,
      marginRight: frame.marginRight,
      marginTop: frame.marginTop,
    };
  });

  const runAction = (action: (() => void) | undefined) => {
    if (!action) return;
    settle(0);
    action();
  };

  return (
    <Reanimated.View style={[{ overflow: "hidden" }, wellStyle]}>
      <View
        accessibilityElementsHidden={!revealed}
        importantForAccessibility={revealed ? "auto" : "no-hide-descendants"}
        pointerEvents={revealed ? "box-none" : "none"}
        style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
      >
        <View
          style={{
            alignItems: "center",
            bottom: 0,
            flexDirection: "row",
            gap: ACTION_GAP,
            justifyContent: "center",
            left: 0,
            position: "absolute",
            top: 0,
            width: leadingWidth,
          }}
        >
          <SwipeIconButton
            color="#2563eb"
            icon={<PinIcon color="#ffffff" size={20} />}
            label={pinLabel}
            onPress={() => runAction(onPinRef.current)}
          />
        </View>
        {trailingWidth > 0 ? (
          <View
            style={{
              alignItems: "center",
              bottom: 0,
              flexDirection: "row",
              gap: ACTION_GAP,
              justifyContent: "center",
              position: "absolute",
              right: 0,
              top: 0,
              width: trailingWidth,
            }}
          >
            {onArchive ? (
              <SwipeIconButton
                color="#d97706"
                icon={<ArchiveIcon color="#ffffff" size={20} />}
                label={archiveLabel}
                onPress={() => runAction(onArchiveRef.current)}
              />
            ) : null}
            {onDelete ? (
              <SwipeIconButton
                color="#dc2626"
                icon={<TrashIcon color="#ffffff" size={20} />}
                label={deleteLabel}
                onPress={() => runAction(onDeleteRef.current)}
              />
            ) : null}
          </View>
        ) : null}
      </View>
      <GestureDetector gesture={gesture}>
        <Reanimated.View
          accessible
          accessibilityRole="button"
          accessibilityState={{ expanded: revealed }}
          onAccessibilityTap={onTap}
          style={[{ borderCurve: "continuous", overflow: "hidden", zIndex: 1 }, cardStyle]}
        >
          {children}
        </Reanimated.View>
      </GestureDetector>
    </Reanimated.View>
  );
}

export type { SessionSwipeRowProps } from "./session-swipe-row.types";
