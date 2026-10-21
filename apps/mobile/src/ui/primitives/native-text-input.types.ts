import type { TextInputProps as ExpoTextInputProps } from "@expo/ui";

export type NativeTextInputProps = Omit<
  ExpoTextInputProps,
  "defaultValue" | "style" | "textStyle" | "value"
> & {
  defaultValue?: string;
  /** Draw the control's own border. Publish fields pass false and draw the border outside. */
  framed?: boolean;
  minHeight?: number;
  style?: ExpoTextInputProps["style"];
  textStyle?: ExpoTextInputProps["textStyle"];
  value?: string;
};
