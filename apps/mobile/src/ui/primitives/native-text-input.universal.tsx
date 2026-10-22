import { useCallback, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Host, TextInput as ExpoTextInput, useNativeState } from "@expo/ui";
import type { TextInputProps as ExpoTextInputProps } from "@expo/ui";
import { accessibilityLabel as accessibilityLabelModifier } from "@expo/ui/swift-ui/modifiers";
import { colors, radii } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import type { NativeTextInputProps } from "./native-text-input.types";

export function NativeTextInput({
  accessibilityLabel,
  framed = true,
  minHeight = 56,
  modifiers,
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
  const inputStyle = StyleSheet.flatten([
    styles.textInput,
    { height: minHeight },
    style,
  ]) as ExpoTextInputProps["style"];
  const inputTextStyle = StyleSheet.flatten([
    styles.textInputText,
    { color: theme.colors.label },
    textStyle,
  ]) as ExpoTextInputProps["textStyle"];
  const resolvedPlaceholderColor = placeholderTextColor ?? theme.colors.secondaryLabel;
  const controlBackground = theme.colors.control;
  const inputModifiers = accessibilityLabel
    ? [accessibilityLabelModifier(accessibilityLabel), ...(modifiers ?? [])]
    : modifiers;

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
      style={
        framed
          ? [
              styles.inputFrame,
              {
                backgroundColor: controlBackground,
                borderColor: theme.colors.controlBorder,
                minHeight,
              },
            ]
          : { minHeight, width: "100%" }
      }
    >
      <Host colorScheme={theme.colorScheme} style={{ minHeight, width: "100%" }}>
        <ExpoTextInput
          {...(props as ExpoTextInputProps)}
          cursorColor={theme.colors.accent}
          modifiers={inputModifiers}
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
