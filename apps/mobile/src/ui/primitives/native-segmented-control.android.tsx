import { Host, SegmentedButton, SingleChoiceSegmentedButtonRow, Text } from "@expo/ui/jetpack-compose";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { useMobileTheme } from "@/theme/theme-store";
import type { NativeSegmentedControlProps } from "./native-segmented-control.types";

export function NativeSegmentedControl<T extends string>({
  onValueChange,
  options,
  selectedValue,
  style,
}: NativeSegmentedControlProps<T>) {
  const theme = useMobileTheme();
  const colors = theme.colors;
  const trackColor = theme.isDark ? "#1c1c1e" : "rgba(10, 10, 11, 0.055)";
  const segmentedColors = {
    activeBorderColor: theme.isDark ? "rgba(255, 255, 255, 0.075)" : "rgba(10, 10, 11, 0.07)",
    activeContainerColor: colors.controlElevated,
    activeContentColor: colors.label,
    inactiveBorderColor: colors.controlBorder,
    inactiveContainerColor: trackColor,
    inactiveContentColor: colors.secondaryLabel,
  };

  return (
    <Host
      colorScheme={theme.colorScheme}
      matchContents={{ vertical: true }}
      seedColor={colors.label}
      style={[{ minHeight: nativeSegmentedControlHeight, width: "100%" }, style]}
    >
      <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
        {options.map((option) => {
          const selected = option.value === selectedValue;
          return (
            <SegmentedButton
              colors={segmentedColors}
              key={option.value}
              modifiers={[fillMaxWidth()]}
              onClick={() => onValueChange(option.value)}
              selected={selected}
            >
              <SegmentedButton.Label>
                <Text
                  color={selected ? colors.labelInverse : colors.label}
                  style={{ typography: "labelLarge" }}
                >
                  {option.label}
                </Text>
              </SegmentedButton.Label>
            </SegmentedButton>
          );
        })}
      </SingleChoiceSegmentedButtonRow>
    </Host>
  );
}

export const nativeSegmentedControlHeight = 48;
