import type { ReactNode } from "react";
import { Host } from "@expo/ui";
import { Button, HStack, Image, Label, Menu, Picker as SwiftPicker, Spacer, Text as SwiftText } from "@expo/ui/swift-ui";
import { fixedSize, font, frame, imageScale, labelsHidden, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { Text, View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";

export type MenuPickerOption = {
  value: string;
  label: string;
  /** SF Symbol shown at the leading edge of the menu row. */
  systemImage?: SFSymbol;
};

export function MenuPicker({
  onValueChange,
  options,
  selectedValue,
}: {
  onValueChange: (value: string) => void;
  options: MenuPickerOption[];
  selectedValue: string;
}) {
  const theme = useMobileTheme();
  const value = options.some((option) => option.value === selectedValue)
    ? selectedValue
    : (options[0]?.value ?? "");
  if (options.length === 0 || !value) return null;
  const hasIcons = options.some((option) => option.systemImage);

  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <Host
      colorScheme={theme.colorScheme}
      ignoreSafeArea="all"
      matchContents
      seedColor={theme.colors.label}
    >
      {hasIcons && selected ? (
        <Menu
          label={selected.label}
          modifiers={[font({ size: 16 }), imageScale("small")]}
          systemImage={selected.systemImage}
        >
          {options.map((option) => (
            <Button key={option.value} onPress={() => onValueChange(option.value)}>
              <HStack modifiers={[frame({ maxWidth: 10000 })]} spacing={10}>
                <Label systemImage={option.systemImage} title={option.label} />
                <Spacer />
                {option.value === value ? <Image size={14} systemName="checkmark" /> : null}
              </HStack>
            </Button>
          ))}
        </Menu>
      ) : (
        <SwiftPicker
          label=" "
          modifiers={[
            pickerStyle("menu"),
            labelsHidden(),
            fixedSize({ horizontal: true, vertical: true }),
            font({ size: 17 }),
          ]}
          onSelectionChange={(selection) => {
            if (typeof selection === "string") onValueChange(selection);
          }}
          selection={value}
        >
          {options.map((option) => (
            <SwiftText key={option.value} modifiers={[tag(option.value)]}>
              {option.label}
            </SwiftText>
          ))}
        </SwiftPicker>
      )}
    </Host>
  );
}

/** Same row as the workspace filter “Group by” control. */
export function MenuPickerRow({
  icon,
  label,
  onValueChange,
  options,
  selectedValue,
}: {
  icon?: ReactNode;
  label: string;
  onValueChange: (value: string) => void;
  options: MenuPickerOption[];
  selectedValue: string;
}) {
  const theme = useMobileTheme();
  return (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: 12,
        minHeight: 52,
        paddingVertical: 8,
      }}
    >
      {icon}
      <Text numberOfLines={1} style={[typography.rowTitle, { color: theme.colors.label, flex: 1 }]}>
        {label}
      </Text>
      <View style={{ alignItems: "center", alignSelf: "center", justifyContent: "center" }}>
        <MenuPicker onValueChange={onValueChange} options={options} selectedValue={selectedValue} />
      </View>
    </View>
  );
}
