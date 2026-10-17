import { Pressable, StyleSheet, Text, View } from "react-native";
import { NumberFlow } from "number-flow-react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronDownIcon } from "@/ui/icons/lucide-native";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { copy } from "./copy";
import { scrollBelowUnit, scrollPillAccessibilityLabel } from "./stick";

const labelMetrics = {
  fontSize: 14,
  lineHeight: 20,
} as const;

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
              <Text style={label}>{scrollBelowUnit(count)}</Text>
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
});
