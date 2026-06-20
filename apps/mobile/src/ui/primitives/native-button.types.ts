import type { ButtonVariant } from "@expo/ui";

export type NativeButtonProps = {
  disabled?: boolean;
  label: string;
  onPress?: () => void;
  tone?: "default" | "inverse";
  variant?: ButtonVariant;
};
