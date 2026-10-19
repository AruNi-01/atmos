import { Pressable, StyleSheet, Text, View } from "react-native";
import { NumberFlow } from "number-flow-react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronDownIcon } from "@/ui/icons/lucide-native";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { COMPOSER_GLASS_CONTROL_RADIUS, COMPOSER_GLASS_CONTROL_SIZE } from "./composer-glass";
import { copy } from "./copy";
import { scrollBelowUnit, scrollPillAccessibilityLabel } from "./stick";

/** Stable XCUITest identifier. The spoken label changes with the below count. */
export const SCROLL_PILL_TEST_ID = "agent-chat-scroll-pill";

/** Web `AgentChatScrollBelowCopy` is `text-xs leading-none font-medium`. */
const labelMetrics = {
  fontSize: 12,
  fontWeight: "500" as const,
  lineHeight: 12,
};

export function ScrollToBottomPill({ count, onPress }: { count: number; onPress: () => void }) {
  const theme = useMobileTheme();
  const label = {
    color: theme.colors.label,
    fontSize: labelMetrics.fontSize,
    fontWeight: labelMetrics.fontWeight,
    lineHeight: labelMetrics.lineHeight,
  };
  const showCopy = count > 0;

  return (
    <GlassPanel interactive shadow={false} style={styles.pill} tintColor={theme.colors.glassTint}>
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
          paddingHorizontal: 14,
        })}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.row}
        >
          <ChevronDownIcon color={theme.colors.label} size={16} strokeWidth={2} />
          {showCopy ? (
            <View style={styles.copy}>
              {copy.scrollBelowPrefix.length > 0 ? (
                <Text style={label}>{copy.scrollBelowPrefix}</Text>
              ) : null}
              <NumberFlow respectMotionPreference style={label} value={count} />
              <Text style={label}>{scrollBelowUnit(count)}</Text>
              {copy.scrollBelowSuffix.length > 0 ? (
                <Text style={label}>{copy.scrollBelowSuffix}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    </GlassPanel>
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
    borderRadius: COMPOSER_GLASS_CONTROL_RADIUS,
    height: COMPOSER_GLASS_CONTROL_SIZE,
    justifyContent: "center",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
});
