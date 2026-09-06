import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("agent tool markdown file presentation", () => {
  it("path previews never force MarkdownRenderer for .md files", () => {
    const preview = readFileSync(
      join(import.meta.dir, "../tool-results/AgentToolPathPreviewBody.tsx"),
      "utf8",
    );
    expect(preview).toContain("AgentToolCodePreview");
    expect(preview).toContain("languageFromPath");
    expect(preview).not.toContain("MarkdownRenderer");
    expect(preview).not.toContain('kind: "markdown"');
    expect(preview).not.toContain("language === \"markdown\"");
    expect(preview).not.toContain("/\\.md$/i");
  });

  it("code/read previews keep Markdown fence language head, skip DiscussionDiffBlock", () => {
    const block = readFileSync(
      join(import.meta.dir, "../tool-results/AgentToolResultBlock.tsx"),
      "utf8",
    );
    const codeFnStart = block.indexOf("function AgentToolCodeResult");
    const codeFnEnd = block.indexOf("export function AgentToolResultBlock");
    expect(codeFnStart).toBeGreaterThan(-1);
    expect(codeFnEnd).toBeGreaterThan(codeFnStart);
    const codeResult = block.slice(codeFnStart, codeFnEnd);
    // Tool card head stays; code fence uses MarkdownCodeBlock language bar.
    expect(codeResult).toContain("fenceForMarkdown");
    expect(codeResult).toContain("<MarkdownRenderer");
    expect(codeResult).not.toContain("<DiscussionDiffBlock");
    expect(codeResult).not.toContain("data-agent-diff");
    expect(codeResult).not.toContain("AgentToolCodePreview");
    expect(block).toContain("fenceForMarkdown");
    expect(block).toContain('from "@/shared/components/markdown/MarkdownRenderer"');
    expect(block).not.toContain('from "@/features/diff/components/DiscussionDiffBlock"');
  });

  it("ordinary fs tools keep code/diff routes; PlanDocument keeps markdown preview", () => {
    const block = readFileSync(
      join(import.meta.dir, "../tool-results/AgentToolResultBlock.tsx"),
      "utf8",
    );
    const plan = readFileSync(
      join(import.meta.dir, "../tool-results/AgentToolPlanDocument.tsx"),
      "utf8",
    );
    const diff = readFileSync(
      join(import.meta.dir, "../tool-results/AgentToolDiffResult.tsx"),
      "utf8",
    );
    expect(block).toContain('presentation.kind === "diff"');
    expect(block).toContain('presentation.kind === "patch"');
    expect(block).toContain('presentation.kind === "diff_stats"');
    expect(block).toContain('presentation.kind === "code"');
    expect(block).toContain("AgentToolCodeResult");
    expect(block).toContain("AgentToolDiffResult");
    expect(block).toContain('t("lineChanges")');
    expect(block).toContain('part.kind === "plan_document"');
    expect(block).toContain("AgentToolPlanDocument");
    expect(block).toContain('presentation.kind === "empty" && path && part.kind === "read"');
    expect(plan).toContain("MarkdownRenderer");
    expect(plan).toContain("data-agent-plan-document");
    // Write/Edit diffs keep discussion chrome; Read/code does not.
    expect(diff).toContain("DiscussionDiffBlock");
    expect(diff).toContain('data-agent-diff="pr-discussion"');
  });

  it("edit with only diff_stats renders a stats body, never path preview", () => {
    const block = readFileSync(
      join(import.meta.dir, "../tool-results/AgentToolResultBlock.tsx"),
      "utf8",
    );
    const present = readFileSync(
      join(import.meta.dir, "../../lib/tool-results/parse-tool-result.ts"),
      "utf8",
    );
    expect(present).toContain('kind: "diff_stats"');
    expect(block).toContain('presentation.kind === "diff_stats"');
    expect(block).toContain('t("lineChanges")');
    expect(block).toMatch(
      /presentation\.kind === "empty" && path && part\.kind === "read"/,
    );
  });
});
