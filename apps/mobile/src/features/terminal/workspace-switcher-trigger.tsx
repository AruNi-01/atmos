import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { GlassPanel } from "@/ui/primitives/glass-panel";

/**
 * iOS / default trigger chrome. Adaptive-glass `GlassSurface` is Android-only
 * (`workspace-switcher-trigger.android.tsx`).
 */
export function WorkspaceSwitcherTrigger({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <GlassPanel colorScheme="dark" interactive shadow={false} style={style}>
      {children}
    </GlassPanel>
  );
}
