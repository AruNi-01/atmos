import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  editorPreviewRootDomId,
  markdownTocShouldMountForFile,
} from "@/features/editor/lib/editor-preview-root";

describe("editor preview root", () => {
  test("gives each file a distinct scroller id", () => {
    expect(editorPreviewRootDomId("/repo/a.md")).not.toBe(editorPreviewRootDomId("/repo/b.md"));
    expect(editorPreviewRootDomId("/repo/a.md")).toBe("editor-preview-root-repo-a-md");
  });

  test("mounts the outline only for the focused file tab", () => {
    expect(markdownTocShouldMountForFile("/repo/a.md", "/repo/a.md")).toBe(true);
    expect(markdownTocShouldMountForFile("/repo/b.md", "/repo/a.md")).toBe(false);
    expect(markdownTocShouldMountForFile(null, "/repo/a.md")).toBe(false);
  });

  test("CodeMirrorEditor binds TOC to the active file scroller", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/CodeMirrorEditor.tsx"),
      "utf8",
    );
    expect(source).toContain("editorPreviewRootDomId");
    expect(source).toContain("markdownTocShouldMountForFile");
    expect(source).toContain("data-editor-preview-root");
    expect(source).toContain("scrollRoot={previewRoot}");
    expect(source).not.toContain('id="editor-preview-root"');
    expect(source).not.toContain('scrollContainerId="editor-preview-root"');
  });
});
