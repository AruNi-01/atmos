import type { ReactNode } from "react";
import { Platform } from "react-native";
import {
  Host,
  List,
  ListItem,
  Picker,
  Switch,
} from "@expo/ui";
import { useMobileTheme } from "@/theme/theme-store";

export { ExpoUiButton } from "./expo-ui-button";
export type { ExpoUiButtonProps } from "./expo-ui-button";
export { NativeButton } from "./native-button";
export { NativeIcon, selectNativeIcon } from "./native-icon";
export type { NativeIconName } from "./native-icon";
export { NativeMenuButton } from "./native-menu-button";
export type { NativeMenuAction } from "./native-menu-button.types";
export { NativeSegmentedControl } from "./native-segmented-control";
export { NativeTextInput } from "./native-text-input";

export function NativeList({
  children,
  onRefresh,
}: {
  children: ReactNode;
  onRefresh?: () => Promise<void>;
}) {
  const theme = useMobileTheme();
  const neutralHostProps = Platform.OS === "android" ? { seedColor: theme.colors.label } : {};

  return (
    <Host colorScheme={theme.colorScheme} matchContents {...neutralHostProps}>
      <List onRefresh={onRefresh}>{children}</List>
    </Host>
  );
}

export function NativeListItem({
  leading,
  title,
  supportingText,
  trailing,
  onPress,
  testID,
}: {
  leading?: ReactNode;
  title: string;
  supportingText?: string | ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <ListItem
      leading={leading}
      onPress={onPress}
      supportingText={supportingText}
      trailing={trailing}
      testID={testID}
    >
      {title}
    </ListItem>
  );
}

export function NativePicker<T extends string | number>({
  selectedValue,
  onValueChange,
  options,
  enabled = true,
}: {
  selectedValue: T;
  onValueChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  enabled?: boolean;
}) {
  const theme = useMobileTheme();
  const neutralHostProps = Platform.OS === "android" ? { seedColor: theme.colors.label } : {};

  return (
    <Host colorScheme={theme.colorScheme} matchContents {...neutralHostProps}>
      <Picker selectedValue={selectedValue} onValueChange={onValueChange} enabled={enabled}>
        {options.map((option) => (
          <Picker.Item key={String(option.value)} label={option.label} value={option.value} />
        ))}
      </Picker>
    </Host>
  );
}

export function NativeSwitch({
  disabled,
  label,
  onValueChange,
  value,
}: {
  disabled?: boolean;
  label?: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  const theme = useMobileTheme();
  const neutralHostProps = Platform.OS === "android" ? { seedColor: theme.colors.label } : {};

  return (
    <Host colorScheme={theme.colorScheme} matchContents {...neutralHostProps}>
      <Switch disabled={disabled} label={label} onValueChange={onValueChange} value={value} />
    </Host>
  );
}
