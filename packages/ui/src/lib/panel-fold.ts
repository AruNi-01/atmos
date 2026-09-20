export type PanelFoldSide = "left" | "right";

/**
 * Cursor for a fold/expand control. Points in the direction the panel will move:
 * left rail collapses west / expands east; right rail collapses east / expands west.
 */
export function panelFoldCursorClass(
  side: PanelFoldSide,
  collapsed: boolean,
): "cursor-e-resize" | "cursor-w-resize" {
  const movesWest =
    (side === "left" && !collapsed) || (side === "right" && collapsed);
  return movesWest ? "cursor-w-resize" : "cursor-e-resize";
}
