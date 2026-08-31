import { describe, expect, test } from "bun:test";
import { DualThemes, highlight } from "../shiki";

const SAMPLE = `flowchart TD
  A[Start] --> B{OK?}
%% comment`;

describe("shiki mermaid source grammar", () => {
  test("highlights mermaid keywords, nodes, and comments", async () => {
    const highlighter = await highlight();
    const html = highlighter.codeToHtml(SAMPLE, {
      lang: "mermaid",
      themes: DualThemes,
    });
    expect(html).toContain("shiki");
    expect(html).toMatch(/<span[^>]*>flowchart<\/span>/);
    expect(html).toContain("%% comment");
    expect(html).toContain("color:");
  });
});
