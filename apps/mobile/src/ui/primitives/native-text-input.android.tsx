import { useCallback, useEffect } from "react";
import type { KeyboardTypeOptions, ReturnKeyTypeOptions } from "react-native";
import { Host, OutlinedTextField, Shape, Text, useNativeState } from "@expo/ui/jetpack-compose";
import { fillMaxWidth, height } from "@expo/ui/jetpack-compose/modifiers";
import { colors, radii } from "@/theme/colors";
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
  minHeight = 48,
  multiline,
  numberOfLines,
  onBlur,
  onChangeText,
  onFocus,
  onSubmitEditing,
  placeholder,
  placeholderTextColor = colors.secondaryLabel,
  returnKeyType,
  secureTextEntry,
  value,
}: NativeTextInputProps) {
  const nativeValue = useNativeState(value ?? defaultValue ?? "");

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
    <Host colorScheme="light" matchContents={{ vertical: true }} seedColor={colors.label} style={{ width: "100%" }}>
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
          backgroundColor: colors.selection,
          handleColor: colors.label,
        }}
        textStyle={{
          color: colors.label,
          fontSize: 16,
        }}
        value={nativeValue}
        visualTransformation={secureTextEntry ? "password" : "none"}
      >
        {placeholder ? (
          <OutlinedTextField.Placeholder>
            <Text color={String(placeholderTextColor)}>{placeholder}</Text>
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

const textFieldColors = {
  cursorColor: colors.label,
  disabledContainerColor: colors.cardElevated,
  disabledIndicatorColor: colors.separatorStrong,
  disabledLabelColor: colors.tertiaryLabel,
  disabledPlaceholderColor: colors.tertiaryLabel,
  disabledTextColor: colors.tertiaryLabel,
  focusedContainerColor: colors.cardElevated,
  focusedIndicatorColor: colors.label,
  focusedLabelColor: colors.label,
  focusedPlaceholderColor: colors.secondaryLabel,
  focusedTextColor: colors.label,
  unfocusedContainerColor: colors.cardElevated,
  unfocusedIndicatorColor: colors.separatorStrong,
  unfocusedLabelColor: colors.secondaryLabel,
  unfocusedPlaceholderColor: colors.secondaryLabel,
  unfocusedTextColor: colors.label,
};
