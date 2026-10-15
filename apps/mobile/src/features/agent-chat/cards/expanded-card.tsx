import type { ReactNode } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut } from "react-native-reanimated";
import { useMobileTheme } from "@/theme/theme-store";
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
      style={{
        backgroundColor: theme.colors.cardElevated,
        borderColor: theme.colors.glassBorder,
        borderCurve: "continuous",
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        marginHorizontal: 18,
        maxHeight,
        overflow: "hidden",
      }}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        style={{ flexGrow: 0, maxHeight }}
      >
        <View style={styles.body}>{children}</View>
      </ScrollView>
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
