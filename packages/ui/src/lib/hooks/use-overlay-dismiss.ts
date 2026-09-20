"use client";

import { useEffect } from "react";

export function isOverlayAnchorActive(element: HTMLElement | null | undefined) {
  if (!element?.isConnected) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;

  let node: HTMLElement | null = element;
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (style.opacity === "0") return false;
    if (node.getAttribute("aria-hidden") === "true") return false;
    node = node.parentElement;
  }
  return true;
}

/** Dismiss a portaled overlay when the user leaves its trigger surface. */
export function useOverlayDismiss({
  open,
  onDismiss,
  isInside,
  getAnchor,
}: {
  open: boolean;
  onDismiss: () => void;
  isInside: (node: Node | null) => boolean;
  getAnchor: () => HTMLElement | null;
}) {
  useEffect(() => {
    if (!open) return;

    const dismiss = () => onDismiss();
    const onPointerDown = (event: PointerEvent) => {
      if (isInside(event.target as Node)) return;
      dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    const onAnchorGone = () => {
      if (!isOverlayAnchorActive(getAnchor())) dismiss();
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", dismiss);
    window.addEventListener("popstate", dismiss);
    document.addEventListener("visibilitychange", onAnchorGone);

    const observer = new MutationObserver(onAnchorGone);
    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["aria-hidden", "style", "class", "hidden", "data-tier"],
    });

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("popstate", dismiss);
      document.removeEventListener("visibilitychange", onAnchorGone);
      observer.disconnect();
    };
  }, [getAnchor, isInside, onDismiss, open]);
}
