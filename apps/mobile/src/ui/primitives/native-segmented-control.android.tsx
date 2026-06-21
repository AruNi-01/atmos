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
  const segmentedColors = {
    activeBorderColor: colors.label,
    activeContainerColor: colors.label,
    activeContentColor: colors.labelInverse,
    inactiveBorderColor: colors.separatorStrong,
    inactiveContainerColor: colors.glassFallback,
    inactiveContentColor: colors.label,
  };

  return (
    <Host colorScheme={theme.colorScheme} matchContents={{ vertical: true }} seedColor={colors.label} style={[{ width: "100%" }, style]}>
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

export const nativeSegmentedControlHeight = 40;
