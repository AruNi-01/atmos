import type { StyleProp, ViewStyle } from "react-native";

export type NativeSegmentedControlOption<T extends string> = {
  label: string;
  value: T;
};

export type NativeSegmentedControlProps<T extends string> = {
  onValueChange: (value: T) => void;
  options: Array<NativeSegmentedControlOption<T>>;
  selectedValue: T;
  style?: StyleProp<ViewStyle>;
};
