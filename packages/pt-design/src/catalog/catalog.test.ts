import { describe, expect, test } from "bun:test";
import { catalogIdToXmlTag, xmlTagToCatalogId } from "../protocol";
import { getComponentModule, listComponentTypes } from "../components/registry";
import { catalogIconTypes, catalogVariantIconName, catalogVariantIconTypes } from "../embed/catalog-icons";
import { CHART_GROUPS, CHART_IDS, CHART_META, chartVariantLabel } from "./chart-list";
import { COMPONENT_PALETTE_IDS, REQUIRED_BLOCKS, SHADCN_BASIC_IDS } from "./shadcn-list";
import { CATALOG_VARIANT_MAP } from "./variants";

describe("S5 catalog completeness", () => {
  test("every pinned basic id, required block, and chart has a registry module", () => {
    const listed = listComponentTypes();
    expect(SHADCN_BASIC_IDS.filter((id) => !listed.includes(id))).toEqual([]);
    expect(REQUIRED_BLOCKS.filter((id) => !listed.includes(id))).toEqual([]);
    expect(CHART_IDS.filter((id) => !listed.includes(id))).toEqual([]);
    for (const id of [...SHADCN_BASIC_IDS, ...REQUIRED_BLOCKS, ...CHART_IDS]) {
      const mod = getComponentModule(id);
      expect(mod.type).toBe(id);
      expect(typeof mod.Renderer).toBe("function");
      const node = mod.defaultNode("n");
      expect(node.type).toBe(id);
    }
  });

  test("Component palette hides the chart stub; Charts catalog owns the 70 gallery ids", () => {
    expect(COMPONENT_PALETTE_IDS).not.toContain("chart");
    expect(COMPONENT_PALETTE_IDS.some((id) => id.startsWith("chart."))).toBe(false);
    expect(CHART_IDS).toHaveLength(70);
    expect(new Set(CHART_IDS).size).toBe(70);
    expect(CHART_META.map((meta) => meta.id)).toEqual([...CHART_IDS]);
    expect(CHART_GROUPS.map((group) => group.label)).toEqual([
      "Area Charts",
      "Bar Charts",
      "Line Charts",
      "Pie Charts",
      "Radar Charts",
      "Radial Charts",
      "Tooltips",
    ]);
    expect(CHART_GROUPS.flatMap((group) => group.ids)).toEqual([...CHART_IDS]);
    expect(chartVariantLabel("chart.area-default")).toBe("Default");
    expect(chartVariantLabel("chart.area-linear")).toBe("Linear");
    expect(chartVariantLabel("chart.area-stacked-expand")).toBe("Stacked expand");
    expect(catalogIdToXmlTag("chart")).toBe("chart");
    expect(catalogIdToXmlTag("chart.area-default")).toBe("chart-area-default");
    expect(xmlTagToCatalogId("chart")).toBe("chart");
    expect(xmlTagToCatalogId("chart-area-default")).toBe("chart.area-default");
  });

  test("official extras stay registered", () => {
    const types = new Set(listComponentTypes());
    for (const id of ["attachment", "bubble", "marker", "message", "message-scroller", "questionnaire"]) {
      expect(types.has(id)).toBe(true);
    }
  });

  test("sidebar icons cover the frozen catalog ids", () => {
    const iconTypes = new Set(catalogIconTypes());
    for (const id of [...SHADCN_BASIC_IDS, ...REQUIRED_BLOCKS, ...CHART_IDS]) {
      expect(iconTypes.has(id)).toBe(true);
    }
  });

  test("every catalog variant has a distinct icon mapping", () => {
    const names = catalogVariantIconTypes();
    expect(names).toContain("all");
    expect(names).toContain("trigger");
    expect(names).toContain("image");
    expect(new Set(names.map((name) => catalogVariantIconName(name))).size).toBe(names.length);
  });

  test("variant map keys stay inside the frozen catalog", () => {
    const types = new Set<string>(listComponentTypes());
    for (const type of Object.keys(CATALOG_VARIANT_MAP)) {
      expect(types.has(type)).toBe(true);
    }
  });
});
