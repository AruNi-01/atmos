"use client";

import { useEffect } from "react";

/**
 * Guest clicks inside `<webview>` do not produce host pointerdown.
 * Dismiss host overlays when the window blurs or focus moves into a WEBVIEW.
 */
export function useOverlayDismissOnWebview(onDismiss: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const handleBlur = () => {
      onDismiss();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.tagName === "WEBVIEW" || target.closest("webview")) {
        onDismiss();
      }
    };

    window.addEventListener("blur", handleBlur);
    document.addEventListener("focusin", handleFocusIn, true);
    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("focusin", handleFocusIn, true);
    };
  }, [enabled, onDismiss]);
}
