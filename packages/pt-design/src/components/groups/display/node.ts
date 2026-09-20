import type { CSSProperties } from "react";
import type { PtNode, PtNodeType, PtOption } from "../../../protocol";
import { SKETCH_FONT, SKETCH_INK, SKETCH_PAPER, SKETCH_RADIUS_CSS } from "../../sketch";

export type BBox = { width: number; height: number };

export function ptNode(
  id: string,
  type: PtNodeType,
  bbox: BBox,
  rest: {
    props?: PtNode["props"];
    value?: string;
    checked?: boolean;
    options?: PtOption[];
    events?: PtNode["events"];
    children?: PtNode[];
    x?: number;
    y?: number;
    rotation?: number;
  } = {},
): PtNode {
  const node: PtNode = {
    id,
    type,
    props: rest.props ?? {},
    x: rest.x ?? 0,
    y: rest.y ?? 0,
    width: bbox.width,
    height: bbox.height,
    rotation: rest.rotation ?? 0,
  };
  if (rest.value !== undefined) node.value = rest.value;
  if (rest.checked !== undefined) node.checked = rest.checked;
  if (rest.options !== undefined) node.options = rest.options;
  if (rest.events !== undefined) node.events = rest.events;
  if (rest.children !== undefined) node.children = rest.children;
  return node;
}

export const FONT = SKETCH_FONT;

export const T = {
  fg: SKETCH_INK,
  muted: "color-mix(in srgb, var(--pt-ink, #1e1e1e) 62%, transparent)",
  border: SKETCH_INK,
  bg: SKETCH_PAPER,
  mutedBg: "color-mix(in srgb, var(--pt-ink, #1e1e1e) 8%, var(--pt-paper, #fffef7))",
  primary: SKETCH_INK,
  primaryFg: SKETCH_PAPER,
  accent: SKETCH_INK,
  destructive: "#dc2626",
  destructiveBg: "color-mix(in srgb, #dc2626 12%, var(--pt-paper, #fffef7))",
  radius: SKETCH_RADIUS_CSS,
} as const;

export const FILL: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
};

export const LABEL_FIELD = [{ key: "label", kind: "text" as const }];
export const TITLE_FIELDS = [
  { key: "title", kind: "text" as const },
  { key: "description", kind: "text" as const },
];
export const COPY_FIELDS = [
  { key: "title", kind: "text" as const },
  { key: "description", kind: "text" as const },
  { key: "label", kind: "text" as const },
];
