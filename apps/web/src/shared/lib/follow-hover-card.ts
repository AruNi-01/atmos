export type FollowHoverPlacement = "top" | "bottom";
export type FollowHoverSide = FollowHoverPlacement | "auto";

export const FOLLOW_HOVER_VIEWPORT_PAD = 12;
export const FOLLOW_HOVER_GAP = 14;

export function readFollowHoverPointerOffset(
  clientX: number,
  clientY: number,
  rect: DOMRect | null,
): { nx: number; ny: number } {
  if (!rect) return { nx: 0, ny: 0 };
  const halfW = Math.max(rect.width / 2, 1);
  const halfH = Math.max(rect.height / 2, 1);
  const nx = ((clientX - rect.left - halfW) / halfW) * 20;
  const ny = ((clientY - rect.top - halfH) / halfH) * 20;
  return {
    nx: Math.max(-20, Math.min(20, nx)),
    ny: Math.max(-20, Math.min(20, ny)),
  };
}

export function resolveFollowHoverPlacement(
  preferred: FollowHoverSide,
  rect: DOMRect,
  cardApproxHeight: number,
  viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight,
): FollowHoverPlacement {
  const spaceTop = rect.top;
  const spaceBottom = viewportHeight - rect.bottom;
  const requiredSpace = cardApproxHeight + 24;
  if (preferred === "top") {
    return spaceTop >= requiredSpace || spaceTop >= spaceBottom ? "top" : "bottom";
  }
  if (preferred === "bottom") {
    return spaceBottom >= requiredSpace || spaceBottom >= spaceTop ? "bottom" : "top";
  }
  if (spaceTop >= requiredSpace) return "top";
  if (spaceBottom >= requiredSpace) return "bottom";
  return spaceTop >= spaceBottom ? "top" : "bottom";
}

export function computeFollowHoverOrigin(
  rect: DOMRect,
  placement: FollowHoverPlacement,
  gap = FOLLOW_HOVER_GAP,
): { left: number; top: number; transformOrigin: string } {
  if (placement === "bottom") {
    return {
      left: rect.left + rect.width / 2,
      top: rect.bottom + gap,
      transformOrigin: "top center",
    };
  }
  return {
    left: rect.left + rect.width / 2,
    top: rect.top - gap,
    transformOrigin: "bottom center",
  };
}

export function clampFollowHoverHorizontal(
  left: number,
  cardWidth: number,
  viewportWidth = typeof window === "undefined" ? cardWidth : window.innerWidth,
): number {
  const halfW = cardWidth / 2;
  return Math.min(
    Math.max(left, FOLLOW_HOVER_VIEWPORT_PAD + halfW),
    viewportWidth - FOLLOW_HOVER_VIEWPORT_PAD - halfW,
  );
}
