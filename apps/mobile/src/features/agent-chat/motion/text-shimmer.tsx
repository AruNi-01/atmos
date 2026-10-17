import { useEffect, useState } from "react";
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
  const reduced = useReducedMotion();
  const theme = useMobileTheme();
  const progress = useSharedValue(0);
  const widthSv = useSharedValue(0);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const base = theme.isDark ? SHIMMER_BASE_DARK : SHIMMER_BASE_LIGHT;
  const highlight = theme.isDark ? SHIMMER_HIGHLIGHT_DARK : SHIMMER_HIGHLIGHT_LIGHT;
  const colors = [base, base, highlight, base, base] as const;
  const textStyle = [style, { color: base }];

  useEffect(() => {
    if (reduced) return;
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
  }, [duration, progress, reduced]);

  const shift = useAnimatedStyle(() => ({
    transform: [{ translateX: -2 * widthSv.get() * progress.get() }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width <= 0 || width === widthSv.get()) return;
    widthSv.set(width);
    setLayoutWidth(width);
  };

  if (reduced) {
    return (
      <Text numberOfLines={numberOfLines} style={textStyle}>
        {children}
      </Text>
    );
  }

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
