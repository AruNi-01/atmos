"use client";

import React from "react";
import { catalogDisplayName } from "../catalog/labels";
import type { CatalogEntry } from "../catalog/registry";
import { CatalogTypeIcon } from "./catalog-icons";
import { MotionSlideMenu, type MotionSlideMenuItem } from "./motion-slide-menu";

export function ComponentCatalog({
  items,
  onPlace,
}: {
  items: CatalogEntry[];
  activeType: string;
  onPlace: (componentType: string, variant?: string) => void;
}) {
  const menuItems = React.useMemo(() => buildCatalogMenuItems(items, onPlace), [items, onPlace]);
  return (
    <div data-testid="pt-design-catalog" style={{ height: "100%", minHeight: 0, padding: "4px 4px 12px" }}>
      <MotionSlideMenu items={menuItems} rootLabel="Components" maxHeight="100%" />
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
        icon,
        onSelect: () => onPlace(item.componentType),
      },
      ...variants.map((variant) => ({
        id: `${item.componentType}::${variant}`,
        label: catalogDisplayName(variant),
        icon,
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
