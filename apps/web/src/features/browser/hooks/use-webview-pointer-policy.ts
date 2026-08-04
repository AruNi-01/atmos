"use client";

import { useEffect, useState } from "react";

const OVERLAY_SELECTOR = [
  '[data-slot="dialog-content"]',
  '[data-slot="sheet-content"]',
  '[data-slot="drawer-content"]',
  '[data-slot="drawer-popup"]',
  '[data-slot="popover-content"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="context-menu-content"]',
  '[data-slot="select-content"]',
  '[data-radix-popper-content-wrapper]',
  '[role="dialog"]',
  '[aria-modal="true"]',
  "[data-atmos-browser-surface-overlay]",
  // Host element-select toolbar (SelectionPopover) over live webview
  "[data-selection-popover]",
].join(", ");

/**
 * Returns true when host overlays are open or a document-level drag is active,
 * so the desktop `<webview>` should set pointer-events: none.
 */
export function useWebviewPointerPolicy(enabled: boolean): boolean {
  const [block, setBlock] = useState(false);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") {
      setBlock(false);
      return;
    }

    const recompute = () => {
      const dragActive =
        document.documentElement.hasAttribute("data-atmos-drag-active") ||
        document.body.hasAttribute("data-atmos-drag-active");
      if (dragActive) {
        setBlock(true);
        return;
      }
      const nodes = document.querySelectorAll(OVERLAY_SELECTOR);
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.getAttribute("data-state") === "closed") continue;
        if (node.getAttribute("aria-hidden") === "true") continue;
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (Number(style.opacity) <= 0) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        setBlock(true);
        return;
      }
      setBlock(false);
    };

    recompute();
    const mo = new MutationObserver(recompute);
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-hidden", "class", "style", "data-atmos-drag-active"],
    });
    document.addEventListener("pointerdown", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      mo.disconnect();
      document.removeEventListener("pointerdown", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [enabled]);

  return block;
}
