import { useEffect, useRef, useState } from "react";
import { type StyleProp, type TextStyle, Text } from "react-native";

const DURATION_MS = 480;

/** Tweens a metric on the JS thread. Formatting must not run inside a worklet. */
export function AnimatedMetric({
  format,
  style,
  value,
}: {
  format: (value: number) => string;
  style?: StyleProp<TextStyle>;
  value: number;
}) {
  const formatRef = useRef(format);
  formatRef.current = format;
  const shownRef = useRef(value);
  const [label, setLabel] = useState(() => format(value));

  useEffect(() => {
    const from = shownRef.current;
    const to = value;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) {
      shownRef.current = to;
      setLabel(formatRef.current(to));
      return;
    }

    const started = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - started) / DURATION_MS);
      const eased = 1 - (1 - t) ** 3;
      const next = t === 1 ? to : from + (to - from) * eased;
      shownRef.current = next;
      setLabel(formatRef.current(next));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  useEffect(() => {
    setLabel(formatRef.current(shownRef.current));
  });

  return <Text style={style}>{label}</Text>;
}
