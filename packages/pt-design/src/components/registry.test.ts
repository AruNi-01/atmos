import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHART_IDS } from "../catalog/chart-list";
import { REQUIRED_BLOCKS, SHADCN_BASIC_IDS } from "../catalog/shadcn-list";
import { parsePtx, PtDesignError, serializePtx } from "../protocol";
import {
  defaultNodeFor,
  getComponentModule,
  listComponentTypes,
  PT_COMPONENT_MODULES,
} from "./index";

const EXPECTED_TYPES = [...SHADCN_BASIC_IDS, ...REQUIRED_BLOCKS, ...CHART_IDS];

describe("PT_COMPONENT_MODULES", () => {
  test("has unique types covering SHADCN_BASIC_IDS, REQUIRED_BLOCKS, and CHART_IDS", () => {
    const types = PT_COMPONENT_MODULES.map((mod) => mod.type);
    expect(types).toHaveLength(SHADCN_BASIC_IDS.length + REQUIRED_BLOCKS.length + CHART_IDS.length);
    expect(new Set(types).size).toBe(types.length);
    expect(PT_COMPONENT_MODULES).toHaveLength(EXPECTED_TYPES.length);
  });
});

describe("listComponentTypes", () => {
  test("returns SHADCN_BASIC_IDS then REQUIRED_BLOCKS then CHART_IDS", () => {
    expect(listComponentTypes()).toEqual(EXPECTED_TYPES);
  });

  test("S5 every frozen id has a real Renderer, defaultNode, and parsePtx-round-trippable node", () => {
    for (const id of listComponentTypes()) {
      const mod = getComponentModule(id);
      expect(mod.type).toBe(id);
      expect(typeof mod.Renderer).toBe("function");
      expect(typeof mod.defaultNode).toBe("function");
      const node = defaultNodeFor(id, "n");
      expect(node.type).toBe(id);
      expect(node.id).toBe("n");
      const xml = serializePtx({ version: "ptx/1", pages: [{ id: "p", nodes: [node] }] });
      const doc = parsePtx(xml);
      expect(doc.pages[0]?.nodes[0]?.type).toBe(id);
      expect(doc.pages[0]?.nodes[0]?.id).toBe("n");
    }
  });
});

describe("S14 palette vs Agent XML", () => {
  test("defaultNode(button) serializes to the same tag, bbox, and events as xmlExample (ignore id)", () => {
    const palette = defaultNodeFor("button", "palette-id");
    const example = parsePtx(
      `<page id="p">${getComponentModule("button").xmlExample}</page>`,
    ).pages[0]!.nodes[0]!;
    expect(palette.type).toBe(example.type);
    expect(palette.width).toBe(example.width);
    expect(palette.height).toBe(example.height);
    expect(palette.x).toBe(example.x);
    expect(palette.y).toBe(example.y);
    expect(palette.events).toBeUndefined();
    expect(example.events).toBeUndefined();
    expect(palette.events).toEqual(example.events);
    const palXml = serializePtx({
      version: "ptx/1",
      pages: [{ id: "p", nodes: [{ ...palette, id: "x" }] }],
    });
    const agentXml = serializePtx({
      version: "ptx/1",
      pages: [{ id: "p", nodes: [{ ...example, id: "x", props: palette.props }] }],
    });
    expect(palXml).toBe(agentXml);
    expect(palXml).toContain("<button ");
    expect(palXml).not.toContain("<on ");
  });
});

describe("getComponentModule", () => {
  test("unknown type throws PtDesignError unknown_type", () => {
    try {
      getComponentModule("not-a-type");
    } catch (error) {
      expect(error).toBeInstanceOf(PtDesignError);
      expect((error as PtDesignError).code).toBe("unknown_type");
      return;
    }
    throw new Error("expected PtDesignError unknown_type");
  });
});

describe("registry sources", () => {
  test("do not import @excalidraw/excalidraw", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of ["registry.ts", "index.ts", "types.ts"]) {
      const text = readFileSync(join(dir, name), "utf8");
      expect(text).not.toContain("@excalidraw/excalidraw");
    }
  });
});
