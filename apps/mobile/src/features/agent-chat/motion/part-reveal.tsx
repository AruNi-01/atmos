export function shouldPlayPartReveal(input: {
  primed: boolean;
  seen: boolean;
  streaming: boolean;
}): boolean {
  if (input.seen) return false;
  if (input.streaming) return true;
  return input.primed;
}

/** Web shrinks the 22px bottom mask to 0 as the reveal progress goes 0 → 1. */
export function revealEdgeFadeHeight(progress: number, fadePx: number): number {
  "worklet";
  const clamped = Math.min(1, Math.max(0, progress));
  return (1 - clamped) * fadePx;
}

/**
 * Same-hue stops. The keyword `transparent` is rgba(0,0,0,0) and turns a
 * light fade gray.
 */
export function revealEdgeFadeColors(background: string): [string, string] {
  if (!background.startsWith("#") || background.length !== 7) return [background, background];
  const red = Number.parseInt(background.slice(1, 3), 16);
  const green = Number.parseInt(background.slice(3, 5), 16);
  const blue = Number.parseInt(background.slice(5, 7), 16);
  return [`rgba(${red}, ${green}, ${blue}, 0)`, `rgba(${red}, ${green}, ${blue}, 1)`];
}

// @view

import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { TREE_DRAW_MS, TREE_REVEAL_FADE_PX } from "@atmos/agent-transcript/agent-tree-branch";
import { useMobileTheme } from "@/theme/theme-store";
import { useReducedMotion } from "./use-reduced-motion";

const REVEAL = {
  duration: TREE_DRAW_MS,
  easing: Easing.bezier(0.23, 1, 0.32, 1),
};

export function PartReveal({ children, play }: { children: ReactNode; play: boolean }) {
  const reduced = useReducedMotion();
  const theme = useMobileTheme();
  const fadeColors = revealEdgeFadeColors(theme.colors.background);
  const [latchedPlay] = useState(play && !reduced);
  const animate = latchedPlay && !reduced;
  const progress = useSharedValue(animate ? 0 : 1);
  const heightSv = useSharedValue(0);
  const [done, setDone] = useState(!animate);

  useEffect(() => {
    if (!animate) {
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(withTiming(1, REVEAL));
    const timer = setTimeout(() => setDone(true), TREE_DRAW_MS);
    return () => clearTimeout(timer);
  }, [animate, progress]);

  const clipStyle = useAnimatedStyle(() => ({
    height: heightSv.get() * progress.get(),
  }));
  const motionStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * 4 }],
  }));
  const fadeStyle = useAnimatedStyle(() => ({
    height: revealEdgeFadeHeight(progress.get(), TREE_REVEAL_FADE_PX),
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (next > 0 && heightSv.get() !== next) heightSv.set(next);
  };

  if (!animate || done) return <>{children}</>;

  return (
    <Animated.View style={[{ overflow: "hidden" }, clipStyle]}>
      <Animated.View
        onLayout={onLayout}
        style={[{ position: "absolute", width: "100%" }, motionStyle]}
      >
        {children}
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.fade, fadeStyle]}>
        <LinearGradient
          colors={fadeColors}
          end={{ x: 0, y: 1 }}
          locations={[0, 1]}
          start={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fade: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
  },
});
