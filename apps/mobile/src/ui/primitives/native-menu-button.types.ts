import type { MenuAction } from "@expo/ui/community/menu";
import type { ImageSourcePropType } from "react-native";

export type NativeMenuAction = MenuAction;

export type NativeMenuButtonProps = {
  actions: NativeMenuAction[];
  androidIcon?: ImageSourcePropType;
  disabled?: boolean;
  iconOnly?: boolean;
  label: string;
  onAction: (actionId: string) => void;
  systemImage?: string;
  title?: string;
};
