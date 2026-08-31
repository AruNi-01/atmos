import { describe, expect, test } from "bun:test";
import {
  MERMAID_VIEW_MODES,
  isMermaidFenceLanguage,
  mermaidCopyContent,
} from "../mermaid-view";

describe("mermaid view helpers", () => {
  test("recognizes mermaid fences case-insensitively", () => {
    expect(isMermaidFenceLanguage("mermaid")).toBe(true);
    expect(isMermaidFenceLanguage("Mermaid")).toBe(true);
    expect(isMermaidFenceLanguage(" mermaid ")).toBe(true);
    expect(isMermaidFenceLanguage("javascript")).toBe(false);
    expect(isMermaidFenceLanguage("")).toBe(false);
  });

  test("orders ASCII, Source, and Preview", () => {
    expect(MERMAID_VIEW_MODES).toEqual(["ascii", "source", "preview"]);
  });

  test("copies ASCII output only in ASCII mode", () => {
    expect(mermaidCopyContent("ascii", "graph TD", "A-->B")).toBe("A-->B");
    expect(mermaidCopyContent("ascii", "graph TD", null)).toBe("graph TD");
    expect(mermaidCopyContent("source", "graph TD", "A-->B")).toBe("graph TD");
    expect(mermaidCopyContent("preview", "graph TD", "A-->B")).toBe("graph TD");
  });
});
