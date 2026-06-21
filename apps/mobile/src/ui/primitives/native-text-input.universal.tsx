import { useCallback, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Host, TextInput as ExpoTextInput, useNativeState } from "@expo/ui";
import type { TextInputProps as ExpoTextInputProps } from "@expo/ui";
import { colors, radii } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import type { NativeTextInputProps } from "./native-text-input.types";

export function NativeTextInput({
  minHeight = 56,
  onChangeText,
  placeholderTextColor,
  style,
  textStyle,
  value,
  defaultValue,
  ...props
}: NativeTextInputProps) {
  const theme = useMobileTheme();
  const nativeValue = useNativeState(value ?? defaultValue ?? "");
  const inputStyle = StyleSheet.flatten([styles.textInput, { height: minHeight }, style]) as ExpoTextInputProps["style"];
  const inputTextStyle = StyleSheet.flatten([
    styles.textInputText,
    { color: theme.colors.label },
    textStyle,
  ]) as ExpoTextInputProps["textStyle"];
  const resolvedPlaceholderColor = placeholderTextColor ?? theme.colors.secondaryLabel;
  const controlBackground = theme.colors.control;

  useEffect(() => {
    if (value !== undefined && nativeValue.value !== value) {
      nativeValue.value = value;
    }
  }, [nativeValue, value]);

  const handleChangeText = useCallback(
    (nextValue: string) => {
      nativeValue.value = nextValue;
      onChangeText?.(nextValue);
    },
    [nativeValue, onChangeText],
  );

  return (
    <View
      style={[
        styles.inputFrame,
        {
          backgroundColor: controlBackground,
          borderColor: theme.colors.controlBorder,
          minHeight,
        },
      ]}
    >
      <Host colorScheme={theme.colorScheme} style={{ minHeight, width: "100%" }}>
        <ExpoTextInput
          {...(props as ExpoTextInputProps)}
          cursorColor={theme.colors.accent}
          onChangeText={handleChangeText}
          placeholderTextColor={resolvedPlaceholderColor}
          selectionColor={theme.colors.selection}
          style={inputStyle}
          textStyle={inputTextStyle}
          value={nativeValue}
        />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  inputFrame: {
    backgroundColor: colors.control,
    borderColor: colors.separatorStrong,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  textInput: {
    backgroundColor: "transparent",
    paddingHorizontal: 16,
    paddingVertical: 10,
    width: "100%",
  },
  textInputText: {
    color: colors.label,
    fontSize: 16,
  },
});
