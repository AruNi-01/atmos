import { describe, expect, test } from "bun:test";
import { REQUIRED_BLOCKS, SHADCN_BASIC_IDS } from "./shadcn-list";
import { listComponentTypes } from "../components/registry";
import { catalogIconTypes, catalogVariantIconName, catalogVariantIconTypes } from "../embed/catalog-icons";
import { CATALOG_VARIANT_MAP } from "./variants";

describe("S5 catalog completeness", () => {
  test("every pinned basic id and required block is in the component registry", () => {
    const types = new Set(listComponentTypes());
    expect(SHADCN_BASIC_IDS.filter((id) => !types.has(id))).toEqual([]);
    for (const id of REQUIRED_BLOCKS) {
      expect(types.has(id)).toBe(true);
    }
  });

  test("official extras stay registered", () => {
    const types = new Set(listComponentTypes());
    for (const id of ["attachment", "bubble", "marker", "message", "message-scroller", "questionnaire"]) {
      expect(types.has(id)).toBe(true);
    }
  });

  test("sidebar icons cover the frozen catalog ids", () => {
    const iconTypes = new Set(catalogIconTypes());
    for (const id of [...SHADCN_BASIC_IDS, ...REQUIRED_BLOCKS]) {
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
