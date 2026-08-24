import { catalogDisplayName } from "../catalog/labels";
import type { CatalogEntry } from "../catalog/registry";
import type { PtMeta, PtSize } from "../core/types";

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

const BOOLEAN_PROP_KEYS = new Set(["checked", "pressed"]);

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

export function selectionPropGroups(
  entry: CatalogEntry,
  meta: Partial<PtMeta> | undefined,
): SelectionPropGroup[] {
  const groups: SelectionPropGroup[] = [];
  if (entry.variants.length > 1) {
    const fallback = entry.variants[0]!;
    const value = meta?.variant && entry.variants.includes(meta.variant) ? meta.variant : fallback;
    groups.push({
      id: "variant",
      kind: "variant",
      label: "Variant",
      value,
      options: entry.variants.map((variant) => ({
        id: variant,
        label: catalogDisplayName(variant),
      })),
    });
  }

  const sizeOptions = entry.componentType === "typography" ? TYPOGRAPHY_SIZE_OPTIONS : SIZE_OPTIONS;
  groups.push({
    id: "size",
    kind: "size",
    label: "Size",
    value: normalizeSize(meta?.size, sizeOptions),
    options: sizeOptions,
  });

  const props = meta?.props ?? {};
  for (const key of entry.propKeys) {
    if (!BOOLEAN_PROP_KEYS.has(key)) continue;
    const on = props[key] === true || props[key] === "true";
    groups.push({
      id: `prop:${key}`,
      kind: "prop",
      label: catalogDisplayName(key),
      value: on ? "true" : "false",
      propKey: key,
      options: [
        { id: "false", label: "Off" },
        { id: "true", label: "On" },
      ],
    });
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

export function instanceIdFromBoardSelection(input: {
  elements: readonly { id: string; customData?: { pt?: { instanceId?: string } } }[];
  selectedIds: readonly string[];
  previousInstanceId: string | null;
}): string | null {
  const live = new Set(input.elements.map((el) => el.id));
  const fromSelection =
    input.elements.find((el) => input.selectedIds.includes(el.id) && el.customData?.pt?.instanceId)?.customData
      ?.pt?.instanceId ?? null;
  if (fromSelection) return fromSelection;
  if (input.selectedIds.some((id) => live.has(id))) return null;
  if (input.selectedIds.length === 0) return null;
  if (
    input.previousInstanceId &&
    input.elements.some((el) => el.customData?.pt?.instanceId === input.previousInstanceId)
  ) {
    return input.previousInstanceId;
  }
  return null;
}

function normalizeSize(size: PtSize | undefined, options: SelectionPropOption[]): string {
  if (size && options.some((opt) => opt.id === size)) return size;
  return "default";
}
