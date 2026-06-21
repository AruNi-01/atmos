import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radii } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassPanel } from "./glass-panel";
import type { NativeSegmentedControlProps } from "./native-segmented-control.types";

export function NativeSegmentedControl<T extends string>({
  onValueChange,
  options,
  selectedValue,
  style,
}: NativeSegmentedControlProps<T>) {
  const theme = useMobileTheme();
  const rootBackground = theme.colors.control;
  const selectedBackground = theme.colors.controlElevated;

  return (
    <GlassPanel
      fallbackStyle={{ backgroundColor: rootBackground }}
      glassEffectStyle="clear"
      interactive
      shadow={false}
      style={[
        styles.root,
        {
          backgroundColor: rootBackground,
          borderColor: theme.colors.controlBorder,
        },
        style,
      ]}
      tintColor={theme.colors.controlGlassTint}
    >
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
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: selected ? theme.colors.label : theme.colors.secondaryLabel,
                },
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </GlassPanel>
  );
}

export const nativeSegmentedControlHeight = 44;

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
    flex: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 10,
  },
  root: {
    borderColor: colors.separator,
    borderCurve: "continuous",
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 3,
    minHeight: 44,
    padding: 4,
    width: "100%",
  },
});
