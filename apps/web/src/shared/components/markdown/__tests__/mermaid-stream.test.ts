import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mermaid = readFileSync(join(import.meta.dir, "../MermaidBlock.tsx"), "utf8");
const renderer = readFileSync(join(import.meta.dir, "../MarkdownRenderer.tsx"), "utf8");
const diagramLib = readFileSync(
  join(import.meta.dir, "../../../../../../../packages/ui/src/lib/mermaid-diagram.ts"),
  "utf8",
);

describe("MermaidBlock streaming", () => {
  it("waits for the mermaid fence to close before rendering, without preview completion", () => {
    expect(renderer).toContain("useIsCodeFenceIncomplete");
    expect(renderer).toContain("fenceIncomplete={fenceIncomplete}");
    expect(mermaid).toContain("if (fenceIncomplete || !trimmed)");
    expect(mermaid).toContain("[overflow-anchor:none]");
    expect(diagramLib).toContain("suppressErrorRendering: true");
    expect(diagramLib).toContain("mermaid-diagram.worker.ts");
    expect(mermaid).toContain("mermaid.rendering");
    expect(mermaid).not.toContain("completeMermaidForPreview");
    expect(mermaid).not.toContain("StreamdownContext");
    expect(renderer).not.toContain("completeMermaidForPreview");
  });

  it("exposes ASCII, Source, and Preview using the shared diagram renderer", () => {
    expect(mermaid).toContain("modeAscii");
    expect(mermaid).toContain("modeSource");
    expect(mermaid).toContain("modePreview");
    expect(mermaid).toContain("SelectTrigger");
    expect(mermaid).toContain("border-0");
    expect(mermaid).toContain("[&>svg:last-child]:hidden");
    expect(mermaid).toContain("<Icon className=\"size-3.5\" />");
    expect(mermaid).toContain("ascii: Type");
    expect(mermaid).toContain("source: Code");
    expect(mermaid).toContain("preview: Eye");
    expect(mermaid).not.toContain("aria-pressed");
    expect(mermaid).toContain("renderMermaidDiagram");
    expect(mermaid).toContain("readMermaidDiagramCache");
    expect(mermaid).toContain("waitForMermaidSlotReady");
    expect(mermaid).toContain("onError");
    expect(mermaid).toContain("mermaid-container flex justify-center overflow-hidden");
    expect(renderer).toContain("from './MermaidBlock'");
  });

  it("highlights Source with the shared Shiki mermaid grammar", () => {
    expect(mermaid).toContain("from \"@/shared/utils/shiki\"");
    expect(mermaid).toContain("codeToHtml");
    expect(mermaid).toContain('lang: "mermaid"');
    expect(mermaid).toContain("themes: DualThemes");
  });
});
