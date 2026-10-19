import type { ReactNode } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut } from "react-native-reanimated";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { useReducedMotion } from "../motion/use-reduced-motion";

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

export function ExpandedCard({
  bare = false,
  children,
  onHeight,
}: {
  /** The child draws its own frame. Used by the subagent task panel. */
  bare?: boolean;
  children: ReactNode;
  onHeight: (height: number) => void;
}) {
  const theme = useMobileTheme();
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  const maxHeight = Math.round(height * 0.4);
  const duration = reduced ? 0 : 180;
  const motion = { duration, easing: EASE_OUT };
  const body = (
    <ScrollView
      contentContainerStyle={bare ? styles.bareContent : styles.content}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      style={{ flexGrow: 0, maxHeight }}
    >
      <View style={bare ? undefined : styles.body}>{children}</View>
    </ScrollView>
  );

  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration).easing(motion.easing)}
      exiting={FadeOut.duration(motion.duration).easing(motion.easing)}
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
      style={{ marginHorizontal: bare ? 0 : 18, maxHeight }}
    >
      {bare ? (
        body
      ) : (
        <GlassPanel
          fallbackStyle={{ backgroundColor: theme.colors.glassFallbackStrong }}
          shadow={false}
          style={{ borderRadius: radii.card, maxHeight }}
          tintColor={theme.colors.glassTint}
        >
          {body}
        </GlassPanel>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bareContent: {
    padding: 0,
  },
  body: {
    gap: 10,
  },
  content: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
