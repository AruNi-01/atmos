import type { TextInputProps as ExpoTextInputProps } from "@expo/ui";

export type NativeTextInputProps = Omit<ExpoTextInputProps, "defaultValue" | "style" | "textStyle" | "value"> & {
  defaultValue?: string;
  minHeight?: number;
  style?: ExpoTextInputProps["style"];
  textStyle?: ExpoTextInputProps["textStyle"];
  value?: string;
};
