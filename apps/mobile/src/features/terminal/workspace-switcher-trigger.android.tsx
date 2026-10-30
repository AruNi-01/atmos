import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { GlassSurface } from "@rbayuokt/expo-adaptive-glass";

export function WorkspaceSwitcherTrigger({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <GlassSurface
      accessibilityRole="button"
      cornerRadius={999}
      intensity={0.7}
      priority="high"
      style={style}
      tint="dark"
    >
      {children}
    </GlassSurface>
  );
}
