import { useEffect, useRef } from "react";

/**
 * Captures document.activeElement when `open` becomes true,
 * and restores focus to it when `open` becomes false.
 *
 * Returns `onCloseAutoFocusPrevent` to pass to Radix
 * PopoverContent / DialogContent to prevent them from
 * focusing the trigger element on close.
 */
export function useFocusRestore(open: boolean) {
  const savedRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      savedRef.current = document.activeElement;
    } else {
      const el = savedRef.current;
      if (el instanceof HTMLElement && el.isConnected) {
        requestAnimationFrame(() => el.focus());
      }
      savedRef.current = null;
    }
  }, [open]);

  const onCloseAutoFocusPrevent = (e: Event) => e.preventDefault();

  return { onCloseAutoFocusPrevent } as const;
}
