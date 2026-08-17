"use client";

import { Search, X } from "lucide-react";
import React from "react";
import { catalogDisplayName } from "../catalog/labels";
import type { CatalogEntry } from "../catalog/registry";
import { CatalogTypeIcon, CatalogVariantIcon } from "./catalog-icons";
import { MotionSlideMenu, type MotionSlideMenuItem } from "./motion-slide-menu";

export type CatalogSearchGroup = {
  entry: CatalogEntry;
  parentMatched: boolean;
  variants: string[];
};

export function ComponentCatalog({
  items,
  kind = "basic",
  onPlace,
}: {
  items: CatalogEntry[];
  kind?: CatalogEntry["kind"];
  activeType: string;
  onPlace: (componentType: string, variant?: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const visible = React.useMemo(
    () => items.filter((item) => item.kind === kind),
    [items, kind],
  );
  const menuItems = React.useMemo(() => buildCatalogMenuItems(visible, onPlace), [visible, onPlace]);
  const groups = React.useMemo(() => searchCatalogEntries(visible, query), [visible, query]);
  const searching = query.trim().length > 0;

  return (
    <div
      data-testid="pt-design-catalog"
      data-kind={kind}
      style={{
        height: "100%",
        minHeight: 0,
        padding: "4px 4px 12px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <CatalogSearchField value={query} onChange={setQuery} />
      {searching ? (
        <CatalogSearchResults groups={groups} onPlace={onPlace} />
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <MotionSlideMenu
            items={menuItems}
            rootLabel={kind === "block" ? "Blocks" : "Components"}
            maxHeight="100%"
          />
        </div>
      )}
    </div>
  );
}

export function buildCatalogMenuItems(
  items: CatalogEntry[],
  onPlace: (componentType: string, variant?: string) => void,
): MotionSlideMenuItem[] {
  return items.map((item) => entryToItem(item, onPlace));
}

function entryToItem(
  item: CatalogEntry,
  onPlace: (componentType: string, variant?: string) => void,
): MotionSlideMenuItem {
  const icon = <CatalogTypeIcon componentType={item.componentType} />;
  const variants = visibleVariants(item.variants);
  if (variants.length === 0) {
    return {
      id: item.componentType,
      label: item.label,
      icon,
      onSelect: () => onPlace(item.componentType),
    };
  }
  return {
    id: item.componentType,
    label: item.label,
    icon,
    children: [
      {
        id: `${item.componentType}::all`,
        label: "All",
        icon: <CatalogVariantIcon variant="all" />,
        onSelect: () => onPlace(item.componentType),
      },
      ...variants.map((variant) => ({
        id: `${item.componentType}::${variant}`,
        label: catalogDisplayName(variant),
        icon: <CatalogVariantIcon variant={variant} />,
        onSelect: () => onPlace(item.componentType, variant),
      })),
    ],
  };
}

function visibleVariants(variants: string[]): string[] {
  const meaningful = variants.filter((variant) => variant !== "default");
  if (meaningful.length === 0) return [];
  return variants;
}

export function normalizeCatalogQuery(query: string): string {
  return query.toLowerCase().replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim();
}

function textMatches(haystack: string, needle: string): boolean {
  return normalizeCatalogQuery(haystack).includes(needle);
}

export function searchCatalogEntries(items: CatalogEntry[], query: string): CatalogSearchGroup[] {
  const needle = normalizeCatalogQuery(query);
  if (!needle) return [];
  const groups: CatalogSearchGroup[] = [];
  for (const entry of items) {
    const parentMatched =
      textMatches(entry.label, needle) || textMatches(entry.componentType, needle);
    const variants = visibleVariants(entry.variants).filter(
      (variant) =>
        textMatches(variant, needle) ||
        textMatches(catalogDisplayName(variant), needle) ||
        textMatches(`${entry.label} ${catalogDisplayName(variant)}`, needle),
    );
    if (parentMatched) {
      groups.push({ entry, parentMatched: true, variants: visibleVariants(entry.variants) });
    } else if (variants.length > 0) {
      groups.push({ entry, parentMatched: false, variants });
    }
  }
  return groups;
}

function CatalogSearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
        margin: "0 4px 8px",
        padding: "0 8px",
        height: 32,
        borderRadius: 8,
        background: "var(--muted, var(--color-surface-high))",
        color: "inherit",
      }}
    >
      <Search size={14} strokeWidth={2} aria-hidden style={{ opacity: 0.55, flexShrink: 0 }} />
      <input
        className="pt-design-catalog-search"
        data-testid="pt-design-catalog-search"
        value={value}
        placeholder="Search"
        aria-label="Search"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          border: "none",
          outline: "none",
          boxShadow: "none",
          background: "transparent",
          color: "inherit",
          fontSize: 12,
        }}
      />
      {value ? (
        <button
          type="button"
          data-testid="pt-design-catalog-search-clear"
          aria-label="Clear search"
          onClick={() => onChange("")}
          style={{
            display: "inline-flex",
            width: 18,
            height: 18,
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            borderRadius: 4,
            padding: 0,
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
            opacity: 0.6,
          }}
        >
          <X size={12} strokeWidth={2} />
        </button>
      ) : null}
    </label>
  );
}

function CatalogSearchResults({
  groups,
  onPlace,
}: {
  groups: CatalogSearchGroup[];
  onPlace: (componentType: string, variant?: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <div
        data-testid="pt-design-catalog-empty"
        style={{ padding: "12px 8px", fontSize: 12, lineHeight: "18px", opacity: 0.55 }}
      >
        No matches
      </div>
    );
  }
  return (
    <div
      role="list"
      data-testid="pt-design-catalog-search-results"
      style={{ overflow: "auto", flex: 1, minHeight: 0 }}
    >
      {groups.map((group) => {
        const type = group.entry.componentType;
        const headerClickable = group.parentMatched || group.variants.length === 0;
        return (
          <div key={type}>
            <button
              type="button"
              role="listitem"
              data-menu-id={type}
              disabled={!headerClickable}
              onClick={() => {
                if (headerClickable) onPlace(type);
              }}
              style={{
                ...searchRowStyle,
                fontWeight: 600,
                cursor: headerClickable ? "pointer" : "default",
                opacity: 1,
              }}
            >
              <span style={{ display: "inline-flex", width: 16, height: 16, flexShrink: 0 }}>
                <CatalogTypeIcon componentType={type} />
              </span>
              <span style={{ flex: 1, textAlign: "left" }}>{group.entry.label}</span>
            </button>
            {group.variants.map((variant) => (
              <button
                key={`${type}::${variant}`}
                type="button"
                role="listitem"
                data-menu-id={`${type}::${variant}`}
                onClick={() => onPlace(type, variant)}
                style={{ ...searchRowStyle, paddingLeft: 24 }}
              >
                <span style={{ display: "inline-flex", width: 16, height: 16, flexShrink: 0 }}>
                  <CatalogVariantIcon variant={variant} />
                </span>
                <span style={{ flex: 1, textAlign: "left" }}>{catalogDisplayName(variant)}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

const searchRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  textAlign: "left",
  fontSize: 12,
  lineHeight: "18px",
  padding: "6px 8px",
  marginBottom: 2,
  border: "none",
  borderRadius: 8,
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
};
