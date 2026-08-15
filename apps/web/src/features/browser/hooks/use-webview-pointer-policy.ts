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
  '[data-slot="tooltip-content"]',
  '[data-radix-popper-content-wrapper]',
  '[role="dialog"]',
  '[aria-modal="true"]',
  "[data-atmos-browser-surface-overlay]",
  // Host element-select toolbar (SelectionPopover) over live webview
  "[data-selection-popover]",
].join(", ");

/**
 * True when an overlay rect meaningfully intersects the viewport.
 * Off-screen shells (e.g. canvas `translate-y-full` while keep-alive) still
 * report a large getBoundingClientRect and must not freeze the guest.
 */
function rectIntersectsViewport(rect: DOMRect): boolean {
  if (rect.width < 2 || rect.height < 2) return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return rect.right > 1 && rect.bottom > 1 && rect.left < vw - 1 && rect.top < vh - 1;
}

/**
 * Returns true when host overlays are open or a document-level drag is active,
 * so the desktop `<webview>` should set pointer-events: none.
 *
 * False positives here break element-select hover: the host shell still shows
 * the pick cursor, but the guest never receives mousemove so the green outline
 * never appears.
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
        // Closed canvas keep-alive (and any inert shell) must not steal the guest.
        if (node.hasAttribute("inert")) continue;
        if (node.getAttribute("data-canvas-open") === "false") continue;
        // Canvas overlay (and any host that contains this browser) is the parent
        // surface — not a competing chrome overlay.
        if (guestRoot && node.contains(guestRoot)) continue;
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (Number(style.opacity) <= 0) continue;
        // Overlay itself does not receive hits — no need to freeze the webview.
        if (style.pointerEvents === "none") continue;
        const rect = node.getBoundingClientRect();
        if (!rectIntersectsViewport(rect)) continue;
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
      attributeFilter: [
        "data-state",
        "aria-hidden",
        "class",
        "style",
        "inert",
        "data-canvas-open",
        "data-atmos-drag-active",
      ],
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
