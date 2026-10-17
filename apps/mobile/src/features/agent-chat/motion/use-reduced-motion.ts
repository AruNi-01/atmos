import { useSyncExternalStore } from "react";
import { useReducedMotion as useSystemReducedMotion } from "react-native-reanimated";
import {
  chatReducedMotion,
  parityReducedMotionActive,
  subscribeParityReducedMotion,
} from "./parity-reduced-motion";

/** One gate for chat motion. A parity pin wins over the system setting. */
export function useReducedMotion(): boolean {
  const system = useSystemReducedMotion();
  const forced = useSyncExternalStore(
    subscribeParityReducedMotion,
    parityReducedMotionActive,
    parityReducedMotionActive,
  );
  return chatReducedMotion(system, forced);
}
