"use client";

import { useEffect } from "react";
import { useHeldShortcutPrefixStore } from "@/app-shell/held-shortcut-prefix-store";
import {
  heldShortcutPrefixFromModifiers,
  isCenterStageHotkeyTarget,
  modifiersFromKeyboardEvent,
} from "@/app-shell/shortcut-prefix";

export function HeldShortcutPrefixListener() {
  useEffect(() => {
    const setPrefix = useHeldShortcutPrefixStore.getState().setPrefix;

    const sync = (event: KeyboardEvent) => {
      const { mod, shift } = modifiersFromKeyboardEvent(event);
      setPrefix(
        heldShortcutPrefixFromModifiers({
          mod,
          shift,
          centerFocused: isCenterStageHotkeyTarget(event.target),
        }),
      );
    };

    const clear = () => setPrefix(null);
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") clear();
    };

    window.addEventListener("keydown", sync, true);
    window.addEventListener("keyup", sync, true);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("keydown", sync, true);
      window.removeEventListener("keyup", sync, true);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      setPrefix(null);
    };
  }, []);

  return null;
}
