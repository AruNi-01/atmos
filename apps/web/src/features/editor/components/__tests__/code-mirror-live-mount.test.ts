import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const editorPath = join(import.meta.dir, "../CodeMirrorEditor.tsx");

describe("CodeMirrorEditor live mount", () => {
  test("mounts MarkdownLiveEditor and does not add a docs center tab", () => {
    const source = readFileSync(editorPath, "utf8");
    expect(source).toContain("MarkdownLiveEditor");
    expect(source).toContain("isLiveEligibleMarkdownPath");
    expect(source).toContain("MdLiveSaveAsDialog");
    expect(source).not.toContain('kind: "docs"');
    expect(source).toContain("enabled: surfaceActive && !file.isLoading && !isLive");
    expect(source).toContain('ensureLive={() => setMarkdownView("live")}');
  });
});
