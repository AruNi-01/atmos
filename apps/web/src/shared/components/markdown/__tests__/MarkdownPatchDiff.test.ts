// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { isMarkdownPatchCode } from "../is-markdown-patch-code";

const UNIFIED_DIFF = [
  "diff --git a/src/foo.ts b/src/foo.ts",
  "index 1111111..2222222 100644",
  "--- a/src/foo.ts",
  "+++ b/src/foo.ts",
  "@@ -1,3 +1,3 @@",
  " line",
  "-old",
  "+new",
].join("\n");

describe("isMarkdownPatchCode", () => {
  it("returns true for a unified diff with git headers", () => {
    expect(isMarkdownPatchCode(UNIFIED_DIFF)).toBe(true);
  });

  it("returns true for a hunk with --- / +++ file headers", () => {
    const patch = [
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ].join("\n");
    expect(isMarkdownPatchCode(patch)).toBe(true);
  });

  it("returns false for a normal code fence", () => {
    expect(isMarkdownPatchCode("function hello() {\n  return 1;\n}")).toBe(false);
  });

  it("returns false for hunk-looking text without file headers", () => {
    expect(isMarkdownPatchCode("@@ -1 +1 @@\n-old\n+new")).toBe(false);
  });
});
