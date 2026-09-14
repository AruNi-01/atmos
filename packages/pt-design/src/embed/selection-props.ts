import { catalogVariantsFor } from "../catalog/variants";
import type { PtSize } from "../core/types";
import type { PtNode } from "../protocol";

export type SelectionPropKind = "variant" | "size" | "prop";

export type SelectionPropOption = {
  id: string;
  label: string;
};

export type SelectionPropGroup = {
  id: string;
  kind: SelectionPropKind;
  label: string;
  value: string;
  options: SelectionPropOption[];
  propKey?: string;
};

export type SelectionPropPatch =
  | { type: "variant"; variant: string }
  | { type: "size"; size: PtSize }
  | { type: "prop"; key: string; value: boolean };

export type RailPlacement = "side" | "bottom";

export type RailAnchor = {
  placement: RailPlacement;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
};

export type RailBox = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const SIZE_OPTIONS: SelectionPropOption[] = [
  { id: "sm", label: "S" },
  { id: "default", label: "M" },
  { id: "lg", label: "L" },
];

const TYPOGRAPHY_SIZE_OPTIONS: SelectionPropOption[] = [
  { id: "xs", label: "XS" },
  { id: "sm", label: "S" },
  { id: "default", label: "M" },
  { id: "lg", label: "L" },
  { id: "xl", label: "XL" },
];

export const STYLE_PANEL_SELECTOR = ".App-menu__left";
export const MOBILE_EXCALIDRAW_SELECTOR = ".excalidraw--mobile";
export const RAIL_GAP = 8;
export const FALLBACK_SIDE_TOP = 64;
export const FALLBACK_SIDE_LEFT = 220;
export const FALLBACK_MOBILE_RIGHT = 56;
export const FALLBACK_MOBILE_BOTTOM = 76;

export function selectionPropGroups(node: PtNode): SelectionPropGroup[] {
  const groups: SelectionPropGroup[] = [];
  const variants = catalogVariantsFor(node.type);
  if (variants.length > 1) {
    const fallback = variants[0]!;
    const raw = node.props.variant;
    const current = typeof raw === "string" ? raw : undefined;
    const value = current && variants.includes(current) ? current : fallback;
    groups.push({
      id: "variant",
      kind: "variant",
      label: "Variant",
      value,
      options: variants.map((variant) => ({
        id: variant,
        label: displayName(variant),
      })),
    });
  }

  const sizeOptions = node.type === "typography" ? TYPOGRAPHY_SIZE_OPTIONS : SIZE_OPTIONS;
  const rawSize = node.props.size;
  groups.push({
    id: "size",
    kind: "size",
    label: "Size",
    value: normalizeSize(typeof rawSize === "string" ? rawSize : undefined, sizeOptions),
    options: sizeOptions,
  });

  if (node.type === "checkbox" || node.type === "switch") {
    groups.push(booleanGroup("checked", "Checked", node.checked === true));
  } else if (node.type === "toggle") {
    groups.push(booleanGroup("pressed", "Pressed", node.checked === true));
  }

  return groups;
}

export function selectionPropPatch(group: SelectionPropGroup, optionId: string): SelectionPropPatch | null {
  if (group.kind === "variant") return { type: "variant", variant: optionId };
  if (group.kind === "size") return { type: "size", size: optionId };
  if (group.kind === "prop" && group.propKey) {
    return { type: "prop", key: group.propKey, value: optionId === "true" };
  }
  return null;
}

export function applySelectionNodePatch(node: PtNode, patch: SelectionPropPatch): PtNode {
  if (patch.type === "variant") {
    return { ...node, props: { ...node.props, variant: patch.variant } };
  }
  if (patch.type === "size") {
    return { ...node, props: { ...node.props, size: patch.size } };
  }
  if (patch.key === "checked" || patch.key === "pressed") {
    return { ...node, checked: patch.value };
  }
  return { ...node, props: { ...node.props, [patch.key]: patch.value } };
}

export function selectedNodeIdFromBoardSelection(input: {
  elements: readonly { id: string; isDeleted?: boolean; customData?: { pt?: { id?: string } } }[];
  selectedIds: readonly string[];
  previousNodeId: string | null;
}): string | null {
  const live = new Set(input.elements.filter((el) => !el.isDeleted).map((el) => el.id));
  const fromSelection =
    input.elements.find((el) => input.selectedIds.includes(el.id) && el.customData?.pt?.id)?.customData?.pt
      ?.id ?? null;
  if (fromSelection) return fromSelection;
  if (input.selectedIds.some((id) => live.has(id))) return null;
  if (input.selectedIds.length === 0) return null;
  if (
    input.previousNodeId &&
    input.elements.some((el) => !el.isDeleted && el.customData?.pt?.id === input.previousNodeId)
  ) {
    return input.previousNodeId;
  }
  return null;
}

export function railAnchorFromLayout(input: {
  host: RailBox;
  mobile: boolean;
  stylePanel: RailBox | null;
  colorTool: RailBox | null;
}): RailAnchor {
  if (input.mobile) {
    if (input.colorTool && input.colorTool.width >= 8 && input.colorTool.height >= 8) {
      return {
        placement: "bottom",
        right: Math.round(input.host.right - input.colorTool.left + RAIL_GAP),
        bottom: Math.round(input.host.bottom - input.colorTool.bottom),
      };
    }
    return {
      placement: "bottom",
      right: FALLBACK_MOBILE_RIGHT,
      bottom: FALLBACK_MOBILE_BOTTOM,
    };
  }
  if (input.stylePanel && input.stylePanel.width >= 8 && input.stylePanel.height >= 8) {
    return {
      placement: "side",
      top: Math.round(input.stylePanel.top - input.host.top + 10),
      left: Math.round(input.stylePanel.right - input.host.left + RAIL_GAP),
    };
  }
  return { placement: "side", top: FALLBACK_SIDE_TOP, left: FALLBACK_SIDE_LEFT };
}

function booleanGroup(key: string, label: string, on: boolean): SelectionPropGroup {
  return {
    id: `prop:${key}`,
    kind: "prop",
    label,
    value: on ? "true" : "false",
    propKey: key,
    options: [
      { id: "false", label: "Off" },
      { id: "true", label: "On" },
    ],
  };
}

function displayName(raw: string): string {
  const parts = raw.split(/[-_.]/).filter(Boolean);
  if (parts.length === 0) return raw;
  return parts
    .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function normalizeSize(size: string | undefined, options: SelectionPropOption[]): string {
  if (size && options.some((opt) => opt.id === size)) return size;
  return "default";
}
