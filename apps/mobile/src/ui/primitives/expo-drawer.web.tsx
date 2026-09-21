import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DRAWER_CORNER_RADIUS,
  DRAWER_EDGE_INSET,
  drawerAttachTop,
  drawerHalfTop,
  nextDrawerSnap,
} from "@/ui/primitives/expo-drawer-geometry";
import { useMobileTheme } from "@/theme/theme-store";

type SnapPoint = "half" | "full" | { fraction: number } | { height: number };

const SPRING = {
  bounciness: 0,
  overshootClamping: true,
  speed: 16,
  useNativeDriver: false as const,
};

/**
 * Web fallback for the Expo BottomSheet drawer.
 * Mirrors iOS 26: half detent is inset from the display edge; full is edge-attached.
 */
export function ExpoDrawer({
  children,
  isPresented,
  onDismiss,
  testID,
}: {
  children: ReactNode;
  isPresented: boolean;
  onDismiss: () => void;
  snapPoints?: SnapPoint[];
  testID?: string;
}) {
  const theme = useMobileTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const halfTop = drawerHalfTop(windowHeight);
  const attachTop = Math.max(drawerAttachTop(windowHeight), 1);
  const [mounted, setMounted] = useState(isPresented);
  const top = useRef(new Animated.Value(windowHeight)).current;
  const topOffset = useRef(windowHeight);
  const dragStartTop = useRef(halfTop);
  const windowHeightRef = useRef(windowHeight);
  const halfTopRef = useRef(halfTop);
  const wasPresented = useRef(false);
  windowHeightRef.current = windowHeight;
  halfTopRef.current = halfTop;

  const setTop = (value: number) => {
    topOffset.current = value;
    top.setValue(value);
  };

  const springTo = (value: number, done?: () => void) => {
    topOffset.current = value;
    Animated.spring(top, { ...SPRING, toValue: value }).start(({ finished }) => {
      if (finished) done?.();
    });
  };

  useEffect(() => {
    if (isPresented) {
      wasPresented.current = true;
      setMounted(true);
      top.stopAnimation();
      setTop(windowHeightRef.current);
      const frame = requestAnimationFrame(() => springTo(halfTopRef.current));
      return () => cancelAnimationFrame(frame);
    }
    if (!wasPresented.current) return;
    wasPresented.current = false;
    springTo(windowHeightRef.current, () => setMounted(false));
  }, [isPresented]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          top.stopAnimation((value) => {
            dragStartTop.current = typeof value === "number" ? value : topOffset.current;
            topOffset.current = dragStartTop.current;
          });
        },
        onPanResponderMove: (_event, gesture) => {
          const next = Math.min(
            windowHeightRef.current,
            Math.max(0, dragStartTop.current + gesture.dy),
          );
          setTop(next);
        },
        onPanResponderRelease: (_event, gesture) => {
          const snap = nextDrawerSnap({
            halfTop: halfTopRef.current,
            top: topOffset.current,
            vy: gesture.vy,
          });
          if (snap === "dismiss") {
            springTo(windowHeightRef.current, onDismiss);
            return;
          }
          springTo(snap === "full" ? 0 : halfTopRef.current);
        },
      }),
    [onDismiss],
  );

  const inset = top.interpolate({
    inputRange: [0, attachTop, halfTop, windowHeight],
    outputRange: [0, DRAWER_EDGE_INSET, DRAWER_EDGE_INSET, DRAWER_EDGE_INSET],
    extrapolate: "clamp",
  });
  const radius = top.interpolate({
    inputRange: [0, attachTop, halfTop, windowHeight],
    outputRange: [0, DRAWER_CORNER_RADIUS, DRAWER_CORNER_RADIUS, DRAWER_CORNER_RADIUS],
    extrapolate: "clamp",
  });
  const backdropOpacity = top.interpolate({
    inputRange: [halfTop, windowHeight],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  if (!mounted) return null;

  return (
    <Modal animationType="none" onRequestClose={onDismiss} testID={testID} transparent visible>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable onPress={onDismiss} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.sheetBackground,
              borderRadius: radius,
              bottom: inset,
              left: inset,
              paddingBottom: Math.max(insets.bottom, 24),
              right: inset,
              top,
            },
          ]}
        >
          <View
            style={[
              styles.handle,
              {
                backgroundColor: theme.isDark ? "rgba(235, 235, 245, 0.32)" : "rgba(60, 60, 67, 0.30)",
              },
            ]}
          />
          <View style={styles.body}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.36)",
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  handle: {
    alignSelf: "center",
    borderRadius: 999,
    height: 5,
    marginTop: 12,
    width: 36,
  },
  root: {
    flex: 1,
  },
  sheet: {
    borderCurve: "continuous",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.28)",
    overflow: "hidden",
    position: "absolute",
    touchAction: "none",
  },
});
