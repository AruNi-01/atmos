import { describe, expect, test } from "bun:test";
import {
  TOOL_DIFF_EXPAND_BUTTON,
  TOOL_DIFF_EXPAND_LINES,
  TOOL_DIFF_SEPARATOR_DARK,
  TOOL_DIFF_SEPARATOR_HEIGHT,
  TOOL_DIFF_SEPARATOR_LIGHT,
  TOOL_DIFF_SEPARATOR_MARGIN,
  TOOL_DIFF_SEPARATOR_TEXT_PAD,
  toolDiffExpandButtons,
  toolDiffRevealMore,
  toolDiffSegments,
  toolDiffSegmentsFromPatch,
  toolDiffSeparatorMargin,
  toolDiffUnmodifiedLabel,
  toolDiffVisibleRows,
} from "./tool-diff-hunks";

function numbered(count: number, changes: Record<number, string> = {}): string {
  return (
    Array.from({ length: count }, (_, index) => changes[index + 1] ?? `L${index + 1}`).join("\n") +
    "\n"
  );
}

describe("tool diff hunks", () => {
  test("a new file is only additions", () => {
    const diff = toolDiffSegments("", "a\nb\n");
    expect(diff.lines).toEqual([
      { op: "add", text: "a", oldNo: null, newNo: 1 },
      { op: "add", text: "b", oldNo: null, newNo: 2 },
    ]);
    expect(diff.segments.some((segment) => segment.kind === "gap")).toBe(false);
  });

  test("keeps a short edit as real file lines", () => {
    const diff = toolDiffSegments("a\nb\n", "a\nc\n");
    expect(diff.additions).toBe(1);
    expect(diff.deletions).toBe(1);
    expect(diff.lines).toEqual([
      { op: "ctx", text: "a", oldNo: 1, newNo: 1 },
      { op: "del", text: "b", oldNo: 2, newNo: null },
      { op: "add", text: "c", oldNo: null, newNo: 2 },
    ]);
    expect(diff.segments.every((segment) => segment.kind === "lines")).toBe(true);
  });

  test("collapses a gap longer than one line and keeps four lines of context", () => {
    const diff = toolDiffSegments(numbered(30), numbered(30, { 3: "C3", 26: "C26" }));
    const gaps = diff.segments.filter((segment) => segment.kind === "gap");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.lines).toHaveLength(14);
    expect(toolDiffVisibleRows(diff.segments).find((row) => row.kind === "gap")).toMatchObject({
      place: "middle",
      count: 14,
      range: 14,
    });
    expect(gaps[0]?.lines[0]).toEqual({ op: "ctx", text: "L8", oldNo: 8, newNo: 8 });
    expect(diff.lines[0]).toEqual({ op: "ctx", text: "L1", oldNo: 1, newNo: 1 });
    expect(diff.lines.some((line) => line.text === "L8")).toBe(false);
    expect(diff.lines.some((line) => line.text === "L7")).toBe(true);
    expect(diff.lines.some((line) => line.text === "L22")).toBe(true);
    expect(diff.additions).toBe(2);
    expect(diff.deletions).toBe(2);
  });

  test("shows a one-line gap instead of a separator", () => {
    const diff = toolDiffSegments(numbered(12), numbered(12, { 2: "X2", 12: "X12" }));
    expect(diff.segments.some((segment) => segment.kind === "gap")).toBe(false);
    expect(diff.lines.some((line) => line.text === "L7")).toBe(true);
  });

  test("hides the file prefix above the first hunk", () => {
    const diff = toolDiffSegments(numbered(20), numbered(20, { 12: "C12" }));
    const rows = toolDiffVisibleRows(diff.segments);
    expect(rows[0]).toEqual({ kind: "gap", segment: 0, count: 7, range: 7, place: "first" });
    expect(rows[1]).toMatchObject({ kind: "line", line: { text: "L8", newNo: 8 } });
  });

  test("a press reveals the next 100 lines from the edge beside the change", () => {
    const diff = toolDiffSegments(numbered(20), numbered(20, { 12: "C12" }));
    const hidden = toolDiffRevealMore(undefined, "down");
    expect(hidden.fromEnd).toBe(TOOL_DIFF_EXPAND_LINES);
    const rows = toolDiffVisibleRows(diff.segments, { 0: hidden });
    expect(rows[0]).toMatchObject({ kind: "line", line: { text: "L1" } });
    expect(rows.some((row) => row.kind === "gap" && row.segment === 0)).toBe(false);
  });

  test("renumbers a patch snippet from line 1", () => {
    const segments = toolDiffSegmentsFromPatch("@@ -40,3 +40,3 @@\n a\n-b\n+c\n");
    const rows = toolDiffVisibleRows(segments);
    expect(rows.map((row) => (row.kind === "line" ? row.line : row))).toEqual([
      { op: "ctx", text: "a", oldNo: 1, newNo: 1 },
      { op: "del", text: "b", oldNo: 2, newNo: null },
      { op: "add", text: "c", oldNo: null, newNo: 2 },
    ]);
  });

  test("uses Pierre's separator label and fill", () => {
    expect(toolDiffUnmodifiedLabel(1)).toBe("1 unmodified line");
    expect(toolDiffUnmodifiedLabel(14)).toBe("14 unmodified lines");
    expect(TOOL_DIFF_SEPARATOR_HEIGHT).toBe(32);
    expect(TOOL_DIFF_SEPARATOR_MARGIN).toBe(8);
    expect(TOOL_DIFF_EXPAND_BUTTON).toBe(34);
    expect(TOOL_DIFF_SEPARATOR_TEXT_PAD).toBe(7.8);
    expect(TOOL_DIFF_SEPARATOR_LIGHT).toBe("#e9e9eb");
    expect(TOOL_DIFF_SEPARATOR_DARK).toBe("#262626");
    expect(toolDiffExpandButtons("first", 7)).toEqual(["down"]);
    expect(toolDiffExpandButtons("last", 7)).toEqual(["up"]);
    expect(toolDiffExpandButtons("middle", 14)).toEqual(["both"]);
    expect(toolDiffExpandButtons("middle", 140)).toEqual(["up", "down"]);
    expect(toolDiffExpandButtons("only", 140)).toEqual([]);
    expect(toolDiffSeparatorMargin("first")).toEqual({ marginTop: 0, marginBottom: 8 });
    expect(toolDiffSeparatorMargin("last")).toEqual({ marginTop: 8, marginBottom: 0 });
    expect(toolDiffSeparatorMargin("middle")).toEqual({ marginTop: 8, marginBottom: 8 });
    expect(toolDiffSeparatorMargin("only")).toEqual({ marginTop: 0, marginBottom: 0 });
    expect(toolDiffRevealMore(undefined, "both")).toEqual({ fromStart: 100, fromEnd: 100 });
  });
});
