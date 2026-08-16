"use client";

import React from "react";
import type { CenterPaneLayout } from "@/app-shell/center-pane/center-pane-layout";

export type PaneSlotBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/**
 * Measure `[data-center-pane-content-slot]` boxes relative to `hostRef`.
 * Used to position keep-alive panels into multi-pane content slots without remounting.
 */
export function useCenterPaneSlotBoxes(
  hostRef: React.RefObject<HTMLElement | null>,
  layout: CenterPaneLayout | null,
  enabled: boolean,
): Record<string, PaneSlotBox> {
  const [boxes, setBoxes] = React.useState<Record<string, PaneSlotBox>>({});
  const orderKey = layout?.order.join("\0") ?? "";
  const fractionKey = layout
    ? `${layout.columnFractions.join(",")}|${layout.rowFractions.join(",")}|${layout.columnCount}`
    : "";

  React.useLayoutEffect(() => {
    if (!enabled || !layout || layout.order.length <= 1) {
      // Avoid setState({}) every render — empty object identity would loop.
      setBoxes((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    const host = hostRef.current;
    if (!host) return;

    const order = layout.order;

    const measure = () => {
      const hostRect = host.getBoundingClientRect();
      if (hostRect.width <= 0 || hostRect.height <= 0) return;
      const next: Record<string, PaneSlotBox> = {};
      for (const paneId of order) {
        const slot = document.querySelector<HTMLElement>(
          `[data-center-pane-content-slot="${paneId}"]`,
        );
        if (!slot) continue;
        const r = slot.getBoundingClientRect();
        next[paneId] = {
          top: r.top - hostRect.top,
          left: r.left - hostRect.left,
          width: r.width,
          height: r.height,
        };
      }
      setBoxes((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(next);
        if (prevKeys.length === nextKeys.length) {
          let same = true;
          for (const key of nextKeys) {
            const a = prev[key];
            const b = next[key];
            if (
              !a ||
              !b ||
              Math.abs(a.top - b.top) > 0.5 ||
              Math.abs(a.left - b.left) > 0.5 ||
              Math.abs(a.width - b.width) > 0.5 ||
              Math.abs(a.height - b.height) > 0.5
            ) {
              same = false;
              break;
            }
          }
          if (same) return prev;
        }
        return next;
      });
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    for (const paneId of order) {
      const slot = document.querySelector<HTMLElement>(
        `[data-center-pane-content-slot="${paneId}"]`,
      );
      if (slot) ro.observe(slot);
    }
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // Depend on stable string keys only — never the layout object identity.
  }, [enabled, fractionKey, hostRef, orderKey]);

  return boxes;
}
