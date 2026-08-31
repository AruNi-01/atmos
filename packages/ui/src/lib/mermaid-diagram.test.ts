import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  estimateMermaidPlaceholderHeight,
  isElementIntersectingScrollParent,
  isPlausibleMermaidSvgSize,
  MERMAID_RENDERING_LABEL,
  mermaidDiagramCacheKey,
  parseMermaidSvgSize,
} from "./mermaid-diagram";

describe("parseMermaidSvgSize", () => {
  test("reads viewBox width and height", () => {
    expect(parseMermaidSvgSize(
      '<svg viewBox="0 0 847.22 2341.37" width="100%" xmlns="http://www.w3.org/2000/svg"></svg>',
    )).toEqual({ width: 847.22, height: 2341.37 });
  });

  test("falls back to width and height attributes", () => {
    expect(parseMermaidSvgSize(
      '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"></svg>',
    )).toEqual({ width: 640, height: 480 });
  });
});

describe("isPlausibleMermaidSvgSize", () => {
  test("accepts ordinary diagram bounds", () => {
    expect(isPlausibleMermaidSvgSize(847.22, 2341.37)).toBe(true);
    expect(isPlausibleMermaidSvgSize(640, 480)).toBe(true);
  });

  test("rejects hairline worker output that collapses in preview", () => {
    expect(isPlausibleMermaidSvgSize(34760, 32)).toBe(false);
    expect(isPlausibleMermaidSvgSize(800, 1)).toBe(false);
    expect(isPlausibleMermaidSvgSize(0, 240)).toBe(false);
  });
});

describe("estimateMermaidPlaceholderHeight", () => {
  test("grows with source lines and stays capped", () => {
    expect(estimateMermaidPlaceholderHeight("graph TD\nA-->B")).toBeGreaterThanOrEqual(160);
    expect(estimateMermaidPlaceholderHeight(Array.from({ length: 80 }, () => "A-->B").join("\n"))).toBe(640);
  });
});

describe("mermaidDiagramCacheKey", () => {
  test("keeps light and dark renders distinct", () => {
    expect(mermaidDiagramCacheKey("graph TD", "dark")).not.toBe(mermaidDiagramCacheKey("graph TD", "light"));
  });
});

describe("isElementIntersectingScrollParent", () => {
  test("returns false without a node", () => {
    expect(isElementIntersectingScrollParent(null)).toBe(false);
  });
});

describe("MERMAID_RENDERING_LABEL", () => {
  test("uses sentence-case loading copy", () => {
    expect(MERMAID_RENDERING_LABEL).toBe("Rendering...");
  });
});

describe("waitForMermaidSlotReady", () => {
  test("keeps waiting until the slot is visible instead of rendering offscreen", () => {
    const source = readFileSync(new URL("./mermaid-diagram.ts", import.meta.url), "utf8");
    expect(source).not.toContain("attempt < 8");
    expect(source).toContain("isPlausibleMermaidSvgSize");
    expect(source).toContain("Promise<boolean>");
  });
});
