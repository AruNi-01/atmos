"use client";

import { useEffect } from "react";
import { useHeldShortcutPrefixStore } from "@/app-shell/held-shortcut-prefix-store";
import { desktopListen, isElectronShell } from "@/shared/lib/desktop-bridge";
import {
  dispatchCenterRegionDigitShortcut,
  heldShortcutPrefixFromModifiers,
  HOST_DIGIT_SHORTCUT_EVENT,
  isCenterStageHotkeyTarget,
  modifiersFromKeyboardEvent,
  noteCenterRegionFocusTarget,
  noteCenterRegionPointerTarget,
  parseHostDigitShortcutPayload,
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

    const onPointerDown = (event: Event) => {
      noteCenterRegionPointerTarget(event.target);
    };
    const onFocusIn = (event: FocusEvent) => {
      noteCenterRegionFocusTarget(event.target);
    };

    const clear = () => setPrefix(null);
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") clear();
    };

    window.addEventListener("keydown", sync, true);
    window.addEventListener("keyup", sync, true);
    window.addEventListener("blur", clear);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("keydown", sync, true);
      window.removeEventListener("keyup", sync, true);
      window.removeEventListener("blur", clear);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      setPrefix(null);
    };
  }, []);

  useEffect(() => {
    if (!isElectronShell()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void desktopListen(HOST_DIGIT_SHORTCUT_EVENT, (payload) => {
      const parsed = parseHostDigitShortcutPayload(payload);
      if (!parsed) return;
      dispatchCenterRegionDigitShortcut(parsed);
    }).then((off) => {
      if (cancelled) {
        off();
        return;
      }
      unlisten = off;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return null;
}
