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

type Srgb = { r: number; g: number; b: number };

function parseHexSrgb(hex: string): Srgb | null {
  const value = hex.trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(value)?.[1];
  if (short) {
    return {
      r: Number.parseInt(short[0]! + short[0], 16),
      g: Number.parseInt(short[1]! + short[1], 16),
      b: Number.parseInt(short[2]! + short[2], 16),
    };
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(value)?.[1];
  if (!full) return null;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function hexChannel(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0");
}

/**
 * Web LogRow mixes muted ink into `--background` so the stroke is opaque.
 * Elbow and trunk share a vertex, and neighbouring rows abut; translucent
 * strokes composite twice there and read as a different colour. Mixing once
 * keeps a joint the same tone as the rest of the line.
 */
export function mixOpaqueSrgb(foreground: string, background: string, amount: number): string {
  const fg = parseHexSrgb(foreground);
  const bg = parseHexSrgb(background);
  if (!fg || !bg) return foreground;
  const t = Math.min(1, Math.max(0, amount));
  return `#${hexChannel(fg.r * t + bg.r * (1 - t))}${hexChannel(fg.g * t + bg.g * (1 - t))}${hexChannel(fg.b * t + bg.b * (1 - t))}`;
}

/** Opaque tree ink at `TREE_LINE_ALPHA` over the transcript background. */
export function toolTreeInk(foreground: string, background: string): string {
  return mixOpaqueSrgb(foreground, background, TREE_LINE_ALPHA);
}

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
  clampTreeShown,
  nextTreeRevealDelay,
  nextTreeWatermark,
  treeReachLength,
} from "@atmos/agent-transcript/agent-tree-branch";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronRightIcon } from "@/ui/icons/lucide-native";
import { LOG_ROW_ELBOW_MS, LOG_ROW_TRUNK_MS, logRowElbowDelayMs } from "./motion/log-row-motion";
import { useReducedMotion } from "./motion/use-reduced-motion";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHEVRON_MS = 200;
const DRAW_EASE = Easing.linear;
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
  duration,
  length,
  stroke,
}: {
  d: string;
  delay: number;
  draw: boolean;
  duration: number;
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
    offset.set(withDelay(delay, withTiming(0, { duration, easing: DRAW_EASE })));
  }, [delay, duration, length, lengthSv, offset, skip]);

  const strokeProps = {
    d,
    fill: "none" as const,
    stroke,
    strokeLinecap: "butt" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: TREE_LINE_WIDTH,
  };

  if (skip) return <Path {...strokeProps} />;
  return <AnimatedPath {...strokeProps} animatedProps={animatedProps as never} />;
}

export function ToolTreeRow({
  children,
  draw = false,
  first,
  last,
}: {
  children: ReactNode;
  draw?: boolean;
  first: boolean;
  last: boolean;
}) {
  const theme = useMobileTheme();
  const [height, setHeight] = useState(0);
  const strokes = toolTreeStrokes({ first, last, height });
  const elbowDelay = logRowElbowDelayMs(first);
  const reachLength = treeReachLength(first ? TREE_BRANCH_FIRST_START_Y : 0, TREE_BRANCH_MID_Y);
  const trunkFrom = TREE_BRANCH_MID_Y - TREE_BRANCH_RADIUS;
  const trunkLength = height > trunkFrom ? height - trunkFrom : 0;
  const ink = toolTreeInk(theme.colors.label, theme.colors.background);

  return (
    <View style={{ flexDirection: "row", minHeight: 24 }}>
      <View pointerEvents="none" style={{ overflow: "hidden", width: TREE_BRANCH_GUTTER }}>
        {height > 0 ? (
          <Svg
            height={height}
            width={TREE_BRANCH_GUTTER}
            style={{ left: 0, position: "absolute", top: 0 }}
          >
            {strokes.trunk ? (
              <DrawnPath
                d={strokes.trunk}
                delay={0}
                draw={draw}
                duration={LOG_ROW_TRUNK_MS}
                length={trunkLength}
                stroke={ink}
              />
            ) : null}
            <DrawnPath
              d={strokes.reach}
              delay={elbowDelay}
              draw={draw}
              duration={LOG_ROW_ELBOW_MS}
              length={reachLength}
              stroke={ink}
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
