import { Pressable, StyleSheet, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronDownIcon } from "@/ui/icons/lucide-native";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import {
  COMPOSER_GLASS_CONTROL_RADIUS,
  COMPOSER_GLASS_CONTROL_SIZE,
  COMPOSER_GLASS_WELL,
} from "./composer-glass";
import { scrollPillAccessibilityLabel } from "./stick";

/** Stable XCUITest identifier. The spoken label changes with the below count. */
export const SCROLL_PILL_TEST_ID = "agent-chat-scroll-pill";

/** Square glass icon button. The count stays in the spoken label only. */
export function ScrollToBottomPill({ count, onPress }: { count: number; onPress: () => void }) {
  const theme = useMobileTheme();

  return (
    <GlassPanel {...COMPOSER_GLASS_WELL} style={styles.pill}>
      <Pressable
        accessibilityLabel={scrollPillAccessibilityLabel(count)}
        accessibilityRole="button"
        onPress={onPress}
        testID={SCROLL_PILL_TEST_ID}
        style={({ pressed }) => ({
          alignItems: "center",
          height: COMPOSER_GLASS_CONTROL_SIZE,
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
          width: COMPOSER_GLASS_CONTROL_SIZE,
        })}
      >
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ChevronDownIcon color={theme.colors.label} size={16} strokeWidth={2} />
        </View>
      </Pressable>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: "center",
    borderRadius: COMPOSER_GLASS_CONTROL_RADIUS,
    height: COMPOSER_GLASS_CONTROL_SIZE,
    justifyContent: "center",
    // A clipped glass view draws no material, so the chevron sits on nothing.
    overflow: "visible",
    width: COMPOSER_GLASS_CONTROL_SIZE,
  },
});
