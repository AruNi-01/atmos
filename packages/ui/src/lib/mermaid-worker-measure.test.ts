import { describe, expect, test } from "bun:test";
import {
  measureMermaidTextWidth,
  mermaidShimBBox,
  mermaidShimTextLength,
} from "./mermaid-worker-measure";

function tspan(
  text: string,
  attrs: Record<string, string> = {},
  children?: ReturnType<typeof tspan>[],
) {
  return {
    tagName: "tspan",
    textContent: text,
    childNodes: children?.length ? children : [{ nodeType: 3, data: text }],
    children: children ?? [],
    getAttribute: (name: string) => attrs[name] ?? null,
  };
}

describe("mermaidShimBBox", () => {
  test("does not treat stylesheet text as geometry", () => {
    const css = Array.from({ length: 4000 }, () => "a").join("");
    const svg = {
      tagName: "svg",
      textContent: css,
      children: [
        { tagName: "style", textContent: css, childNodes: [{ nodeType: 3, data: css }] },
        {
          tagName: "text",
          textContent: "Hello",
          childNodes: [{ nodeType: 3, data: "Hello" }],
        },
      ],
    };
    const box = mermaidShimBBox(svg);
    expect(box.width).toBeLessThan(200);
    expect(box.height).toBeGreaterThan(0);
    expect(box.height).toBeLessThan(64);
  });

  test("measures tspan from its own characters", () => {
    const tspan = {
      tagName: "tspan",
      textContent: "Node",
      childNodes: [{ nodeType: 3, data: "Node" }],
    };
    const box = mermaidShimBBox(tspan);
    expect(box.width).toBeGreaterThan(10);
    expect(box.width).toBeLessThan(120);
    expect(mermaidShimTextLength(tspan)).toBe(box.width);
  });

  test("ignores style tags and empty groups", () => {
    const group = {
      tagName: "g",
      textContent: "body{fill:red}",
      children: [{ tagName: "style", textContent: "body{fill:red}" }],
    };
    expect(mermaidShimBBox(group)).toMatchObject({ width: 0, height: 0 });
    expect(mermaidShimTextLength(group)).toBe(0);
  });

  test("applies child translate when unioning a parent bbox", () => {
    const rect = {
      tagName: "rect",
      getAttribute: (name: string) =>
        ({ width: "40", height: "20", x: "-20", y: "-10" }[name] ?? null),
    };
    const group = {
      tagName: "g",
      getAttribute: (name: string) => (name === "transform" ? "translate(200, 80)" : null),
      children: [rect],
    };
    const svg = {
      tagName: "svg",
      getAttribute: (name: string) => (name === "width" || name === "height" ? "100%" : null),
      children: [group],
    };
    const parent = mermaidShimBBox(svg);
    expect(parent.x).toBeCloseTo(180);
    expect(parent.y).toBeCloseTo(70);
    expect(parent.width).toBeCloseTo(40);
    expect(parent.height).toBeCloseTo(20);
    const local = mermaidShimBBox(group);
    expect(local.x).toBeCloseTo(-20);
    expect(local.y).toBeCloseTo(-10);
    expect(local.width).toBeCloseTo(40);
  });

  test("sums inline inner tspans instead of overlapping them at x=0", () => {
    const row = tspan("spawn / 复用", { "text-anchor": "middle", x: "0", class: "text-outer-tspan row" }, [
      tspan("spawn"),
      tspan(" /"),
      tspan(" 复用"),
    ]);
    const spawn = mermaidShimBBox(tspan("spawn"));
    const box = mermaidShimBBox(row);
    expect(box.width).toBeGreaterThan(spawn.width * 1.4);
    expect(box.x).toBeCloseTo(-box.width / 2, 5);
  });

  test("estimates CJK glyphs as fullwidth", () => {
    expect(measureMermaidTextWidth("用户")).toBeGreaterThan(measureMermaidTextWidth("ab"));
    expect(measureMermaidTextWidth("静态导出")).toBeGreaterThan(48);
  });
});
