export type OriginBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type RectLike = {
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
};

/**
 * Prefer the interactive canvas Excalidraw uses for pointer hit-testing.
 * Fall back to the static wrapper, then the `.excalidraw` host.
 * Do not comma-query `.excalidraw` first — tree order would match the full
 * board chrome instead of the canvas.
 */
export function findCanvasOriginNode(board: ParentNode): Element | null {
  return (
    board.querySelector("canvas.excalidraw__canvas.interactive") ??
    board.querySelector(".excalidraw__canvas-wrapper") ??
    board.querySelector(".excalidraw")
  );
}

/** Overlay (0,0) = canvas viewport origin, not board / left toolbar / top menu. */
export function canvasOriginInBoard(board: RectLike, canvas: RectLike): OriginBox {
  const boardRect = board.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  return {
    left: canvasRect.left - boardRect.left,
    top: canvasRect.top - boardRect.top,
    width: canvasRect.width,
    height: canvasRect.height,
  };
}
