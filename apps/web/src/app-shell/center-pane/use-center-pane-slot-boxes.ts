"use client";

import React from "react";
import type { CenterPaneLayout, CenterPaneTree } from "@/app-shell/center-pane/center-pane-layout";

export type PaneSlotBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/** Stable key for mosaic tree geometry so slot remasure follows split resize. */
export function centerPaneTreeKey(
  tree: CenterPaneTree | null | undefined,
): string {
  if (tree == null) return "";
  if (typeof tree === "string") return tree;
  const pct =
    typeof tree.splitPercentage === "number" && Number.isFinite(tree.splitPercentage)
      ? tree.splitPercentage.toFixed(3)
      : "50";
  return `${tree.direction}:${pct}:${centerPaneTreeKey(tree.first)}|${centerPaneTreeKey(tree.second)}`;
}

/** Changes when a pane gains or loses its content slot (empty ↔ first tab). */
export function centerPaneSlotOccupancyKey(
  layout: CenterPaneLayout | null | undefined,
): string {
  if (!layout) return "";
  return layout.panes
    .map((pane) => `${pane.id}:${pane.tabIds.length > 0 ? "1" : "0"}`)
    .join(",");
}

export function isUsablePaneSlotBox(
  box: PaneSlotBox | null | undefined,
): box is PaneSlotBox {
  return Boolean(box && box.width > 0 && box.height > 0);
}

/**
 * Live mosaic only: don't mount a pane-active terminal until its slot has a
 * real box (avoids fitting PTY at full-stage size). Warm frames have no
 * live geometry — withholding there would unmount retained split terminals.
 */
export function shouldWithholdUnmeasuredPaneTerminal(input: {
  applySlotGeometry: boolean;
  isPaneActive: boolean;
  slotBox: PaneSlotBox | null | undefined;
}): boolean {
  return (
    input.applySlotGeometry &&
    input.isPaneActive &&
    !isUsablePaneSlotBox(input.slotBox)
  );
}

const EMPTY_PANE_SLOT_BOXES: Record<string, PaneSlotBox> = {};

/** Stash the leaving workspace's slots and restore the destination's last boxes. */
export function paneSlotBoxesForContextSwitch(input: {
  prevContextId: string | null | undefined;
  nextContextId: string | null | undefined;
  currentBoxes: Record<string, PaneSlotBox>;
  cache: Record<string, Record<string, PaneSlotBox>>;
}): {
  cache: Record<string, Record<string, PaneSlotBox>>;
  boxes: Record<string, PaneSlotBox>;
} {
  if (
    !input.nextContextId ||
    input.prevContextId === input.nextContextId
  ) {
    return { cache: input.cache, boxes: input.currentBoxes };
  }
  const cache = { ...input.cache };
  if (input.prevContextId && Object.keys(input.currentBoxes).length > 0) {
    cache[input.prevContextId] = input.currentBoxes;
  }
  return {
    cache,
    boxes: (input.nextContextId && cache[input.nextContextId]) || EMPTY_PANE_SLOT_BOXES,
  };
}

/**
 * Measure `[data-center-pane-content-slot]` boxes relative to `hostRef`.
 * Used to position keep-alive panels into multi-pane content slots without remounting.
 */
export function useCenterPaneSlotBoxes(
  hostRef: React.RefObject<HTMLElement | null>,
  layout: CenterPaneLayout | null,
  enabled: boolean,
  contextId?: string | null,
): Record<string, PaneSlotBox> {
  const [boxes, setBoxes] = React.useState<Record<string, PaneSlotBox>>({});
  const cacheRef = React.useRef<Record<string, Record<string, PaneSlotBox>>>({});
  const contextRef = React.useRef(contextId ?? "");
  if (contextRef.current !== (contextId ?? "")) {
    const switched = paneSlotBoxesForContextSwitch({
      prevContextId: contextRef.current,
      nextContextId: contextId,
      currentBoxes: boxes,
      cache: cacheRef.current,
    });
    contextRef.current = contextId ?? "";
    cacheRef.current = switched.cache;
    if (switched.boxes !== boxes) {
      setBoxes(switched.boxes);
    }
  }
  const orderKey = layout?.order.join("\0") ?? "";
  const fractionKey = layout
    ? `${layout.columnFractions.join(",")}|${layout.rowFractions.join(",")}|${layout.columnCount}`
    : "";
  // Empty launchers have no content slot. Creating the first tab inserts
  // `[data-center-pane-content-slot]` without changing order/fractions —
  // remasure or the new TerminalGrid overlays the whole stage and waits
  // for a usable fit (looks like it stole the other pane's terminal).
  const occupancyKey = centerPaneSlotOccupancyKey(layout);
  const treeKey = centerPaneTreeKey(layout?.tree);

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
        if (contextId) {
          cacheRef.current = { ...cacheRef.current, [contextId]: next };
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
      const leaf = document.querySelector<HTMLElement>(
        `[data-center-split-leaf="${paneId}"]`,
      );
      if (leaf) ro.observe(leaf);
    }
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // Depend on stable string keys only — never the layout object identity.
  }, [contextId, enabled, fractionKey, hostRef, occupancyKey, orderKey, treeKey]);

  return boxes;
}
