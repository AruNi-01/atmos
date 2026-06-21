import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import type { NativeSegmentedControlProps } from "./native-segmented-control.types";

export function NativeSegmentedControl<T extends string>({
  onValueChange,
  options,
  selectedValue,
  style,
}: NativeSegmentedControlProps<T>) {
  const theme = useMobileTheme();
  const rootBackground = theme.isDark ? "#1c1c1e" : "rgba(10, 10, 11, 0.055)";
  const selectedBackground = theme.colors.controlElevated;
  const selectedBorder = theme.isDark ? "rgba(255, 255, 255, 0.075)" : "rgba(10, 10, 11, 0.07)";

  return (
    <View style={[styles.root, { backgroundColor: rootBackground, borderColor: theme.colors.controlBorder }, style]}>
      {options.map((option) => {
        const selected = option.value === selectedValue;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onValueChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: selected ? selectedBackground : "transparent",
                borderColor: selected ? selectedBorder : "transparent",
                opacity: pressed ? 0.72 : 1,
              },
              selected ? (theme.isDark ? styles.selectedOptionDark : styles.selectedOptionLight) : null,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: selected ? theme.colors.label : theme.colors.secondaryLabel },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const nativeSegmentedControlHeight = 48;

const styles = StyleSheet.create({
  label: {
    color: colors.label,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
  },
  option: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: radii.control - 4,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 10,
  },
  root: {
    backgroundColor: colors.cardSubtle,
    borderColor: colors.separator,
    borderCurve: "continuous",
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 3,
    minHeight: nativeSegmentedControlHeight,
    padding: 4,
    width: "100%",
  },
  selectedOptionDark: {
    boxShadow: "0 1px 0 rgba(255, 255, 255, 0.04)",
  },
  selectedOptionLight: {
    boxShadow: "0 5px 14px rgba(10, 10, 11, 0.08)",
  },
});
