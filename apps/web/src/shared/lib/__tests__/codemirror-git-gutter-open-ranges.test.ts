import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Chunk } from "@codemirror/merge";
import { Text } from "@codemirror/state";
import { gitChunkIndicesForLineRanges } from "@/shared/lib/codemirror-git-gutter-utils";

function chunk(fromB: number, toB: number): Chunk {
  return { fromA: 0, toA: 0, fromB, toB, changes: [] } as unknown as Chunk;
}

describe("gitChunkIndicesForLineRanges", () => {
  test("opens hunks that intersect the jumped line ranges", () => {
    const doc = Text.of(["a", "b", "c", "d", "e"]);
    const chunks = [
      chunk(doc.line(1).from, doc.line(1).to + 1),
      chunk(doc.line(3).from, doc.line(4).to + 1),
      chunk(doc.line(5).from, doc.line(5).to + 1),
    ];
    expect(
      gitChunkIndicesForLineRanges(chunks, doc, [{ startLine: 3, endLine: 3 }]),
    ).toEqual([1]);
    expect(
      gitChunkIndicesForLineRanges(chunks, doc, [
        { startLine: 1, endLine: 1 },
        { startLine: 5, endLine: 5 },
      ]),
    ).toEqual([0, 2]);
    expect(
      gitChunkIndicesForLineRanges(chunks, doc, [{ startLine: 2, endLine: 2 }]),
    ).toEqual([]);
  });

  test("opening every hunk includes pure deletions (triangle gutters)", () => {
    const doc = Text.of(["keep"]);
    const deleted = chunk(doc.line(1).from, doc.line(1).from);
    const added = chunk(doc.line(1).from, doc.line(1).to + 1);
    expect(deleted.fromB).toBe(deleted.toB);
    expect(
      [deleted, added].map((_, index) => index),
    ).toEqual([0, 1]);
  });
});

describe("agent chat file jump opens git gutter hunks", () => {
  test("editor applies pending selectRanges to git gutter after jump", () => {
    const base = readFileSync(
      join(import.meta.dir, "../../../features/editor/components/BaseCodeMirrorEditor.tsx"),
      "utf8",
    );
    const gutter = readFileSync(
      join(import.meta.dir, "../codemirror-git-gutter.ts"),
      "utf8",
    );
    expect(base).toContain("openGitGutterChunksForLineRanges");
    expect(base).toContain("openAllGitGutterChunks");
    expect(base).toContain('kind: "all"');
    expect(base).toContain('openGitGutter === "all"');
    expect(base).toContain("gitGutterConfigKeyRef");
    expect(base).toContain("pendingGitGutterOpenRef");
    expect(base).toContain("gutterPinned");
    expect(base).toContain("gutterEnabled");
    expect(gutter).toContain("export function openAllGitGutterChunks");
    expect(gutter).toContain("gs.chunks.map((_, index) => index)");
    expect(gutter).toContain("scrollGitGutterChunkIntoView");
    expect(gutter).toContain("scrollGitGutterChunkIntoView(view, 0)");
    expect(gutter).toContain("export function openGitGutterChunksForLineRanges");
    expect(gutter).toContain("openGitSelection.of");
  });
});
