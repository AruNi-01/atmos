import { StyleSheet, View } from "react-native";
import { colors, radii } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import { NativeButton } from "./native-button";
import type { NativeSegmentedControlProps } from "./native-segmented-control.types";

export function NativeSegmentedControl<T extends string>({
  onValueChange,
  options,
  selectedValue,
}: NativeSegmentedControlProps<T>) {
  const theme = useMobileTheme();

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.glassFallback, borderColor: theme.colors.separator }]}>
      {options.map((option) => {
        const selected = option.value === selectedValue;
        return (
          <View key={option.value} style={styles.option}>
            <NativeButton
              label={option.label}
              onPress={() => onValueChange(option.value)}
              variant={selected ? "filled" : "text"}
            />
          </View>
        );
      })}
    </View>
  );
}

export const nativeSegmentedControlHeight = 36;

const styles = StyleSheet.create({
  option: {
    flex: 1,
  },
  root: {
    backgroundColor: colors.glassFallback,
    borderColor: colors.separator,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 2,
    padding: 2,
  },
});
