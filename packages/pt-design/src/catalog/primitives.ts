import { createId } from "../core/ids";
import type { PtElement } from "../core/types";

/** Excalidraw "artist" sloppiness — the 艺术 line style. */
export const ARTISTIC_ROUGHNESS = 1;

/** Excalidraw Helvetica (local system font). Virgil / Excalifont need downloaded faces. */
export const FONT_HELVETICA = 2;
export const FONT_VIRGIL = 1;
export const DEFAULT_FONT_SIZE = 13;
export const DEFAULT_LINE_HEIGHT = 1.25;

export function textLineHeight(
  fontSize = DEFAULT_FONT_SIZE,
  lineHeight = DEFAULT_LINE_HEIGHT,
): number {
  return Math.round(fontSize * lineHeight);
}

/**
 * Unbound Excalidraw text paints from the top of its box. Shrink a too-tall
 * middle-aligned single line so the glyph sits in the control, not the cap.
 */
export function layoutUnboundText(el: {
  y: number;
  height: number;
  text?: string;
  fontSize?: number;
  lineHeight?: number;
  verticalAlign?: "top" | "middle";
  containerId?: string | null;
}): { y: number; height: number } {
  if (el.containerId || el.verticalAlign === "top" || (el.text ?? "").includes("\n")) {
    return { y: el.y, height: el.height };
  }
  const lineH = textLineHeight(el.fontSize ?? DEFAULT_FONT_SIZE, el.lineHeight ?? DEFAULT_LINE_HEIGHT);
  if (el.height <= lineH + 1) return { y: el.y, height: el.height };
  return { y: el.y + (el.height - lineH) / 2, height: lineH };
}

export const C = {
  stroke: "#18181b",
  mutedStroke: "#a1a1aa",
  fill: "#ffffff",
  muted: "#f4f4f5",
  primary: "#18181b",
  primaryFg: "#fafafa",
  accent: "#3b82f6",
  destructive: "#ef4444",
  destructiveFg: "#fff1f2",
  secondary: "#e4e4e7",
  text: "#18181b",
  mutedText: "#71717a",
  outline: "#d4d4d8",
};

function base(
  partial: Pick<PtElement, "id" | "type" | "x" | "y" | "width" | "height"> &
    Partial<PtElement>,
): PtElement {
  return {
    angle: 0,
    strokeColor: C.stroke,
    backgroundColor: C.fill,
    fillStyle: "solid",
    strokeWidth: 1,
    roughness: ARTISTIC_ROUGHNESS,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 3 },
    seed: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    locked: false,
    ...partial,
  };
}

export function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<PtElement> = {},
): PtElement {
  return base({
    id: extra.id ?? createId("rect"),
    type: "rectangle",
    x,
    y,
    width: w,
    height: h,
    ...extra,
  });
}

export function ellipse(
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<PtElement> = {},
): PtElement {
  return base({
    id: extra.id ?? createId("ell"),
    type: "ellipse",
    x,
    y,
    width: w,
    height: h,
    ...extra,
  });
}

export function textEl(
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  extra: Partial<PtElement> = {},
): PtElement {
  const {
    y: _ignoredY,
    height: _ignoredH,
    fontSize: extraFontSize,
    lineHeight: extraLineHeight,
    verticalAlign: extraAlign,
    ...rest
  } = extra;
  const fontSize = extraFontSize ?? DEFAULT_FONT_SIZE;
  const lineHeight = extraLineHeight ?? DEFAULT_LINE_HEIGHT;
  const verticalAlign = extraAlign ?? "middle";
  const laidOut = layoutUnboundText({
    y,
    height: h,
    text,
    fontSize,
    lineHeight,
    verticalAlign,
    containerId: extra.containerId ?? null,
  });
  return base({
    id: extra.id ?? createId("txt"),
    type: "text",
    x,
    width: w,
    text,
    originalText: text,
    fontFamily: extra.fontFamily ?? FONT_HELVETICA,
    textAlign: extra.textAlign ?? "left",
    autoResize: extra.autoResize ?? false,
    containerId: extra.containerId ?? null,
    strokeColor: extra.strokeColor ?? C.text,
    backgroundColor: "transparent",
    strokeWidth: 0,
    roundness: null,
    ...rest,
    y: laidOut.y,
    height: laidOut.height,
    fontSize,
    lineHeight,
    verticalAlign,
  });
}

export function lineEl(
  x: number,
  y: number,
  w: number,
  extra: Partial<PtElement> = {},
): PtElement {
  return base({
    id: extra.id ?? createId("ln"),
    type: "line",
    x,
    y,
    width: w,
    height: 0,
    points: [
      [0, 0],
      [w, 0],
    ],
    backgroundColor: "transparent",
    ...extra,
  });
}

export function frameEl(
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  extra: Partial<PtElement> = {},
): PtElement {
  return base({
    id: extra.id ?? createId("frame"),
    type: "frame",
    x,
    y,
    width: w,
    height: h,
    name,
    backgroundColor: "transparent",
    strokeColor: C.mutedStroke,
    ...extra,
  });
}

export function groupElements(
  elements: PtElement[],
  groupId = createId("g"),
): PtElement[] {
  return elements.map((el) => ({
    ...el,
    groupIds: el.groupIds.includes(groupId) ? el.groupIds : [...el.groupIds, groupId],
  }));
}
