import { useCallback, useEffect } from "react";
import { StyleSheet } from "react-native";
import { Host, TextInput as ExpoTextInput, useNativeState } from "@expo/ui";
import type { TextInputProps as ExpoTextInputProps } from "@expo/ui";
import { colors, radii } from "@/theme/colors";
import { GlassPanel } from "./glass-panel";
import type { NativeTextInputProps } from "./native-text-input.types";

export function NativeTextInput({
  minHeight = 44,
  onChangeText,
  placeholderTextColor = colors.secondaryLabel,
  style,
  textStyle,
  value,
  defaultValue,
  ...props
}: NativeTextInputProps) {
  const nativeValue = useNativeState(value ?? defaultValue ?? "");
  const inputStyle = StyleSheet.flatten([styles.textInput, { height: minHeight }, style]) as ExpoTextInputProps["style"];
  const inputTextStyle = StyleSheet.flatten([styles.textInputText, textStyle]) as ExpoTextInputProps["textStyle"];

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
      fallbackStyle={styles.inputFallback}
      glassEffectStyle="clear"
      style={[styles.inputFrame, { minHeight }]}
      tintColor="rgba(255, 255, 255, 0.22)"
    >
      <Host colorScheme="light" style={{ minHeight, width: "100%" }}>
        <ExpoTextInput
          {...(props as ExpoTextInputProps)}
          cursorColor={colors.label}
          onChangeText={handleChangeText}
          placeholderTextColor={placeholderTextColor}
          selectionColor={colors.selection}
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
