"use client";

import React from "react";
import type { CatalogEntry } from "../catalog/registry";
import { CatalogTypeIcon } from "./catalog-icons";

export function ComponentCatalog({
  items,
  activeType,
  onPlace,
}: {
  items: CatalogEntry[];
  activeType: string;
  onPlace: (componentType: string) => void;
}) {
  const basics = items.filter((item) => item.kind === "basic");
  const blocks = items.filter((item) => item.kind === "block");
  return (
    <div data-testid="pt-design-catalog" style={{ padding: "8px 8px 16px", overflow: "auto", height: "100%" }}>
      <Section title="Components">
        {basics.map((item) => (
          <CatalogRow
            key={item.componentType}
            item={item}
            active={activeType === item.componentType}
            onPlace={onPlace}
          />
        ))}
      </Section>
      <Section title="Blocks">
        {blocks.map((item) => (
          <CatalogRow
            key={item.componentType}
            item={item}
            active={activeType === item.componentType}
            onPlace={onPlace}
          />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.02em",
          opacity: 0.65,
          padding: "8px 8px 6px",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function CatalogRow({
  item,
  active,
  onPlace,
}: {
  item: CatalogEntry;
  active: boolean;
  onPlace: (componentType: string) => void;
}) {
  return (
    <button
      type="button"
      data-catalog-type={item.componentType}
      onClick={() => onPlace(item.componentType)}
      style={{
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
        color: "inherit",
        background: active ? "var(--color-surface-high, rgba(127,127,127,0.16))" : "transparent",
        cursor: "pointer",
      }}
    >
      <span style={{ display: "inline-flex", width: 16, height: 16, flexShrink: 0, opacity: 0.9 }}>
        <CatalogTypeIcon componentType={item.componentType} />
      </span>
      <span>{item.label}</span>
    </button>
  );
}
