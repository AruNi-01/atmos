import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { truncateFileDiffLines } from "./file-diff-gift-lines";
import type { FileDiffLine } from "./file-diff-gift-types";

describe("FileDiffGift source", () => {
  it("vendors a headerless gift card without beui chrome", () => {
    const source = readFileSync(join(import.meta.dir, "file-diff-gift.tsx"), "utf8");
    expect(source).toContain("beui.dev/components/agents/file-diff");
    expect(source).toContain('data-slot="file-diff-gift"');
    expect(source).toContain("AgentCodeLine");
    expect(source).toContain("useSmoothStreamText");
    expect(source).toContain("rounded-xl bg-muted/80");
    expect(source).not.toContain("LoaderCircle");
    expect(source).not.toContain("ChevronDown");
    expect(source).not.toContain("FileCode2");
    expect(source).not.toContain("AgentDisclosure");
    // Gift body is lines + copy only — no file path / stats header row.
    expect(source).not.toContain("FileCode");
    expect(source).not.toMatch(/\b(additions|deletions)\b/);
  });
});

describe("truncateFileDiffLines", () => {
  const lines: FileDiffLine[] = [
    { id: "1", type: "context", content: "ab" },
    { id: "2", type: "added", content: "cdef" },
  ];

  it("returns a prefix of joined line content", () => {
    // "ab\nc…" — four chars yields the first line plus one char of the next.
    expect(truncateFileDiffLines(lines, 4).map((line) => line.content)).toEqual([
      "ab",
      "c",
    ]);
    expect(truncateFileDiffLines(lines, 3).map((line) => line.content)).toEqual([
      "ab",
    ]);
  });

  it("returns empty for zero chars", () => {
    expect(truncateFileDiffLines(lines, 0)).toEqual([]);
  });
});
