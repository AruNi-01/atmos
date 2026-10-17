import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, type TextStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { NumberFlow } from "number-flow-react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronDownIcon } from "@/ui/icons/lucide-native";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { copy } from "./copy";
import { useReducedMotion } from "./motion/use-reduced-motion";
import { SCROLL_UNIT_SPRING, scrollUnitStack } from "./scroll-pill-unit";
import { scrollBelowUnit, scrollPillAccessibilityLabel } from "./stick";

const labelMetrics = {
  fontSize: 14,
  lineHeight: 20,
} as const;

function ScrollUnit({ unit, style }: { unit: string; style: TextStyle }) {
  const reduced = useReducedMotion();
  const [stack, setStack] = useState({ current: unit, previous: unit });
  if (stack.current !== unit) {
    setStack({ current: unit, previous: stack.current });
  }
  const { current, outgoing } = scrollUnitStack(stack.current, stack.previous);
  const currentOpacity = useSharedValue(1);
  const outgoingOpacity = useSharedValue(0);

  useEffect(() => {
    if (reduced || outgoing == null) {
      currentOpacity.set(1);
      outgoingOpacity.set(0);
      return;
    }
    currentOpacity.set(0);
    outgoingOpacity.set(1);
    currentOpacity.set(withSpring(1, SCROLL_UNIT_SPRING));
    outgoingOpacity.set(withSpring(0, SCROLL_UNIT_SPRING));
  }, [current, currentOpacity, outgoing, outgoingOpacity, reduced]);

  const currentStyle = useAnimatedStyle(() => ({ opacity: currentOpacity.get() }));
  const outgoingStyle = useAnimatedStyle(() => ({ opacity: outgoingOpacity.get() }));

  return (
    <View style={styles.unit}>
      <Text accessible={false} style={[style, styles.sizer]}>
        {current}
      </Text>
      <Animated.Text style={[style, styles.overlay, currentStyle]}>{current}</Animated.Text>
      {outgoing != null ? (
        <Animated.Text style={[style, styles.overlay, outgoingStyle]}>{outgoing}</Animated.Text>
      ) : null}
    </View>
  );
}

export function ScrollToBottomPill({ count, onPress }: { count: number; onPress: () => void }) {
  const theme = useMobileTheme();
  const label = {
    color: theme.colors.label,
    fontSize: labelMetrics.fontSize,
    lineHeight: labelMetrics.lineHeight,
  };
  const showCopy = count > 0;

  return (
    <Pressable
      accessibilityLabel={scrollPillAccessibilityLabel(count)}
      accessibilityRole="button"
      onPress={onPress}
    >
      <GlassPanel interactive style={styles.pill}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.row}
        >
          <ChevronDownIcon color={theme.colors.label} size={14} strokeWidth={2} />
          {showCopy ? (
            <View style={styles.copy}>
              {copy.scrollBelowPrefix.length > 0 ? (
                <Text style={label}>{copy.scrollBelowPrefix}</Text>
              ) : null}
              <NumberFlow respectMotionPreference style={label} value={count} />
              <ScrollUnit style={label} unit={scrollBelowUnit(count)} />
              {copy.scrollBelowSuffix.length > 0 ? (
                <Text style={label}>{copy.scrollBelowSuffix}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </GlassPanel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  copy: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  pill: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  overlay: {
    left: 0,
    position: "absolute",
    top: 0,
  },
  sizer: {
    opacity: 0,
  },
  unit: {
    overflow: "hidden",
  },
});
