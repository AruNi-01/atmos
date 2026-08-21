/** Pixel box of a mosaic leaf — typically `getBoundingClientRect()`. */
export type CenterPaneDockRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function isPointInsideRect(
  pointer: { x: number; y: number },
  rect: CenterPaneDockRect,
): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  return (
    pointer.x >= rect.left &&
    pointer.x <= rect.left + rect.width &&
    pointer.y >= rect.top &&
    pointer.y <= rect.top + rect.height
  );
}

/**
 * Mosaic dock targets (root edges and neighbor panes) must not fire while the
 * pointer is still inside the source pane, including its own borders. Dropping
 * immediately after picking up the top handle would otherwise hit `root-drop:top`
 * and dock onto the remaining tree.
 */
export function shouldIgnoreDockWhileOverSource(
  pointer: { x: number; y: number } | null | undefined,
  sourceRect: CenterPaneDockRect | null | undefined,
): boolean {
  if (!pointer || !sourceRect) return false;
  return isPointInsideRect(pointer, sourceRect);
}

/**
 * Only another pane is a valid dock. Source borders, the 4px mosaic gap, and
 * empty chrome around the grid stay inert — same as Terminal pane drag.
 */
export function shouldSuppressCenterPaneDockHover(
  pointer: { x: number; y: number } | null | undefined,
  sourceRect: CenterPaneDockRect | null | undefined,
  otherRects: readonly CenterPaneDockRect[],
): boolean {
  if (!pointer) return false;
  if (shouldIgnoreDockWhileOverSource(pointer, sourceRect)) return true;
  if (otherRects.length === 0) return false;
  return !otherRects.some((rect) => isPointInsideRect(pointer, rect));
}
