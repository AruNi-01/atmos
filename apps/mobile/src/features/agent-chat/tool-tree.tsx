import {
  TREE_BRANCH_FIRST_START_Y,
  TREE_BRANCH_GUTTER,
  TREE_BRANCH_MID_Y,
  TREE_BRANCH_RADIUS,
  TREE_LINE_ALPHA,
  TREE_LINE_WIDTH,
  treeReachPath,
  treeTrunkPath,
} from "@atmos/agent-transcript/agent-tree-branch";

export { TREE_BRANCH_GUTTER, TREE_LINE_ALPHA, TREE_LINE_WIDTH };

/** Fully drawn elbow plus the trunk that continues into the next row. */
export function toolTreeStrokes(input: { first: boolean; last: boolean; height: number }): {
  reach: string;
  trunk: string | null;
} {
  const reach = treeReachPath(input.first ? TREE_BRANCH_FIRST_START_Y : 0, TREE_BRANCH_MID_Y);
  const trunk =
    input.last || input.height <= 0
      ? null
      : treeTrunkPath(TREE_BRANCH_MID_Y - TREE_BRANCH_RADIUS, input.height);
  return { reach, trunk };
}

// @view

import { useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import {
  TREE_DRAW_MS,
  clampTreeShown,
  nextTreeRevealDelay,
  nextTreeWatermark,
  treeReachLength,
  treeSegmentDelayMs,
  treeStaggerDelayMs,
} from "@atmos/agent-transcript/agent-tree-branch";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronRightIcon } from "@/ui/icons/lucide-native";
import { chatForeground } from "./chat-ink";
import { useReducedMotion } from "./motion/use-reduced-motion";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHEVRON_MS = 200;
const DRAW_EASE = Easing.bezier(0.23, 1, 0.32, 1);
const CHEVRON_EASE = Easing.bezier(0.22, 1, 0.36, 1);
const DASH_ARRAY = ["stroke", "Dash", "array"].join("");
const DASH_OFFSET = ["stroke", "Dash", "offset"].join("");

/**
 * Rows already on screen stay put. Only the delta that arrives while the group
 * is open is released one row at a time. Folding does not replay the draw.
 */
export function useToolTreeReveal(
  count: number,
  active: boolean,
): { shown: number; watermark: number } {
  const reduced = useReducedMotion();
  const play = active && !reduced;
  const [seen, setSeen] = useState(count);
  const [shown, setShown] = useState(count);

  // Closed groups treat every current row as already seen. Doing it here keeps
  // the watermark in the same render, so reopening does not replay the draw.
  if (!play && seen !== count) setSeen(count);
  if (!play && shown !== count) setShown(count);
  if (play && shown > count) setShown(count);

  const watermark = nextTreeWatermark(seen, count, play);

  useEffect(() => {
    if (!play || shown >= count) return;
    const delay = nextTreeRevealDelay(shown, count - shown);
    const timer = setTimeout(() => {
      setShown((prev) => Math.min(count, prev + 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [play, shown, count]);

  return {
    shown: play ? clampTreeShown(shown, count, watermark, true) : count,
    watermark,
  };
}

export function ExpandChevron({
  color,
  open,
  size = 12,
}: {
  color?: string;
  open: boolean;
  size?: number;
}) {
  const theme = useMobileTheme();
  const reduced = useReducedMotion();
  const rotation = useSharedValue(open ? 90 : 0);
  const wasOpen = useRef<boolean | null>(null);

  useEffect(() => {
    const next = open ? 90 : 0;
    if (wasOpen.current === null || wasOpen.current === open || reduced) {
      rotation.set(next);
    } else {
      rotation.set(withTiming(next, { duration: CHEVRON_MS, easing: CHEVRON_EASE }));
    }
    wasOpen.current = open;
  }, [open, reduced, rotation]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get()}deg` }],
  }));

  return (
    <Animated.View style={style}>
      <ChevronRightIcon
        color={color ?? theme.colors.secondaryLabel}
        size={size}
        strokeWidth={2.2}
      />
    </Animated.View>
  );
}

function DrawnPath({
  d,
  delay,
  draw,
  length,
  stroke,
}: {
  d: string;
  delay: number;
  draw: boolean;
  length: number;
  stroke: string;
}) {
  const reduced = useReducedMotion();
  const skip = reduced || !draw;
  const offset = useSharedValue(skip || length <= 0 ? 0 : length);
  const lengthSv = useSharedValue(length);
  const started = useRef(false);
  const animatedProps = useAnimatedProps(() => {
    const props: Record<string, number> = {};
    props[DASH_ARRAY] = lengthSv.get();
    props[DASH_OFFSET] = offset.get();
    return props;
  });

  useEffect(() => {
    lengthSv.set(length);
    if (skip) {
      offset.set(0);
      return;
    }
    if (started.current || length <= 0) return;
    started.current = true;
    offset.set(length);
    offset.set(withDelay(delay, withTiming(0, { duration: TREE_DRAW_MS, easing: DRAW_EASE })));
  }, [delay, length, lengthSv, offset, skip]);

  const strokeProps = {
    d,
    fill: "none" as const,
    stroke,
    strokeLinecap: "butt" as const,
    strokeLinejoin: "round" as const,
    strokeOpacity: TREE_LINE_ALPHA,
    strokeWidth: TREE_LINE_WIDTH,
  };

  if (skip) return <Path {...strokeProps} />;
  return <AnimatedPath {...strokeProps} animatedProps={animatedProps as never} />;
}

export function ToolTreeRow({
  children,
  count = 1,
  delayMs,
  draw = false,
  first,
  index = 0,
  last,
}: {
  children: ReactNode;
  count?: number;
  /** Sequential arrivals start immediately. Omit to stagger a batch. */
  delayMs?: number;
  draw?: boolean;
  first: boolean;
  index?: number;
  last: boolean;
}) {
  const theme = useMobileTheme();
  const [height, setHeight] = useState(0);
  const stroke = chatForeground(theme.isDark);
  const strokes = toolTreeStrokes({ first, last, height });
  const delay =
    delayMs ?? (count <= 1 ? treeSegmentDelayMs(index) : treeStaggerDelayMs(index, count));
  const reachLength = treeReachLength(first ? TREE_BRANCH_FIRST_START_Y : 0, TREE_BRANCH_MID_Y);
  const trunkFrom = TREE_BRANCH_MID_Y - TREE_BRANCH_RADIUS;
  const trunkLength = height > trunkFrom ? height - trunkFrom : 0;

  return (
    <View style={{ flexDirection: "row", minHeight: 24 }}>
      <View pointerEvents="none" style={{ width: TREE_BRANCH_GUTTER }}>
        {height > 0 ? (
          <Svg
            height={height}
            width={TREE_BRANCH_GUTTER}
            style={{ left: 0, position: "absolute", top: 0 }}
          >
            {strokes.trunk ? (
              <DrawnPath
                d={strokes.trunk}
                delay={delay}
                draw={draw}
                length={trunkLength}
                stroke={stroke}
              />
            ) : null}
            <DrawnPath
              d={strokes.reach}
              delay={delay}
              draw={draw}
              length={reachLength}
              stroke={stroke}
            />
          </Svg>
        ) : null}
      </View>
      <View
        onLayout={(event) => {
          const next = event.nativeEvent.layout.height;
          setHeight((current) => (current === next ? current : next));
        }}
        style={{ flex: 1, minWidth: 0 }}
      >
        {children}
      </View>
    </View>
  );
}
