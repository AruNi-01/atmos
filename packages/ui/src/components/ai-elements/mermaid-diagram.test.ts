import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const here = dirname(fileURLToPath(import.meta.url));

describe("streamdown mermaid diagrams", () => {
  test("replace the built-in mermaid block with a cached image renderer", () => {
    const message = readFileSync(join(here, "message.tsx"), "utf8");
    const diagram = readFileSync(join(here, "mermaid-diagram.tsx"), "utf8");
    const runtime = readFileSync(join(here, "../../lib/mermaid-diagram.ts"), "utf8");
    expect(message).toContain('language: "mermaid"');
    expect(message).toContain("component: MermaidDiagram");
    expect(diagram).toContain("readMermaidDiagramCache");
    expect(diagram).toContain("waitForMermaidSlotReady");
    expect(diagram).toContain("renderMermaidDiagram");
    expect(diagram).toContain("MERMAID_RENDERING_LABEL");
    expect(diagram).toContain("onError");
    expect(diagram).toContain("overflow-hidden");
    expect(diagram).not.toContain("overflow-x-auto");
    expect(runtime).toContain("mermaid-diagram.worker.ts");
    expect(runtime).toContain("type: \"module\"");
    expect(runtime).toContain("isPlausibleMermaidSvgSize");
    expect(runtime).not.toContain("attempt < 8");
    expect(diagram).not.toContain("contentVisibility");
    expect(diagram).not.toContain("dangerouslySetInnerHTML");
  });
});
