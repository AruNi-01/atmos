export const CENTER_STAGE_FULLSCREEN_MOTION_MS = 320;
export const CENTER_STAGE_FULLSCREEN_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
export const CENTER_STAGE_FULLSCREEN_Z_INDEX = 40;

/** In-flow placeholder so pinning the stage does not collapse the center column. */
export const CENTER_STAGE_FULLSCREEN_SLOT_ATTR = "data-center-stage-fullscreen-slot";
/** Present on the stage while it is pinned over the rest of the shell. */
export const CENTER_STAGE_FULLSCREEN_ATTR = "data-center-stage-fullscreen";

export type ViewportRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function readViewportRect(node: Pick<Element, "getBoundingClientRect">): ViewportRect {
  const rect = node.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function measureExpandedCenterStageRect(input: {
  panel?: ViewportRect | null;
  headerBottom?: number;
  viewportWidth: number;
  viewportHeight: number;
}): ViewportRect {
  if (input.panel && input.panel.width > 0 && input.panel.height > 0) {
    return input.panel;
  }
  const top = Math.max(0, input.headerBottom ?? 0);
  return {
    top,
    left: 0,
    width: Math.max(0, input.viewportWidth),
    height: Math.max(0, input.viewportHeight - top),
  };
}

export function describeRectGrowth(from: ViewportRect, to: ViewportRect) {
  const fromRight = from.left + from.width;
  const fromBottom = from.top + from.height;
  const toRight = to.left + to.width;
  const toBottom = to.top + to.height;
  const eps = 0.5;
  return {
    growsLeft: to.left < from.left - eps,
    growsRight: toRight > fromRight + eps,
    growsUp: to.top < from.top - eps,
    growsDown: toBottom > fromBottom + eps,
  };
}

export function centerStageFullscreenPinStyle(rect: ViewportRect): Record<string, string> {
  return {
    position: "fixed",
    zIndex: String(CENTER_STAGE_FULLSCREEN_Z_INDEX),
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    right: "auto",
    bottom: "auto",
    margin: "0px",
  };
}

const PIN_STYLE_KEYS = [
  "position",
  "zIndex",
  "top",
  "left",
  "width",
  "height",
  "right",
  "bottom",
  "margin",
  "transition",
] as const;

export function applyCenterStageFullscreenPin(
  element: HTMLElement,
  rect: ViewportRect,
  animate: boolean,
): void {
  Object.assign(element.style, centerStageFullscreenPinStyle(rect));
  element.style.transition = animate
    ? [
        `top ${CENTER_STAGE_FULLSCREEN_MOTION_MS}ms ${CENTER_STAGE_FULLSCREEN_EASE}`,
        `left ${CENTER_STAGE_FULLSCREEN_MOTION_MS}ms ${CENTER_STAGE_FULLSCREEN_EASE}`,
        `width ${CENTER_STAGE_FULLSCREEN_MOTION_MS}ms ${CENTER_STAGE_FULLSCREEN_EASE}`,
        `height ${CENTER_STAGE_FULLSCREEN_MOTION_MS}ms ${CENTER_STAGE_FULLSCREEN_EASE}`,
      ].join(", ")
    : "none";
}

export function clearCenterStageFullscreenPin(element: HTMLElement): void {
  for (const key of PIN_STYLE_KEYS) {
    element.style.removeProperty(key === "zIndex" ? "z-index" : key);
  }
}
