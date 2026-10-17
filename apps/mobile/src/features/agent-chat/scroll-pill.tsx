import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, type TextStyle } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { NumberFlow } from "number-flow-react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronDownIcon } from "@/ui/icons/lucide-native";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { copy } from "./copy";
import { useReducedMotion } from "./motion/use-reduced-motion";
import { SCROLL_UNIT_SPRING, textMorphFrame, type TextMorphSlot } from "./scroll-pill-unit";
import { scrollBelowUnit, scrollPillAccessibilityLabel } from "./stick";

const labelMetrics = {
  fontSize: 14,
  lineHeight: 20,
} as const;

function MorphChar({
  progress,
  slot,
  style,
}: {
  progress: SharedValue<number>;
  slot: TextMorphSlot;
  style: TextStyle;
}) {
  const animated = useAnimatedStyle(() => {
    if (slot.phase === "stay") return { opacity: 1 };
    const value = progress.get();
    return { opacity: slot.phase === "enter" ? value : 1 - value };
  });
  return (
    <Animated.Text accessible={false} style={[style, animated]}>
      {slot.label}
    </Animated.Text>
  );
}

function ScrollUnit({ unit, style }: { unit: string; style: TextStyle }) {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState({ slots: textMorphFrame(unit, unit), unit });
  if (frame.unit !== unit) {
    setFrame({ slots: textMorphFrame(unit, frame.unit), unit });
  } else if (reduced && frame.slots.some((slot) => slot.phase !== "stay")) {
    setFrame({
      unit: frame.unit,
      slots: frame.slots
        .filter((slot) => slot.phase !== "exit")
        .map((slot) => (slot.phase === "enter" ? { ...slot, phase: "stay" } : slot)),
    });
  }
  const slots = reduced ? frame.slots.filter((slot) => slot.phase !== "exit") : frame.slots;
  const morphing = slots.some((slot) => slot.phase !== "stay");
  const progress = useSharedValue(1);
  const settle = useCallback((settledUnit: string) => {
    setFrame((current) => {
      if (current.unit !== settledUnit) return current;
      if (current.slots.every((slot) => slot.phase === "stay")) return current;
      return {
        unit: current.unit,
        slots: current.slots
          .filter((slot) => slot.phase !== "exit")
          .map((slot) => (slot.phase === "enter" ? { ...slot, phase: "stay" } : slot)),
      };
    });
  }, []);

  useEffect(() => {
    if (reduced || !morphing) {
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(
      withSpring(1, SCROLL_UNIT_SPRING, (finished) => {
        if (finished) runOnJS(settle)(unit);
      }),
    );
  }, [morphing, progress, reduced, settle, unit]);

  return (
    <View style={styles.unit}>
      {slots.map((slot) => (
        <MorphChar key={`${slot.phase}-${slot.id}`} progress={progress} slot={slot} style={style} />
      ))}
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
  unit: {
    flexDirection: "row",
    overflow: "hidden",
  },
});
