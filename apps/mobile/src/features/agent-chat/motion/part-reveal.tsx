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
import { LOG_ROW_EASE, LOG_ROW_REVEAL_HEIGHT_MS, LOG_ROW_REVEAL_MS } from "./log-row-motion";
import { useReducedMotion } from "./use-reduced-motion";

const HEIGHT_REVEAL = {
  duration: LOG_ROW_REVEAL_HEIGHT_MS,
  easing: Easing.bezier(LOG_ROW_EASE[0], LOG_ROW_EASE[1], LOG_ROW_EASE[2], LOG_ROW_EASE[3]),
};
const FADE_REVEAL = {
  duration: LOG_ROW_REVEAL_MS,
  easing: HEIGHT_REVEAL.easing,
};

export function PartReveal({ children, play }: { children: ReactNode; play: boolean }) {
  const reduced = useReducedMotion();
  const [latchedPlay] = useState(play && !reduced);
  const animate = latchedPlay && !reduced;
  const fade = useSharedValue(animate ? 0 : 1);
  const heightProgress = useSharedValue(animate ? 0 : 1);
  const heightSv = useSharedValue(0);
  const [done, setDone] = useState(!animate);

  useEffect(() => {
    if (!animate) {
      fade.set(1);
      heightProgress.set(1);
      return;
    }
    fade.set(0);
    heightProgress.set(0);
    fade.set(withTiming(1, FADE_REVEAL));
    heightProgress.set(withTiming(1, HEIGHT_REVEAL));
    const timer = setTimeout(() => setDone(true), LOG_ROW_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [animate, fade, heightProgress]);

  const clipStyle = useAnimatedStyle(() => ({
    height: heightSv.get() * heightProgress.get(),
  }));
  const motionStyle = useAnimatedStyle(() => ({
    opacity: fade.get(),
    transform: [{ translateY: (1 - fade.get()) * 4 }],
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
