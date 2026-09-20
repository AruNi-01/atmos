import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import "./mermaid-worker-dom";
import mermaid from "mermaid";
import { isPlausibleMermaidSvgSize, parseMermaidSvgSize } from "./mermaid-diagram";

describe("mermaid worker DOM layout", () => {
  test("installs a UTF-8 btoa shim before mermaid render", () => {
    const source = readFileSync(new URL("./mermaid-worker-dom.ts", import.meta.url), "utf8");
    expect(source).toContain("installMermaidUtf8Btoa");
  });

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

  test("flowchart with CJK labels does not fail btoa Latin1", async () => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: true },
    });
    const { svg } = await mermaid.render(
      "atmos-mermaid-cjk-probe",
      [
        "flowchart LR",
        '  User([用户]) --> Electron["Atmos.app<br/>apps/desktop-electron"]',
        '  User --> Browser["浏览器 :3030<br/>just dev-web"]',
        "  Electron -->|spawn / 复用| Server[\"Atmos Server<br/>apps/api :30303\"]",
        "  Browser -->|dev rewrite| Server",
        "  Server -->|静态导出 / WS| Web[\"apps/web 同一套 UI\"]",
        "  Electron -->|preload 桥| Web",
      ].join("\n"),
    );
    expect(svg).toContain("用户");
    expect(svg).toContain("浏览器");
    const size = parseMermaidSvgSize(svg);
    expect(isPlausibleMermaidSvgSize(size.width, size.height)).toBe(true);
    expect(size.width).toBeGreaterThan(480);
    expect(size.height).toBeGreaterThan(120);
    const viewBox = svg.match(/viewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    expect(viewBox).toBeTruthy();
    const minX = Number(viewBox?.[1]);
    const width = Number(viewBox?.[3]);
    expect(minX + width).toBeGreaterThan(500);
    const spawnLabel = svg.match(
      /data-id="L_Electron_Server_0"[\s\S]{0,280}?<rect[^>]*width="([^"]+)"/,
    );
    expect(Number(spawnLabel?.[1])).toBeGreaterThan(70);
  });
});
