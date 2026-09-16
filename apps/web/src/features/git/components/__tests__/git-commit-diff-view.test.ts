import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const viewPath = join(import.meta.dir, "../GitCommitDiffView.tsx");

describe("GitCommitDiffView", () => {
  test("uses local git data when repoPath is set and treats GitHub as an optional link", () => {
    const src = readFileSync(viewPath, "utf8");
    expect(src).toContain("repoPath");
    expect(src).toContain("useLocalCommitView");
    expect(src).toContain("const useLocal = Boolean(repoPath)");
    expect(src).toContain("active && !useLocal && Boolean(ownerName && repoName)");
    expect(src).toContain("githubUrl ?");
    expect(src).toContain("git.commitDiff");
    expect(src).not.toContain("github.commitDetail");
    expect(src).toContain("focusFilePath");
    expect(src).toContain("resolveCommitDiffFocusFile");
  });
});
