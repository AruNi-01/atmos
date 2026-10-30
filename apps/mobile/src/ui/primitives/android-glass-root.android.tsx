import type { PropsWithChildren } from "react";
import { GlassProvider } from "@rbayuokt/expo-adaptive-glass";

/**
 * One adaptive-glass layer for the whole Android tree. Tab-bar clarity and
 * quality live here so home tabs are not wrapped in a second Provider.
 */
export function AndroidGlassRoot({ children }: PropsWithChildren) {
  return (
    <GlassProvider clarity={0} quality="ultra">
      {children}
    </GlassProvider>
  );
}
