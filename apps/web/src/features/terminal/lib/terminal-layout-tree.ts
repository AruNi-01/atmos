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
