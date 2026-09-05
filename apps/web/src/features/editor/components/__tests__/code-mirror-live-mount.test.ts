import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const editorPath = join(import.meta.dir, "../CodeMirrorEditor.tsx");

describe("CodeMirrorEditor live mount", () => {
  test("mounts MarkdownLiveEditor and does not add a docs center tab", () => {
    const source = readFileSync(editorPath, "utf8");
    expect(source).toContain("MarkdownLiveEditor");
    expect(source).toContain("import dynamic from 'next/dynamic'");
    expect(source).not.toMatch(/import \{ MarkdownLiveEditor \}/);
    expect(source).not.toMatch(/import \{ MdLiveAgentDock \}/);
    expect(source).toContain("isLiveEligibleMarkdownPath");
    expect(source).toContain("MdLiveSaveAsDialog");
    expect(source).not.toContain('kind: "docs"');
    expect(source).toContain("enabled: surfaceActive && !file.isLoading && !isLive");
    expect(source).toContain('ensureLive={() => setMarkdownView("live")}');
    expect(source).toContain("markdownView === 'live'");
    expect(source).toContain("relative flex h-full min-h-0 w-full flex-col overflow-hidden");
    expect(source).toContain("absolute inset-0 overflow-y-auto overscroll-contain");
    expect(source).toContain("MdLiveAgentDock");
    expect(source).not.toContain("renderNewNoteButton");
    expect(source).not.toContain("openUntitledMarkdown");
    expect(source).not.toContain("showFloatingMarkdownEditorChrome");
    expect(source).not.toContain("setBreadcrumbs");
    expect(source).not.toContain("breadcrumbs && !isPreview");
    expect(source).toContain("showFilesExplorerToggle");
    expect(source).toContain('<CenterExplorerToggle kind="files"');
    expect(source).toContain("data-center-explorer-chrome");
    expect(source).toContain("CENTER_EXPLORER_BODY_INSET_CLASS");
    expect(source).toContain('side="left"');
  });

  test("opens markdown source view when jumping to a line selection", () => {
    const source = readFileSync(editorPath, "utf8");
    expect(source).toContain("preferMarkdownSource");
    expect(source).toContain("markdownJumpWantsSource");
    expect(source).toContain("jumpWantsSource");
    expect(source).toContain("!jumpWantsSource");
    expect(source).toContain("setMarkdownView('source')");
    expect(source).toContain("setPreviewFilePath((current) => (current === file.path ? null : current))");
  });
});
