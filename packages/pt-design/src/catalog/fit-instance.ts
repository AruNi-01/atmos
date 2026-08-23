import type { PtElement } from "../core/types";

export type InstanceBox = { x: number; y: number; w: number; h: number };

/** Scale a template group from its natural box onto a target bbox. Origin is the instance root. */
export function fitInstanceElements(
  elements: readonly PtElement[],
  from: InstanceBox,
  to: InstanceBox,
): PtElement[] {
  const toW = Math.max(1, to.w);
  const toH = Math.max(1, to.h);
  const sx = from.w === 0 ? 1 : toW / from.w;
  const sy = from.h === 0 ? 1 : toH / from.h;
  const samePlace = from.x === to.x && from.y === to.y;
  const sameSize = Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6;
  if (samePlace && sameSize) return elements.slice();
  const fontScale = Math.min(sx, sy);
  return elements.map((el) => {
    const next: PtElement = {
      ...el,
      x: to.x + (el.x - from.x) * sx,
      y: to.y + (el.y - from.y) * sy,
      width: el.width * sx,
      height: el.height * sy,
    };
    if (el.points) {
      next.points = el.points.map(([px, py]) => [px * sx, py * sy]);
    }
    if (el.fontSize != null) {
      next.fontSize = Math.max(8, el.fontSize * fontScale);
    }
    return next;
  });
}
