import { useEffect } from "react";
import { Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { METRIC_TWEEN_MS } from "@/features/token-usage/tween-series";

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

function clampPercent(percent: number) {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

/** Width of a meter fill. The first paint grows from empty; later values ease from the current width. */
export function useMeterWidth(percent: number) {
  const reduced = useReducedMotion();
  const ratio = useSharedValue(reduced ? clampPercent(percent) : 0);
  useEffect(() => {
    const next = clampPercent(percent);
    if (reduced) {
      ratio.set(next);
      return;
    }
    ratio.set(withTiming(next, {
      duration: METRIC_TWEEN_MS,
      easing: EASE_OUT,
      reduceMotion: ReduceMotion.System,
    }));
  }, [percent, ratio, reduced]);
  return useAnimatedStyle(() => ({ width: `${ratio.get()}%` }));
}
