import { Pressable, Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { ListFilterIcon } from "@/ui/icons/lucide-native";
import { filterBadgeValue, type FilterBadgeColors } from "@/ui/navigation/filter-badge";

export function filterBadgeColors(colors: {
  labelInverse: string;
  primary: string;
}): FilterBadgeColors {
  return { backgroundColor: colors.primary, color: colors.labelInverse };
}

/** Android nav-bar filter. iOS uses the native bar-button badge instead. */
export function FilterHeaderButton({
  count,
  onPress,
  tintColor,
}: {
  count: number;
  onPress: () => void;
  tintColor: string;
}) {
  const theme = useMobileTheme();
  const value = filterBadgeValue(count);
  const badge = filterBadgeColors(theme.colors);

  return (
    <Pressable
      accessibilityLabel={value == null ? "Filter" : `Filter, ${value} selected`}
      accessibilityRole="button"
      hitSlop={12}
      onPress={onPress}
    >
      <ListFilterIcon color={tintColor} size={22} strokeWidth={2.2} />
      {value == null ? null : (
        <View
          style={{
            alignItems: "center",
            backgroundColor: badge.backgroundColor,
            borderRadius: 8,
            height: 16,
            justifyContent: "center",
            minWidth: 16,
            paddingHorizontal: 3,
            position: "absolute",
            right: -7,
            top: -5,
          }}
        >
          <Text
            style={{
              color: badge.color,
              fontSize: 10,
              fontWeight: "600",
              lineHeight: 12,
            }}
          >
            {value}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
