"use client";

import { useEffect, useState, type RefObject } from "react";

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
 *
 * @param guestRootRef Optional host shell for this guest. Overlays that **contain**
 * the guest (e.g. full-screen canvas `role="dialog"` hosting a browser widget)
 * must not block that guest — only overlays that sit above / outside it.
 */
export function useWebviewPointerPolicy(
  enabled: boolean,
  guestRootRef?: RefObject<Element | null>,
): boolean {
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
      const guestRoot = guestRootRef?.current ?? null;
      const nodes = document.querySelectorAll(OVERLAY_SELECTOR);
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.getAttribute("data-state") === "closed") continue;
        if (node.getAttribute("aria-hidden") === "true") continue;
        // Canvas overlay (and any host that contains this browser) is the parent
        // surface — not a competing chrome overlay.
        if (guestRoot && node.contains(guestRoot)) continue;
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
    // guestRootRef is filled after child layout; re-check so canvas-hosted
    // browsers do not stay stuck blocked from the first paint.
    const raf1 = window.requestAnimationFrame(() => {
      recompute();
      window.requestAnimationFrame(recompute);
    });
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
      window.cancelAnimationFrame(raf1);
      mo.disconnect();
      document.removeEventListener("pointerdown", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [enabled, guestRootRef]);

  return block;
}
