import { useEffect, useRef, useState } from "react";
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import { Easing, useReducedMotion } from "react-native-reanimated";
import { NumberFlow } from "number-flow-react-native";
import { flowParts } from "@/features/token-usage/format";
import { METRIC_TWEEN_MS } from "@/features/token-usage/tween-series";

/** Same curve as the charts. `bezierFn` is a worklet; `withTiming` rejects a plain function. */
const ROLL = {
  duration: METRIC_TWEEN_MS,
  easing: Easing.bezierFn(0.23, 1, 0.32, 1),
};

/** Frames to wait so NumberFlow's digit slots exist before the first value change. */
const INTRO_FRAMES = 8;

type Parts = ReturnType<typeof flowParts>;

function sameParts(left: Parts, right: Parts) {
  return left.value === right.value
    && left.prefix === right.prefix
    && left.suffix === right.suffix
    && left.fraction === right.fraction;
}

/** Rolls a formatted metric with NumberFlow. Compact units stay prefix and suffix, because Hermes drops Intl compact notation. */
export function AnimatedMetric({
  format,
  style,
  value,
}: {
  format: (value: number) => string;
  style?: StyleProp<TextStyle>;
  value: number;
}) {
  const reduced = useReducedMotion();
  const target = flowParts(format(value));
  const targetRef = useRef(target);
  targetRef.current = target;
  // NumberFlow paints its first value in place. Hold 0 until the slots mount, then roll to the real figure.
  const rolled = useRef(Boolean(reduced));
  const [parts, setParts] = useState<Parts>(() => (reduced ? target : { ...target, value: 0 }));

  useEffect(() => {
    if (!rolled.current) return;
    const next = targetRef.current;
    setParts((current) => (sameParts(current, next) ? current : next));
  }, [reduced, target.fraction, target.prefix, target.suffix, target.value]);

  useEffect(() => {
    if (rolled.current) return;
    let frame = 0;
    let raf = 0;
    const step = () => {
      frame += 1;
      if (frame < INTRO_FRAMES) {
        raf = requestAnimationFrame(step);
        return;
      }
      if (rolled.current) return;
      rolled.current = true;
      setParts(targetRef.current);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <NumberFlow
      format={{
        maximumFractionDigits: parts.fraction,
        minimumFractionDigits: parts.fraction,
        useGrouping: false,
      }}
      locales="en-US"
      opacityTiming={ROLL}
      prefix={parts.prefix}
      spinTiming={ROLL}
      style={StyleSheet.flatten(style)}
      suffix={parts.suffix}
      transformTiming={ROLL}
      value={parts.value}
    />
  );
}
