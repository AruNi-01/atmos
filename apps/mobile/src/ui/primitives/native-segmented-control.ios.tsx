import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { StyleSheet } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import type { NativeSegmentedControlProps } from "./native-segmented-control.types";

export function NativeSegmentedControl<T extends string>({
  onValueChange,
  options,
  selectedValue,
  style,
}: NativeSegmentedControlProps<T>) {
  const theme = useMobileTheme();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === selectedValue),
  );

  return (
    <SegmentedControl
      appearance={theme.colorScheme}
      onChange={(event) => {
        const nextValue = options[event.nativeEvent.selectedSegmentIndex]?.value;
        if (nextValue) {
          onValueChange(nextValue);
        }
      }}
      selectedIndex={selectedIndex}
      style={[styles.nativeControl, style]}
      values={options.map((option) => option.label)}
    />
  );
}

export const nativeSegmentedControlHeight = 48;

const styles = StyleSheet.create({
  nativeControl: {
    height: nativeSegmentedControlHeight,
    width: "100%",
  },
});
