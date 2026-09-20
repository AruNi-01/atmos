"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * React Aria's `Popover` with `isNonModal` disables outside-click dismiss.
 * Close when a pointerdown lands outside every given ref.
 */
export function useDismissOnOutsidePress(
  isOpen: boolean,
  onDismiss: () => void,
  refs: RefObject<HTMLElement | null>[],
) {
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      onDismiss();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isOpen, onDismiss, refs]);
}

/**
 * Pressing the trigger while open should toggle closed. React Aria may fire
 * `onOpenChange(false)` then `onOpenChange(true)` in the same press.
 */
export function useTriggerToggle(
  isOpen: boolean,
  triggerRef: RefObject<HTMLElement | null>,
) {
  const suppressReopenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node)) return;
      suppressReopenRef.current = true;
      setTimeout(() => {
        suppressReopenRef.current = false;
      }, 400);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isOpen, triggerRef]);

  return (next: boolean) => {
    if (next && suppressReopenRef.current) {
      suppressReopenRef.current = false;
      return false;
    }
    return true;
  };
}
