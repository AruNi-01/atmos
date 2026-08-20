/**
 * Binary split tree for terminal panes inside a TerminalGrid.
 * Direction: "row" = left|right, "column" = top|bottom.
 */

export type TerminalLayoutDirection = "row" | "column";

export type TerminalLayoutBranch<T> = {
  direction: TerminalLayoutDirection;
  first: TerminalLayoutNode<T>;
  second: TerminalLayoutNode<T>;
  /** Percentage of the first pane (15–85). */
  splitPercentage?: number;
};

export type TerminalLayoutNode<T> = TerminalLayoutBranch<T> | T;

export type TerminalLayoutPath = Array<"first" | "second">;

/** Mosaic-style dock edge when dragging a pane onto another pane or the grid. */
export type TerminalDockEdge = "left" | "right" | "top" | "bottom";

export type ClientRectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type TerminalLeafBox = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

const UNIT_SQUARE_EDGE_EPS = 0.001;

/** Which edges of the unit-square mosaic a leaf tile sits on. */
export function unitSquareEdgeFlags(
  box: Pick<TerminalLeafBox, "left" | "top" | "width" | "height">,
  eps = UNIT_SQUARE_EDGE_EPS,
): { left: boolean; right: boolean; top: boolean; bottom: boolean } {
  return {
    left: box.left <= eps,
    top: box.top <= eps,
    right: box.left + box.width >= 1 - eps,
    bottom: box.top + box.height >= 1 - eps,
  };
}

export type TerminalSplitBox = {
  path: TerminalLayoutPath;
  direction: TerminalLayoutDirection;
  left: number;
  top: number;
  width: number;
  height: number;
  parent: ClientRectLike;
};

export function isTerminalLayoutBranch<T>(
  node: TerminalLayoutNode<T>,
): node is TerminalLayoutBranch<T> {
  return typeof node === "object" && node !== null && "direction" in node;
}

/** Leaf ids in reading order (left-to-right / top-to-bottom). */
export function getLeaves<T extends string>(
  node: TerminalLayoutNode<T> | null | undefined,
): T[] {
  if (node == null) return [];
  if (!isTerminalLayoutBranch(node)) return [node];
  return [...getLeaves(node.first), ...getLeaves(node.second)];
}

/** Unit-square geometry for keyed leaf tiles + overlay splitters. */
export function collectTerminalLayoutGeometry(
  node: TerminalLayoutNode<string>,
  box: ClientRectLike = { left: 0, top: 0, width: 1, height: 1 },
  path: TerminalLayoutPath = [],
): { leaves: TerminalLeafBox[]; splits: TerminalSplitBox[] } {
  if (!isTerminalLayoutBranch(node)) {
    return {
      leaves: [
        {
          id: node,
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
        },
      ],
      splits: [],
    };
  }

  const pct = clampSplitPercentage(node.splitPercentage ?? 50) / 100;
  const isRow = node.direction === "row";
  const firstBox: ClientRectLike = isRow
    ? { left: box.left, top: box.top, width: box.width * pct, height: box.height }
    : { left: box.left, top: box.top, width: box.width, height: box.height * pct };
  const secondBox: ClientRectLike = isRow
    ? {
        left: box.left + box.width * pct,
        top: box.top,
        width: box.width * (1 - pct),
        height: box.height,
      }
    : {
        left: box.left,
        top: box.top + box.height * pct,
        width: box.width,
        height: box.height * (1 - pct),
      };
  const split: TerminalSplitBox = isRow
    ? {
        path,
        direction: node.direction,
        left: box.left + box.width * pct,
        top: box.top,
        width: 0,
        height: box.height,
        parent: box,
      }
    : {
        path,
        direction: node.direction,
        left: box.left,
        top: box.top + box.height * pct,
        width: box.width,
        height: 0,
        parent: box,
      };

  const first = collectTerminalLayoutGeometry(node.first, firstBox, [...path, "first"]);
  const second = collectTerminalLayoutGeometry(node.second, secondBox, [...path, "second"]);
  return {
    leaves: [...first.leaves, ...second.leaves],
    splits: [split, ...first.splits, ...second.splits],
  };
}

export function clampSplitPercentage(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(85, Math.max(15, value));
}

export function updateSplitPercentageAtPath<T>(
  node: TerminalLayoutNode<T>,
  path: TerminalLayoutPath,
  percentage: number,
): TerminalLayoutNode<T> {
  const pct = clampSplitPercentage(percentage);
  if (path.length === 0) {
    if (!isTerminalLayoutBranch(node)) return node;
    if (node.splitPercentage === pct) return node;
    return { ...node, splitPercentage: pct };
  }
  if (!isTerminalLayoutBranch(node)) return node;
  const [head, ...rest] = path;
  if (head !== "first" && head !== "second") return node;
  return {
    ...node,
    [head]: updateSplitPercentageAtPath(node[head], rest, pct),
  };
}

export function removePaneFromLayoutTree(
  node: TerminalLayoutNode<string> | null,
  targetId: string,
): TerminalLayoutNode<string> | null {
  if (!node) return null;
  if (!isTerminalLayoutBranch(node)) {
    return node === targetId ? null : node;
  }
  const first = removePaneFromLayoutTree(node.first, targetId);
  const second = removePaneFromLayoutTree(node.second, targetId);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

/** Swap two leaf pane ids; split geometry stays put. */
export function swapLeavesInLayoutTree<T extends string>(
  node: TerminalLayoutNode<T>,
  firstId: T,
  secondId: T,
): TerminalLayoutNode<T> {
  if (firstId === secondId) return node;
  const rewrite = (current: TerminalLayoutNode<T>): TerminalLayoutNode<T> => {
    if (!isTerminalLayoutBranch(current)) {
      if (current === firstId) return secondId;
      if (current === secondId) return firstId;
      return current;
    }
    return {
      ...current,
      first: rewrite(current.first),
      second: rewrite(current.second),
    };
  };
  return rewrite(node);
}

function wrapWithDock(
  target: TerminalLayoutNode<string>,
  sourceId: string,
  edge: TerminalDockEdge,
): TerminalLayoutBranch<string> {
  const direction: TerminalLayoutDirection =
    edge === "left" || edge === "right" ? "row" : "column";
  const sourceFirst = edge === "left" || edge === "top";
  return {
    direction,
    first: sourceFirst ? sourceId : target,
    second: sourceFirst ? target : sourceId,
    splitPercentage: 50,
  };
}

function insertBesideLeaf(
  node: TerminalLayoutNode<string>,
  targetId: string,
  sourceId: string,
  edge: TerminalDockEdge,
): TerminalLayoutNode<string> {
  if (!isTerminalLayoutBranch(node)) {
    if (node !== targetId) return node;
    return wrapWithDock(node, sourceId, edge);
  }
  return {
    ...node,
    first: insertBesideLeaf(node.first, targetId, sourceId, edge),
    second: insertBesideLeaf(node.second, targetId, sourceId, edge),
  };
}

/**
 * Move `sourceId` next to `targetId` on `edge`.
 * Same algorithm as react-mosaic's drag-to-split: remove the source, then
 * replace the target leaf with a new split.
 */
export function dockLeafInLayoutTree(
  node: TerminalLayoutNode<string>,
  sourceId: string,
  targetId: string,
  edge: TerminalDockEdge,
): TerminalLayoutNode<string> {
  if (sourceId === targetId) return node;
  const without = removePaneFromLayoutTree(node, sourceId);
  if (!without) return node;
  return insertBesideLeaf(without, targetId, sourceId, edge);
}

/** Same split directions and leaf identities; split percentages may differ. */
export function terminalLayoutTopologyEqual(
  a: TerminalLayoutNode<string>,
  b: TerminalLayoutNode<string>,
): boolean {
  if (a === b) return true;
  if (!isTerminalLayoutBranch(a) || !isTerminalLayoutBranch(b)) {
    return a === b;
  }
  return (
    a.direction === b.direction &&
    terminalLayoutTopologyEqual(a.first, b.first) &&
    terminalLayoutTopologyEqual(a.second, b.second)
  );
}

/** Dock `sourceId` against the whole remaining tree (root edge drop). */
export function dockLeafAtRoot(
  node: TerminalLayoutNode<string>,
  sourceId: string,
  edge: TerminalDockEdge,
): TerminalLayoutNode<string> {
  const without = removePaneFromLayoutTree(node, sourceId);
  if (!without) return node;
  return wrapWithDock(without, sourceId, edge);
}

/**
 * Mosaic edge hit-test: 30% bands on each side, vertical edges win in corners,
 * center falls back to the nearest edge so a drop is always possible.
 */
export function hitDockEdge(
  rect: ClientRectLike,
  x: number,
  y: number,
  band = 0.3,
): TerminalDockEdge {
  if (rect.width <= 0 || rect.height <= 0) return "bottom";
  const relX = (x - rect.left) / rect.width;
  const relY = (y - rect.top) / rect.height;
  const toTop = relY;
  const toBottom = 1 - relY;
  const toLeft = relX;
  const toRight = 1 - relX;
  if (toTop <= band && toTop <= toLeft && toTop <= toRight) return "top";
  if (toBottom <= band && toBottom <= toLeft && toBottom <= toRight) return "bottom";
  if (toLeft <= band) return "left";
  if (toRight <= band) return "right";
  const nearest = Math.min(toTop, toBottom, toLeft, toRight);
  if (nearest === toTop) return "top";
  if (nearest === toBottom) return "bottom";
  if (nearest === toLeft) return "left";
  return "right";
}

export function splitPaneInLayoutTree(
  node: TerminalLayoutNode<string>,
  targetId: string,
  newId: string,
  direction: TerminalLayoutDirection,
): TerminalLayoutNode<string> {
  if (!isTerminalLayoutBranch(node)) {
    if (node === targetId) {
      return {
        direction,
        first: node,
        second: newId,
        splitPercentage: 50,
      };
    }
    return node;
  }
  return {
    ...node,
    first: splitPaneInLayoutTree(node.first, targetId, newId, direction),
    second: splitPaneInLayoutTree(node.second, targetId, newId, direction),
  };
}
