import { describe, expect, test } from "bun:test";
import { unifiedHunkBody } from "@/features/git/lib/unified-diff-from-sides";

describe("unifiedHunkBody", () => {
  test("keeps unchanged lines and marks a replacement", () => {
    const hunk = unifiedHunkBody("one\ntwo\nthree\n", "one\nTWO\nthree\n");
    expect(hunk).toContain(" one");
    expect(hunk).toContain("-two");
    expect(hunk).toContain("+TWO");
    expect(hunk).toContain(" three");
    expect(hunk.startsWith("@@ ")).toBe(true);
  });
});
