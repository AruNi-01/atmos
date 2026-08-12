import type { ComponentType } from "react";
import type { ButtonVariant } from "@expo/ui";

export type NativeButtonIcon = ComponentType<{ color: string; size: number; strokeWidth?: number }>;

export type NativeButtonSurface = "cta" | "control";

export type NativeButtonControlTone = "default" | "secondary" | "danger" | "text";

export type NativeButtonProps = {
  disabled?: boolean;
  grow?: boolean;
  icon?: NativeButtonIcon;
  label: string;
  onPress?: () => void;
  surface?: NativeButtonSurface;
  tone?: "default" | "inverse" | NativeButtonControlTone;
  variant?: ButtonVariant;
};
