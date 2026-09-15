"use client";

import { Search, X } from "lucide-react";
import { type ReactElement, useMemo, useState } from "react";
import { CHART_GROUPS, chartVariantLabel } from "../catalog/chart-list";
import { catalogVariantsFor } from "../catalog/variants";
import { listComponentTypes } from "../components/registry";
import { CatalogTypeIcon, CatalogVariantIcon } from "../embed/catalog-icons";
import type { PtNodeType } from "../protocol";
import { MotionSlideMenu, type MotionSlideMenuItem } from "./motion-slide-menu";

export type PaletteMenuGroup = {
  id: string;
  label: string;
  iconType: PtNodeType;
  items: readonly { type: PtNodeType; label: string }[];
};

export type PaletteProps = {
  onInsert: (type: PtNodeType, variant?: string) => void;
  types?: readonly PtNodeType[];
  groups?: readonly PaletteMenuGroup[];
  rootLabel?: string;
};

export type PaletteSearchGroup = {
  type: PtNodeType;
  parentMatched: boolean;
  variants: readonly string[];
  label?: string;
};

const ROW_CLASS = "pt-design-catalog-row";

export function catalogLabel(type: string): string {
  const raw = type.startsWith("block.")
    ? type.slice("block.".length)
    : type.startsWith("chart.")
      ? type.slice("chart.".length)
      : type;
  const parts = raw.split(/[-_.]/).filter(Boolean);
  if (parts.length === 0) return type;
  return parts
    .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function normalizeCatalogQuery(query: string): string {
  return query.toLowerCase().replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim();
}

function textMatches(haystack: string, needle: string): boolean {
  return normalizeCatalogQuery(haystack).includes(needle);
}

export function searchPaletteEntries(
  types: readonly PtNodeType[],
  query: string,
): PaletteSearchGroup[] {
  const needle = normalizeCatalogQuery(query);
  if (!needle) return [];
  const groups: PaletteSearchGroup[] = [];
  for (const type of types) {
    const variants = catalogVariantsFor(type);
    const parentMatched = textMatches(catalogLabel(type), needle) || textMatches(type, needle);
    const matchedVariants = variants.filter(
      (variant) =>
        textMatches(variant, needle) ||
        textMatches(catalogLabel(variant), needle) ||
        textMatches(`${catalogLabel(type)} ${catalogLabel(variant)}`, needle),
    );
    if (parentMatched) {
      groups.push({ type, parentMatched: true, variants });
    } else if (matchedVariants.length > 0) {
      groups.push({ type, parentMatched: false, variants: matchedVariants });
    }
  }
  return groups;
}

export function buildPaletteMenuItems(
  types: readonly PtNodeType[],
  onInsert: (type: PtNodeType, variant?: string) => void,
): MotionSlideMenuItem[] {
  return types.map((type) => typeToItem(type, onInsert));
}

export function buildChartPaletteGroups(): PaletteMenuGroup[] {
  return CHART_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    iconType: group.ids[0]!,
    items: group.ids.map((id) => ({ type: id, label: chartVariantLabel(id) })),
  }));
}

export function buildGroupedMenuItems(
  groups: readonly PaletteMenuGroup[],
  onInsert: (type: PtNodeType, variant?: string) => void,
): MotionSlideMenuItem[] {
  return groups.map((group) => ({
    id: group.id,
    label: group.label,
    icon: <CatalogTypeIcon componentType={group.iconType} size={18} />,
    children: group.items.map((item) => ({
      id: item.type,
      label: item.label,
      icon: <CatalogTypeIcon componentType={item.type} size={18} />,
      insertType: item.type,
      onSelect: () => onInsert(item.type),
    })),
  }));
}

export function searchGroupedPaletteEntries(
  groups: readonly PaletteMenuGroup[],
  query: string,
): PaletteSearchGroup[] {
  const needle = normalizeCatalogQuery(query);
  if (!needle) return [];
  const hits: PaletteSearchGroup[] = [];
  for (const group of groups) {
    const groupMatched = textMatches(group.label, needle) || textMatches(group.id, needle);
    for (const item of group.items) {
      const itemMatched =
        textMatches(item.label, needle) ||
        textMatches(item.type, needle) ||
        textMatches(catalogLabel(item.type), needle);
      if (groupMatched || itemMatched) {
        hits.push({
          type: item.type,
          parentMatched: true,
          variants: [],
          label: item.label,
        });
      }
    }
  }
  return hits;
}

function typeToItem(
  type: PtNodeType,
  onInsert: (type: PtNodeType, variant?: string) => void,
): MotionSlideMenuItem {
  const icon = <CatalogTypeIcon componentType={type} size={18} />;
  const variants = catalogVariantsFor(type);
  if (variants.length === 0) {
    return {
      id: type,
      label: catalogLabel(type),
      icon,
      insertType: type,
      onSelect: () => onInsert(type),
    };
  }
  return {
    id: type,
    label: catalogLabel(type),
    icon,
    children: [
      {
        id: `${type}::all`,
        label: "All",
        icon: <CatalogVariantIcon variant="all" size={18} />,
        insertType: type,
        onSelect: () => onInsert(type),
      },
      ...variants.map((variant) => ({
        id: `${type}::${variant}`,
        label: catalogLabel(variant),
        icon: <CatalogVariantIcon variant={variant} size={18} />,
        insertType: type,
        insertVariant: variant,
        onSelect: () => onInsert(type, variant),
      })),
    ],
  };
}

export function Palette({ onInsert, types, groups: menuGroups, rootLabel: rootLabelProp }: PaletteProps): ReactElement {
  const list = types ?? (menuGroups ? menuGroups.flatMap((group) => group.items.map((item) => item.type)) : listComponentTypes());
  const [query, setQuery] = useState("");
  const menuItems = useMemo(
    () => (menuGroups ? buildGroupedMenuItems(menuGroups, onInsert) : buildPaletteMenuItems(list, onInsert)),
    [list, menuGroups, onInsert],
  );
  const groups = useMemo(
    () => (menuGroups ? searchGroupedPaletteEntries(menuGroups, query) : searchPaletteEntries(list, query)),
    [list, menuGroups, query],
  );
  const searching = query.trim().length > 0;
  const rootLabel =
    rootLabelProp ??
    (menuGroups
      ? "Charts"
      : list.every((type) => type.startsWith("block."))
        ? "Blocks"
        : "Components");

  return (
    <div data-pt-palette="" data-testid="pt-design-catalog">
      <CatalogSearchField value={query} onChange={setQuery} />
      {searching ? (
        <CatalogSearchResults groups={groups} onInsert={onInsert} />
      ) : (
        <div className="pt-design-catalog-menu">
          <MotionSlideMenu
            items={menuItems}
            rootLabel={rootLabel}
            itemClassName={ROW_CLASS}
            maxHeight="100%"
          />
        </div>
      )}
    </div>
  );
}

function CatalogSearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="pt-design-catalog-search-wrap">
      <Search size={16} strokeWidth={2} aria-hidden style={{ opacity: 0.55, flexShrink: 0 }} />
      <input
        className="pt-design-catalog-search"
        data-testid="pt-design-catalog-search"
        value={value}
        placeholder="Search"
        aria-label="Search"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
      />
      {value ? (
        <button
          type="button"
          data-testid="pt-design-catalog-search-clear"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <X size={14} strokeWidth={2} />
        </button>
      ) : null}
    </label>
  );
}

function CatalogSearchResults({
  groups,
  onInsert,
}: {
  groups: PaletteSearchGroup[];
  onInsert: (type: PtNodeType, variant?: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <div data-testid="pt-design-catalog-empty" className="pt-design-catalog-empty">
        No matches
      </div>
    );
  }
  return (
    <div role="list" data-testid="pt-design-catalog-search-results" className="pt-design-catalog-results">
      {groups.map((group) => {
        const headerClickable = group.parentMatched || group.variants.length === 0;
        return (
          <div key={group.type}>
            <button
              type="button"
              role="listitem"
              className={ROW_CLASS}
              data-menu-id={group.type}
              data-pt-insert={headerClickable ? group.type : undefined}
              disabled={!headerClickable}
              onClick={() => {
                if (headerClickable) onInsert(group.type);
              }}
              style={{ fontWeight: 600 }}
            >
              <span className="pt-design-catalog-row__icon">
                <CatalogTypeIcon componentType={group.type} size={18} />
              </span>
              <span className="pt-design-catalog-row__label">{group.label ?? catalogLabel(group.type)}</span>
            </button>
            {group.variants.map((variant) => (
              <button
                key={`${group.type}::${variant}`}
                type="button"
                role="listitem"
                className={`${ROW_CLASS} pt-design-catalog-row--nested`}
                data-menu-id={`${group.type}::${variant}`}
                data-pt-insert={group.type}
                data-pt-variant={variant}
                onClick={() => onInsert(group.type, variant)}
              >
                <span className="pt-design-catalog-row__icon">
                  <CatalogVariantIcon variant={variant} size={18} />
                </span>
                <span className="pt-design-catalog-row__label">{catalogLabel(variant)}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
