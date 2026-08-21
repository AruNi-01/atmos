"use client";

import { useLayoutEffect, useRef, useState } from "react";

import {
  CENTER_PANE_LAYOUT_MOTION_MS,
  planPaneTileMotion,
  seedFullStagePrevious,
  type PaneTile,
} from "@/app-shell/center-pane/center-pane-layout-motion";
import type { TerminalLeafBox } from "@/features/terminal/lib/terminal-layout-tree";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function leafKey(leaves: TerminalLeafBox[]): string {
  return leaves
    .map(
      (leaf) =>
        `${leaf.id}:${leaf.left.toFixed(4)},${leaf.top.toFixed(4)},${leaf.width.toFixed(4)},${leaf.height.toFixed(4)}`,
    )
    .join("|");
}

function tilesFromLeaves(leaves: TerminalLeafBox[], seedFromFullPane: boolean): PaneTile[] {
  if (seedFromFullPane && leaves.length > 1) {
    const plan = planPaneTileMotion(seedFullStagePrevious(leaves), leaves);
    return [
      ...plan.staying.map(({ from }) => ({ ...from, phase: "idle" as const })),
      ...plan.entering.map(({ from }) => ({ ...from, phase: "enter" as const })),
    ];
  }
  return leaves.map((leaf) => ({ ...leaf, phase: "idle" as const }));
}

export function useAnimatedPaneTiles(
  leaves: TerminalLeafBox[],
  options: {
    liveResizing: boolean;
    seedFromFullPane: boolean;
    contextId?: string;
  },
): PaneTile[] {
  const [tiles, setTiles] = useState<PaneTile[]>(() =>
    tilesFromLeaves(leaves, options.seedFromFullPane),
  );
  const prevLeavesRef = useRef<TerminalLeafBox[]>(leaves);
  const prevContextRef = useRef(options.contextId);
  const seenSeedRef = useRef(false);
  const key = leafKey(leaves);

  useLayoutEffect(() => {
    const contextChanged = prevContextRef.current !== options.contextId;
    prevContextRef.current = options.contextId;

    if (contextChanged) {
      seenSeedRef.current = false;
      prevLeavesRef.current = leaves;
      setTiles(leaves.map((leaf) => ({ ...leaf, phase: "idle" as const })));
      return;
    }

    const previous = prevLeavesRef.current;
    const shouldSeed =
      options.seedFromFullPane &&
      !seenSeedRef.current &&
      previous.length <= 1;
    if (options.seedFromFullPane) seenSeedRef.current = true;

    if (options.liveResizing || prefersReducedMotion()) {
      prevLeavesRef.current = leaves;
      setTiles(leaves.map((leaf) => ({ ...leaf, phase: "idle" as const })));
      return;
    }

    const plan = planPaneTileMotion(
      shouldSeed ? seedFullStagePrevious(leaves) : previous,
      leaves,
    );
    prevLeavesRef.current = leaves;

    const hasMotion =
      plan.entering.length > 0 ||
      plan.exiting.length > 0 ||
      plan.staying.some(
        ({ from, to }) =>
          from.left !== to.left ||
          from.top !== to.top ||
          from.width !== to.width ||
          from.height !== to.height,
      );
    if (!hasMotion) {
      setTiles(leaves.map((leaf) => ({ ...leaf, phase: "idle" as const })));
      return;
    }

    setTiles([
      ...plan.staying.map(({ from }) => ({ ...from, phase: "idle" as const })),
      ...plan.entering.map(({ from }) => ({ ...from, phase: "enter" as const })),
      ...plan.exiting.map(({ from }) => ({ ...from, phase: "exit" as const })),
    ]);

    const frame = window.requestAnimationFrame(() => {
      setTiles([
        ...plan.staying.map(({ to }) => ({ ...to, phase: "idle" as const })),
        ...plan.entering.map(({ to }) => ({ ...to, phase: "enter" as const })),
        ...plan.exiting.map(({ to }) => ({ ...to, phase: "exit" as const })),
      ]);
    });
    const timer = window.setTimeout(() => {
      setTiles(leaves.map((leaf) => ({ ...leaf, phase: "idle" as const })));
    }, CENTER_PANE_LAYOUT_MOTION_MS);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
    // Geometry identity is captured in `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, options.contextId, options.liveResizing, options.seedFromFullPane]);

  return tiles;
}
