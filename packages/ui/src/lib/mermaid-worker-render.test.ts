import { describe, expect, test } from "bun:test";
import "./mermaid-worker-dom";
import mermaid from "mermaid";
import { isPlausibleMermaidSvgSize, parseMermaidSvgSize } from "./mermaid-diagram";

describe("mermaid worker DOM layout", () => {
  test("flowchart viewBox is a real diagram, not a hairline from stylesheet text", async () => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: true },
    });
    const { svg } = await mermaid.render(
      "atmos-mermaid-layout-probe",
      "flowchart TD\n  subgraph apps [apps/api]\n    WS[WebSocket]\n  end\n  WS --> Chat[agent chat]",
    );
    const size = parseMermaidSvgSize(svg);
    expect(isPlausibleMermaidSvgSize(size.width, size.height)).toBe(true);
    expect(size.height).toBeGreaterThan(80);
    expect(size.width / size.height).toBeLessThan(8);
  });
});
