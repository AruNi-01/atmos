import { Host, Picker, Text } from "@expo/ui/swift-ui";
import { controlSize, frame, pickerStyle, tag, tint } from "@expo/ui/swift-ui/modifiers";
import { colors } from "@/theme/colors";
import type { NativeSegmentedControlProps } from "./native-segmented-control.types";

export function NativeSegmentedControl<T extends string>({
  onValueChange,
  options,
  selectedValue,
  style,
}: NativeSegmentedControlProps<T>) {
  return (
    <Host colorScheme="light" matchContents={{ vertical: true }} style={[{ width: "100%" }, style]}>
      <Picker
        modifiers={[pickerStyle("segmented"), controlSize("large"), frame({ height: 44 }), tint(colors.label)]}
        onSelectionChange={(value) => {
          if (value !== null) onValueChange(value as T);
        }}
        selection={selectedValue}
      >
        {options.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}

export const nativeSegmentedControlHeight = 44;
