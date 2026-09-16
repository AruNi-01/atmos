import type { PtNode, PtNodeType } from "../../../protocol";

export function spatialNode(
  type: PtNodeType,
  id: string,
  bbox: { width: number; height: number },
  props: PtNode["props"],
  extra?: Partial<Pick<PtNode, "value" | "checked" | "options" | "children" | "events">>,
): PtNode {
  return {
    id,
    type,
    props,
    x: 0,
    y: 0,
    width: bbox.width,
    height: bbox.height,
    rotation: 0,
    ...extra,
  };
}

export function propString(node: PtNode, key: string, fallback: string): string {
  const value = node.props[key];
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

export const TEXT_FIELDS = [
  { key: "title", kind: "text" as const },
  { key: "description", kind: "text" as const },
  { key: "label", kind: "text" as const },
];

export const LABEL_FIELD = [{ key: "label", kind: "text" as const }];
