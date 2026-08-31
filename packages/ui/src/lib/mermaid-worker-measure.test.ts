import { describe, expect, test } from "bun:test";
import { mermaidShimBBox, mermaidShimTextLength } from "./mermaid-worker-measure";

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
});
