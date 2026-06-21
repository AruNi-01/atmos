import { useCallback, useEffect } from "react";
import type { KeyboardTypeOptions, ReturnKeyTypeOptions } from "react-native";
import { Host, OutlinedTextField, Shape, Text, useNativeState } from "@expo/ui/jetpack-compose";
import { fillMaxWidth, height } from "@expo/ui/jetpack-compose/modifiers";
import { radii, type MobileThemeColors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";
import type { NativeTextInputProps } from "./native-text-input.types";

function mapKeyboardType(value: KeyboardTypeOptions | undefined) {
  switch (value) {
    case "email-address":
      return "email";
    case "numeric":
    case "decimal-pad":
      return "decimal";
    case "number-pad":
      return "number";
    case "phone-pad":
      return "phone";
    case "url":
      return "uri";
    case "visible-password":
      return "password";
    default:
      return "text";
  }
}

function mapReturnKeyType(value: ReturnKeyTypeOptions | undefined) {
  switch (value) {
    case "done":
    case "go":
    case "next":
    case "previous":
    case "search":
    case "send":
      return value;
    default:
      return "default";
  }
}

function mapCapitalization(value: NativeTextInputProps["autoCapitalize"]) {
  switch (value) {
    case "none":
    case "characters":
    case "words":
    case "sentences":
      return value;
    default:
      return undefined;
  }
}

export function NativeTextInput({
  autoCapitalize,
  autoCorrect,
  defaultValue,
  editable,
  keyboardType,
  maxLength,
  minHeight = 56,
  multiline,
  numberOfLines,
  onBlur,
  onChangeText,
  onFocus,
  onSubmitEditing,
  placeholder,
  placeholderTextColor,
  returnKeyType,
  secureTextEntry,
  value,
}: NativeTextInputProps) {
  const theme = useMobileTheme();
  const nativeValue = useNativeState(value ?? defaultValue ?? "");
  const resolvedPlaceholderColor = placeholderTextColor ?? theme.colors.secondaryLabel;
  const textFieldColors = getTextFieldColors(theme.colors);

  useEffect(() => {
    if (value !== undefined && nativeValue.value !== value) {
      nativeValue.value = value;
    }
  }, [nativeValue, value]);

  const handleValueChange = useCallback(
    (nextValue: string) => {
      nativeValue.value = nextValue;
      onChangeText?.(nextValue);
    },
    [nativeValue, onChangeText],
  );

  const handleFocusChanged = useCallback(
    (focused: boolean) => {
      if (focused) {
        onFocus?.();
      } else {
        onBlur?.();
      }
    },
    [onBlur, onFocus],
  );

  const handleSubmit = useCallback(
    (submittedValue: string) => {
      onSubmitEditing?.({ nativeEvent: { text: submittedValue } } as never);
    },
    [onSubmitEditing],
  );

  return (
    <Host colorScheme={theme.colorScheme} matchContents={{ vertical: true }} seedColor={theme.colors.label} style={{ width: "100%" }}>
      <OutlinedTextField
        colors={textFieldColors}
        enabled={editable !== false}
        keyboardActions={{
          onDone: handleSubmit,
          onGo: handleSubmit,
          onNext: handleSubmit,
          onPrevious: handleSubmit,
          onSearch: handleSubmit,
          onSend: handleSubmit,
        }}
        keyboardOptions={{
          autoCorrectEnabled: autoCorrect,
          capitalization: mapCapitalization(autoCapitalize),
          imeAction: mapReturnKeyType(returnKeyType),
          keyboardType: secureTextEntry ? "password" : mapKeyboardType(keyboardType),
        }}
        maxLength={maxLength}
        maxLines={multiline ? numberOfLines : undefined}
        minLines={multiline ? numberOfLines : undefined}
        modifiers={[fillMaxWidth(), height(minHeight)]}
        onFocusChanged={handleFocusChanged}
        onValueChange={handleValueChange}
        shape={Shape.RoundedCorner({ cornerRadii: controlCornerRadii })}
        singleLine={!multiline}
        textSelectionColors={{
          backgroundColor: theme.colors.selection,
          handleColor: theme.colors.accent,
        }}
        textStyle={{
          color: theme.colors.label,
          fontSize: 16,
        }}
        value={nativeValue}
        visualTransformation={secureTextEntry ? "password" : "none"}
      >
        {placeholder ? (
          <OutlinedTextField.Placeholder>
            <Text color={String(resolvedPlaceholderColor)}>{placeholder}</Text>
          </OutlinedTextField.Placeholder>
        ) : null}
      </OutlinedTextField>
    </Host>
  );
}

const controlCornerRadii = {
  bottomEnd: radii.control,
  bottomStart: radii.control,
  topEnd: radii.control,
  topStart: radii.control,
};

function getTextFieldColors(themeColors: MobileThemeColors) {
  return {
    cursorColor: themeColors.accent,
    disabledContainerColor: themeColors.controlDisabled,
    disabledIndicatorColor: themeColors.separator,
    disabledLabelColor: themeColors.tertiaryLabel,
    disabledPlaceholderColor: themeColors.tertiaryLabel,
    disabledTextColor: themeColors.tertiaryLabel,
    focusedContainerColor: themeColors.control,
    focusedIndicatorColor: themeColors.controlBorder,
    focusedLabelColor: themeColors.label,
    focusedPlaceholderColor: themeColors.secondaryLabel,
    focusedTextColor: themeColors.label,
    unfocusedContainerColor: themeColors.control,
    unfocusedIndicatorColor: themeColors.controlBorder,
    unfocusedLabelColor: themeColors.secondaryLabel,
    unfocusedPlaceholderColor: themeColors.secondaryLabel,
    unfocusedTextColor: themeColors.label,
  };
}
