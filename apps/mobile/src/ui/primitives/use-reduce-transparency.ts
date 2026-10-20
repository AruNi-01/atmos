import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReduceTransparencyEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    const read = AccessibilityInfo.isReduceTransparencyEnabled;
    if (typeof read !== "function") return undefined;
    void read()
      .then((value) => {
        if (alive) setEnabled(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setEnabled,
    );
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}
