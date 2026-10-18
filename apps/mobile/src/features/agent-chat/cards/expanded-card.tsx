import type { ReactNode } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut } from "react-native-reanimated";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { useReducedMotion } from "../motion/use-reduced-motion";

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

export function ExpandedCard({
  children,
  onHeight,
}: {
  children: ReactNode;
  onHeight: (height: number) => void;
}) {
  const theme = useMobileTheme();
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  const maxHeight = Math.round(height * 0.4);
  const duration = reduced ? 0 : 180;
  const motion = { duration, easing: EASE_OUT };

  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration).easing(motion.easing)}
      exiting={FadeOut.duration(motion.duration).easing(motion.easing)}
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
      style={{ marginHorizontal: 18, maxHeight }}
    >
      <GlassPanel
        fallbackStyle={{ backgroundColor: theme.colors.glassFallbackStrong }}
        shadow={false}
        style={{ borderRadius: radii.card, maxHeight }}
        tintColor={theme.colors.glassTint}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          style={{ flexGrow: 0, maxHeight }}
        >
          <View style={styles.body}>{children}</View>
        </ScrollView>
      </GlassPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 10,
  },
  content: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
