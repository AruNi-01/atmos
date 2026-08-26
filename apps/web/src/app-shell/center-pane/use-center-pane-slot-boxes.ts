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
 * Occupied panes must keep a usable box across split/collapse remasure.
 * Dropping them to "unmeasured" unmounts keep-alive xterm/webview just to
 * grow/shrink the sibling — the user sees a black reload instead of a resize.
 */
export function mergePaneSlotBoxes(
  previous: Record<string, PaneSlotBox>,
  measured: Record<string, PaneSlotBox>,
  order: readonly string[],
): Record<string, PaneSlotBox> {
  const next: Record<string, PaneSlotBox> = {};
  for (const paneId of order) {
    const measuredBox = measured[paneId];
    if (isUsablePaneSlotBox(measuredBox)) {
      next[paneId] = measuredBox;
      continue;
    }
    const previousBox = previous[paneId];
    if (isUsablePaneSlotBox(previousBox)) {
      next[paneId] = previousBox;
    }
  }
  return next;
}

function paneSlotBoxesEqual(
  a: Record<string, PaneSlotBox>,
  b: Record<string, PaneSlotBox>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of bKeys) {
    const left = a[key];
    const right = b[key];
    if (
      !left ||
      !right ||
      Math.abs(left.top - right.top) > 0.5 ||
      Math.abs(left.left - right.left) > 0.5 ||
      Math.abs(left.width - right.width) > 0.5 ||
      Math.abs(left.height - right.height) > 0.5
    ) {
      return false;
    }
  }
  return true;
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

export type PaneSlotBoxCache = Record<string, Record<string, PaneSlotBox>>;

export type CenterPaneSlotBoxesState = {
  boxes: Record<string, PaneSlotBox>;
  cache: PaneSlotBoxCache;
};

/**
 * Measure `[data-center-pane-content-slot]` boxes relative to `hostRef`.
 * Used to position keep-alive panels into pane content slots without remounting.
 * `remeasureKey` re-runs the observer when overlay geometry changes (e.g. pane fullscreen).
 *
 * Context switches restore the destination's last boxes from `cache` during
 * render — do not `setState` here. A synchronous extra commit on every
 * left-sidebar hop walked keep-alive trees before paint.
 */
export function useCenterPaneSlotBoxes(
  hostRef: React.RefObject<HTMLElement | null>,
  layout: CenterPaneLayout | null,
  enabled: boolean,
  contextId?: string | null,
  remeasureKey?: string | null,
): CenterPaneSlotBoxesState {
  const [snapshot, setSnapshot] = React.useState<{
    contextId: string;
    boxes: Record<string, PaneSlotBox>;
  }>({ contextId: contextId ?? "", boxes: {} });
  const cacheRef = React.useRef<PaneSlotBoxCache>({});
  const prevContextRef = React.useRef(contextId ?? "");
  if (prevContextRef.current !== (contextId ?? "")) {
    const switched = paneSlotBoxesForContextSwitch({
      prevContextId: prevContextRef.current,
      nextContextId: contextId,
      currentBoxes:
        snapshot.contextId === prevContextRef.current
          ? snapshot.boxes
          : EMPTY_PANE_SLOT_BOXES,
      cache: cacheRef.current,
    });
    prevContextRef.current = contextId ?? "";
    cacheRef.current = switched.cache;
  }
  const boxes =
    snapshot.contextId === (contextId ?? "")
      ? snapshot.boxes
      : (contextId && cacheRef.current[contextId]) || EMPTY_PANE_SLOT_BOXES;
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
    // Measure even a single pane: overlay keep-alive (xterm/webview) is
    // positioned into `[data-center-pane-content-slot]` for 1 and N panes.
    // Clearing on N→1 withholds the remaining terminal and remounts it.
    if (!enabled || !layout || layout.order.length < 1) {
      // Avoid setState({}) every render — empty object identity would loop.
      setSnapshot((prev) => {
        const id = contextId ?? "";
        if (prev.contextId === id && Object.keys(prev.boxes).length === 0) {
          return prev;
        }
        return { contextId: id, boxes: EMPTY_PANE_SLOT_BOXES };
      });
      return;
    }

    const host = hostRef.current;
    if (!host) return;

    const order = layout.order;
    const id = contextId ?? "";

    const measure = () => {
      const hostRect = host.getBoundingClientRect();
      if (hostRect.width <= 0 || hostRect.height <= 0) return;
      const measured: Record<string, PaneSlotBox> = {};
      for (const paneId of order) {
        const slot = document.querySelector<HTMLElement>(
          `[data-center-pane-content-slot="${paneId}"]`,
        );
        if (!slot) continue;
        const r = slot.getBoundingClientRect();
        measured[paneId] = {
          top: r.top - hostRect.top,
          left: r.left - hostRect.left,
          width: r.width,
          height: r.height,
        };
      }
      setSnapshot((prev) => {
        const base =
          prev.contextId === id
            ? prev.boxes
            : (id && cacheRef.current[id]) || EMPTY_PANE_SLOT_BOXES;
        const next = mergePaneSlotBoxes(base, measured, order);
        if (prev.contextId === id && paneSlotBoxesEqual(prev.boxes, next)) {
          return prev;
        }
        if (id) {
          cacheRef.current = { ...cacheRef.current, [id]: next };
        }
        return { contextId: id, boxes: next };
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
  }, [
    contextId,
    enabled,
    fractionKey,
    hostRef,
    occupancyKey,
    orderKey,
    remeasureKey,
    treeKey,
  ]);

  return { boxes, cache: cacheRef.current };
}
