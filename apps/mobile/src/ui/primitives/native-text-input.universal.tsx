import { useCallback, useEffect } from "react";
import { StyleSheet } from "react-native";
import { Host, TextInput as ExpoTextInput, useNativeState } from "@expo/ui";
import type { TextInputProps as ExpoTextInputProps } from "@expo/ui";
import { colors, radii } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassPanel } from "./glass-panel";
import type { NativeTextInputProps } from "./native-text-input.types";

export function NativeTextInput({
  minHeight = 44,
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
    <GlassPanel
      fallbackStyle={[styles.inputFallback, { backgroundColor: theme.colors.glassFallback }]}
      glassEffectStyle="clear"
      style={[styles.inputFrame, { borderColor: theme.colors.separatorStrong, minHeight }]}
      tintColor={theme.colors.glassTint}
    >
      <Host colorScheme={theme.colorScheme} style={{ minHeight, width: "100%" }}>
        <ExpoTextInput
          {...(props as ExpoTextInputProps)}
          cursorColor={theme.colors.label}
          onChangeText={handleChangeText}
          placeholderTextColor={resolvedPlaceholderColor}
          selectionColor={theme.colors.selection}
          style={inputStyle}
          textStyle={inputTextStyle}
          value={nativeValue}
        />
      </Host>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  inputFallback: {
    backgroundColor: colors.glassFallback,
  },
  inputFrame: {
    borderColor: colors.separatorStrong,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  textInput: {
    backgroundColor: "transparent",
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: "100%",
  },
  textInputText: {
    color: colors.label,
    fontSize: 16,
  },
});
