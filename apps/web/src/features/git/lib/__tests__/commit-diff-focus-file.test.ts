import { describe, expect, test } from "bun:test";
import { resolveCommitDiffFocusFile } from "../commit-diff-focus-file";

describe("resolveCommitDiffFocusFile", () => {
  const files = [
    { filename: "apps/web/src/a.ts" },
    { filename: "crates/agent/src/lib.rs" },
  ];

  test("matches a repo-relative path exactly", () => {
    expect(resolveCommitDiffFocusFile(files, "apps/web/src/a.ts")).toBe(
      "apps/web/src/a.ts",
    );
  });

  test("matches a path suffix when the blame path is longer or shorter", () => {
    expect(resolveCommitDiffFocusFile(files, "src/a.ts")).toBe("apps/web/src/a.ts");
    expect(
      resolveCommitDiffFocusFile(files, "/Users/me/repo/crates/agent/src/lib.rs"),
    ).toBe("crates/agent/src/lib.rs");
  });

  test("returns null when the file is not in the commit", () => {
    expect(resolveCommitDiffFocusFile(files, "README.md")).toBeNull();
    expect(resolveCommitDiffFocusFile(files, "")).toBeNull();
  });
});
