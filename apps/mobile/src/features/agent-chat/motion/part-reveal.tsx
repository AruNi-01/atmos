export function shouldPlayPartReveal(input: {
  primed: boolean;
  seen: boolean;
  streaming: boolean;
}): boolean {
  if (input.seen) return false;
  if (input.streaming) return true;
  return input.primed;
}

// @view

import { useEffect, useState, type ReactNode } from "react";
import type { LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { TREE_DRAW_MS } from "@atmos/agent-transcript/agent-tree-branch";
import { useReducedMotion } from "./use-reduced-motion";

const REVEAL = {
  duration: TREE_DRAW_MS,
  easing: Easing.bezier(0.23, 1, 0.32, 1),
};

export function PartReveal({ children, play }: { children: ReactNode; play: boolean }) {
  const reduced = useReducedMotion();
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
    </Animated.View>
  );
}
