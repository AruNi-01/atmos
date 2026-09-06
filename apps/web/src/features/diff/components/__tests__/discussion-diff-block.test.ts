import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("DiscussionDiffBlock", () => {
  const source = readFileSync(
    join(import.meta.dir, "../DiscussionDiffBlock.tsx"),
    "utf8",
  );

  it("matches PR discussion chrome: muted header + MultiFileDiff without Pierre file header", () => {
    expect(source).toContain("MultiFileDiff");
    expect(source).toContain("buildSharedDiffViewOptions");
    expect(source).toContain("ATMOS_DIFF_THEME");
    expect(source).toContain("disableFileHeader: true");
    expect(source).toContain("bg-muted/30");
    expect(source).toContain("getFileIconProps");
    expect(source).toContain("data-discussion-diff-block");
    expect(source).toContain("t('line'");
    expect(source).toContain("t('lineRange'");
  });

  it("supports non-collapsible chat mode and flush header/body", () => {
    expect(source).toContain("collapsible");
    expect(source).toContain("data-collapsible=");
    expect(source).toContain("stickyHeaders: false");
    expect(source).toContain("gap: 0");
    expect(source).toContain("padding-top: 0");
    // Pierre [data-code] keeps 8px gap when file header is disabled.
    expect(source).toContain("[data-code]");
    expect(source).toContain("padding-bottom: 0");
    expect(source).toContain("DISCUSSION_DIFF_METRICS");
    expect(source).toContain("metrics={DISCUSSION_DIFF_METRICS}");
    // Outer muted fill created a visible strip between header and body.
    expect(source).not.toContain("bg-muted/10");
    expect(source).toContain("data-discussion-diff-header");
    expect(source).toContain("data-discussion-diff-body");
  });

  it("does not use Changes CodeView stack or Agent Fix by default", () => {
    expect(source).not.toMatch(
      /import\s*\{[^}]*\bCodeView\b[^}]*\}\s*from\s*['"]@pierre\/diffs\/react['"]/,
    );
    expect(source).not.toContain("ChangesCodeView");
    expect(source).not.toContain("DiffCodeViewScaffold");
    expect(source).not.toContain("AgentFix");
    expect(source).not.toContain("useDiffPromptStash");
    expect(source).toContain("headerTrailing");
    expect(source).toContain("enableLineSelection: false");
  });
});
