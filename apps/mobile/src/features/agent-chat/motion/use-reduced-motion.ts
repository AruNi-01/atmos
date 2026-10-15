import { useReducedMotion as useSystemReducedMotion } from "react-native-reanimated";

/** One gate for chat motion. Reanimated reads the system reduced-motion setting. */
export function useReducedMotion(): boolean {
  return useSystemReducedMotion();
}
