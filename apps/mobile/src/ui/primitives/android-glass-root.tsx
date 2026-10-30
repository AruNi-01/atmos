import type { PropsWithChildren } from "react";

/**
 * iOS / web: adaptive-glass is not the Liquid Glass path. NativeTabs and
 * `expo-glass-effect` / `@expo/ui` own chrome and controls.
 */
export function AndroidGlassRoot({ children }: PropsWithChildren) {
  return children;
}
