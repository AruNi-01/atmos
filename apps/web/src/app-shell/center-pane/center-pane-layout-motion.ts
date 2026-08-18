import { DEFAULT_PANE_ID } from "@/app-shell/center-pane/center-pane-layout";
import type { TerminalLeafBox } from "@/features/terminal/lib/terminal-layout-tree";

export const CENTER_PANE_LAYOUT_MOTION_MS = 280;

const EDGE_EPS = 0.03;

export type PaneTilePhase = "enter" | "idle" | "exit";

export type PaneTile = TerminalLeafBox & { phase: PaneTilePhase };

export type PaneTileMotionPlan = {
  entering: Array<{ from: TerminalLeafBox; to: TerminalLeafBox }>;
  exiting: Array<{ from: TerminalLeafBox; to: TerminalLeafBox }>;
  staying: Array<{ from: TerminalLeafBox; to: TerminalLeafBox }>;
};

/** Collapse `target` onto the shared edge with `neighbor` (0-width / 0-height). */
export function inferSharedEdgeCollapse(
  target: TerminalLeafBox,
  neighbor: TerminalLeafBox,
): TerminalLeafBox | null {
  const targetRight = target.left + target.width;
  const targetBottom = target.top + target.height;
  const neighborRight = neighbor.left + neighbor.width;
  const neighborBottom = neighbor.top + neighbor.height;

  if (Math.abs(target.left - neighborRight) < EDGE_EPS) {
    return { ...target, width: 0 };
  }
  if (Math.abs(neighbor.left - targetRight) < EDGE_EPS) {
    return { ...target, left: targetRight, width: 0 };
  }
  if (Math.abs(target.top - neighborBottom) < EDGE_EPS) {
    return { ...target, height: 0 };
  }
  if (Math.abs(neighbor.top - targetBottom) < EDGE_EPS) {
    return { ...target, top: targetBottom, height: 0 };
  }
  return null;
}

function collapseToCenter(box: TerminalLeafBox): TerminalLeafBox {
  return {
    ...box,
    left: box.left + box.width / 2,
    top: box.top + box.height / 2,
    width: 0,
    height: 0,
  };
}

function collapseAgainstNeighbors(
  target: TerminalLeafBox,
  neighbors: TerminalLeafBox[],
): TerminalLeafBox {
  for (const neighbor of neighbors) {
    const collapsed = inferSharedEdgeCollapse(target, neighbor);
    if (collapsed) return collapsed;
  }
  return collapseToCenter(target);
}

/**
 * When the mosaic first opens from a single pane, treat the primary tile as
 * having occupied the full stage so the split can widen/narrow instead of pop.
 */
export function seedFullStagePrevious(
  next: TerminalLeafBox[],
): TerminalLeafBox[] {
  const primary =
    next.find((leaf) => leaf.id === DEFAULT_PANE_ID) ?? next[0];
  if (!primary) return [];
  return [{ id: primary.id, left: 0, top: 0, width: 1, height: 1 }];
}

export function planPaneTileMotion(
  previous: TerminalLeafBox[],
  next: TerminalLeafBox[],
): PaneTileMotionPlan {
  const prevMap = new Map(previous.map((leaf) => [leaf.id, leaf]));
  const nextIds = new Set(next.map((leaf) => leaf.id));
  const stayingTo = next.filter((leaf) => prevMap.has(leaf.id));
  const entering = next.filter((leaf) => !prevMap.has(leaf.id));
  const exiting = previous.filter((leaf) => !nextIds.has(leaf.id));

  return {
    entering: entering.map((leaf) => ({
      from: collapseAgainstNeighbors(leaf, stayingTo),
      to: leaf,
    })),
    exiting: exiting.map((leaf) => ({
      from: leaf,
      to: collapseAgainstNeighbors(
        leaf,
        previous.filter((item) => item.id !== leaf.id),
      ),
    })),
    staying: stayingTo.map((leaf) => ({
      from: prevMap.get(leaf.id) ?? leaf,
      to: leaf,
    })),
  };
}
