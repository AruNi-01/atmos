import { createId } from "../core/ids";
import type { PtElement } from "../core/types";

/** Excalidraw "artist" sloppiness — the 艺术 line style. */
export const ARTISTIC_ROUGHNESS = 1;

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
  return base({
    id: extra.id ?? createId("txt"),
    type: "text",
    x,
    y,
    width: w,
    height: h,
    text,
    originalText: text,
    fontSize: extra.fontSize ?? 13,
    fontFamily: 1,
    textAlign: extra.textAlign ?? "left",
    verticalAlign: extra.verticalAlign ?? "middle",
    strokeColor: extra.strokeColor ?? C.text,
    backgroundColor: "transparent",
    strokeWidth: 0,
    roundness: null,
    ...extra,
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
