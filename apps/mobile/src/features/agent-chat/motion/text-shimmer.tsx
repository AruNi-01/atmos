import { createContext, useContext, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
} from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useMobileTheme } from "@/theme/theme-store";
import { useReducedMotion } from "./use-reduced-motion";

const SWEEP = [0, 0.35, 0.5, 0.65, 1] as const;

/**
 * Web `TextShimmer` `--base-color` and `--base-gradient-color`.
 * Light is `#a1a1aa` sweeping `#000`. Dark is `#71717a` sweeping `#ffffff`.
 * The sweep replaces a caller color, the same way that gradient replaces inherited type.
 */
const SHIMMER_BASE_LIGHT = "#a1a1aa";
const SHIMMER_BASE_DARK = "#71717a";
const SHIMMER_HIGHLIGHT_LIGHT = "#000000";
const SHIMMER_HIGHLIGHT_DARK = "#ffffff";

/**
 * The product sweep is a masked gradient. Run 39156539680 logged
 * `[parity] replay start` after `recordVideo` was already open, then that
 * process never logged again. The masked view mounts inside the replay
 * render. The parity replay uses a text highlight instead, so the replay
 * interval can reach `[parity] replay done live`.
 */
export const ParityTextSweepContext = createContext(false);

export function TextShimmer({
  children,
  duration,
  numberOfLines,
  style,
}: {
  children: string;
  /** Sweep length in seconds. Linear and infinite while motion is allowed. */
  duration: number;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
}) {
  const paritySweep = useContext(ParityTextSweepContext);
  const reduced = useReducedMotion();
  if (reduced || paritySweep) {
    return (
      <TextHighlight
        duration={duration}
        moving={paritySweep && !reduced}
        numberOfLines={numberOfLines}
        style={style}
      >
        {children}
      </TextHighlight>
    );
  }
  return (
    <MaskedShimmer duration={duration} numberOfLines={numberOfLines} style={style}>
      {children}
    </MaskedShimmer>
  );
}

function TextHighlight({
  children,
  duration,
  moving,
  numberOfLines,
  style,
}: {
  children: string;
  duration: number;
  moving: boolean;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
}) {
  const theme = useMobileTheme();
  const [cursor, setCursor] = useState(0);
  const base = theme.isDark ? SHIMMER_BASE_DARK : SHIMMER_BASE_LIGHT;
  const highlight = theme.isDark ? SHIMMER_HIGHLIGHT_DARK : SHIMMER_HIGHLIGHT_LIGHT;
  const textStyle = [style, { color: base }];
  const length = children.length;

  useEffect(() => {
    if (!moving || length === 0) return;
    const step = Math.max((Math.max(duration, 0.05) * 1000) / (length + 2), 48);
    const timer = setInterval(() => {
      setCursor((current) => (current + 1) % (length + 2));
    }, step);
    return () => clearInterval(timer);
  }, [duration, length, moving]);

  if (!moving || length === 0) {
    return (
      <Text numberOfLines={numberOfLines} style={textStyle}>
        {children}
      </Text>
    );
  }

  const lead = Math.max(0, cursor - 2);
  const head = children.slice(0, lead);
  const band = children.slice(lead, cursor + 1);
  const tail = children.slice(cursor + 1);
  return (
    <Text accessibilityLabel={children} numberOfLines={numberOfLines} style={textStyle}>
      {head}
      {band ? <Text style={{ color: highlight }}>{band}</Text> : null}
      {tail}
    </Text>
  );
}

function MaskedShimmer({
  children,
  duration,
  numberOfLines,
  style,
}: {
  children: string;
  duration: number;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
}) {
  const theme = useMobileTheme();
  const progress = useSharedValue(0);
  const widthSv = useSharedValue(0);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const base = theme.isDark ? SHIMMER_BASE_DARK : SHIMMER_BASE_LIGHT;
  const highlight = theme.isDark ? SHIMMER_HIGHLIGHT_DARK : SHIMMER_HIGHLIGHT_LIGHT;
  const colors = [base, base, highlight, base, base] as const;
  const textStyle = [style, { color: base }];

  useEffect(() => {
    progress.set(0);
    progress.set(
      withRepeat(
        withTiming(1, {
          duration: Math.max(duration, 0.05) * 1000,
          easing: Easing.linear,
        }),
        -1,
        false,
      ),
    );
  }, [duration, progress]);

  const shift = useAnimatedStyle(() => ({
    transform: [{ translateX: -2 * widthSv.get() * progress.get() }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width <= 0 || width === widthSv.get()) return;
    widthSv.set(width);
    setLayoutWidth(width);
  };

  return (
    <MaskedView
      accessibilityLabel={children}
      maskElement={
        <Text numberOfLines={numberOfLines} style={[textStyle, { color: "#000" }]}>
          {children}
        </Text>
      }
      style={{ alignSelf: "flex-start", flexShrink: 1, maxWidth: "100%" }}
    >
      <View onLayout={onLayout}>
        <Text numberOfLines={numberOfLines} style={textStyle}>
          {children}
        </Text>
        {layoutWidth > 0 ? (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shift]}>
            <LinearGradient
              colors={colors}
              end={{ x: 1, y: 0.5 }}
              locations={SWEEP}
              start={{ x: 0, y: 0.5 }}
              style={{ height: "100%", width: layoutWidth * 3 }}
            />
          </Animated.View>
        ) : null}
      </View>
    </MaskedView>
  );
}
