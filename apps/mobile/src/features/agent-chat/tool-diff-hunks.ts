import { structuredPatch } from "diff";

/**
 * Pierre builds hunks with jsdiff's default context of 4, then hides an
 * unchanged gap only when it is longer than `collapsedContextThreshold` (1).
 * A press reveals `expansionLineCount` (100) lines from the edge next to the
 * change. The separator copy is Pierre's English `getModifiedLinesString`.
 */
export const TOOL_DIFF_CONTEXT_THRESHOLD = 1;
export const TOOL_DIFF_EXPAND_LINES = 100;
export const TOOL_DIFF_SEPARATOR_HEIGHT = 32;
export const TOOL_DIFF_SEPARATOR_INSET = 8;
export const TOOL_DIFF_SEPARATOR_RADIUS = 6;
/** `color-mix(in lab, page 96%, #000)` and `color-mix(in lab, page 85%, #fff)`. */
export const TOOL_DIFF_SEPARATOR_LIGHT = "#e9e9eb";
export const TOOL_DIFF_SEPARATOR_DARK = "#262626";

export type ToolDiffHunkLine = {
  op: "add" | "del" | "ctx";
  text: string;
  oldNo: number | null;
  newNo: number | null;
};

export type ToolDiffSegment =
  | { kind: "lines"; lines: ToolDiffHunkLine[] }
  | { kind: "gap"; lines: ToolDiffHunkLine[] };

export type ToolDiffReveal = { fromStart: number; fromEnd: number };

export type ToolDiffVisibleRow =
  | { kind: "line"; line: ToolDiffHunkLine }
  | { kind: "gap"; segment: number; count: number; edge: "start" | "end" };

export function toolDiffUnmodifiedLabel(count: number): string {
  return `${count} unmodified line${count === 1 ? "" : "s"}`;
}

export function toolDiffSeparatorFill(isDark: boolean): string {
  return isDark ? TOOL_DIFF_SEPARATOR_DARK : TOOL_DIFF_SEPARATOR_LIGHT;
}

function fileLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  return lines;
}

function pushGap(
  segments: ToolDiffSegment[],
  oldFile: string[],
  newFile: string[],
  oldCursor: number,
  newCursor: number,
  oldEnd: number,
  newEnd: number,
): { oldCursor: number; newCursor: number } {
  const count = Math.max(oldEnd - oldCursor, newEnd - newCursor);
  if (count <= 0) return { oldCursor: oldEnd, newCursor: newEnd };
  const lines: ToolDiffHunkLine[] = [];
  for (let index = 0; index < count; index += 1) {
    const newIndex = newCursor + index;
    const oldIndex = oldCursor + index;
    lines.push({
      op: "ctx",
      text: newFile[newIndex] ?? oldFile[oldIndex] ?? "",
      oldNo: oldIndex + 1,
      newNo: newIndex + 1,
    });
  }
  segments.push(
    count <= TOOL_DIFF_CONTEXT_THRESHOLD ? { kind: "lines", lines } : { kind: "gap", lines },
  );
  return { oldCursor: oldEnd, newCursor: newEnd };
}

/** Visible hunk lines plus collapsed gaps. Line numbers follow the real files. */
export function toolDiffSegments(
  oldContent: string,
  newContent: string,
): {
  additions: number;
  deletions: number;
  lines: ToolDiffHunkLine[];
  segments: ToolDiffSegment[];
} {
  const oldFile = fileLines(oldContent);
  const newFile = fileLines(newContent);
  const patch = structuredPatch("old", "new", oldContent, newContent);
  const segments: ToolDiffSegment[] = [];
  let oldCursor = 0;
  let newCursor = 0;
  let additions = 0;
  let deletions = 0;

  for (const hunk of patch.hunks) {
    const cursors = pushGap(
      segments,
      oldFile,
      newFile,
      oldCursor,
      newCursor,
      Math.max(0, hunk.oldStart - 1),
      Math.max(0, hunk.newStart - 1),
    );
    oldCursor = cursors.oldCursor;
    newCursor = cursors.newCursor;
    const lines: ToolDiffHunkLine[] = [];
    let oldNo = hunk.oldStart;
    let newNo = hunk.newStart;
    for (const raw of hunk.lines) {
      if (raw.startsWith("\\")) continue;
      const text = raw.slice(1).replace(/\n$/, "");
      if (raw.startsWith("+")) {
        lines.push({ op: "add", text, oldNo: null, newNo });
        newNo += 1;
        additions += 1;
      } else if (raw.startsWith("-")) {
        lines.push({ op: "del", text, oldNo, newNo: null });
        oldNo += 1;
        deletions += 1;
      } else {
        lines.push({ op: "ctx", text, oldNo, newNo });
        oldNo += 1;
        newNo += 1;
      }
    }
    if (lines.length > 0) segments.push({ kind: "lines", lines });
    oldCursor = hunk.oldLines === 0 ? oldCursor : oldNo - 1;
    newCursor = hunk.newLines === 0 ? newCursor : newNo - 1;
  }

  pushGap(segments, oldFile, newFile, oldCursor, newCursor, oldFile.length, newFile.length);
  const lines = segments.flatMap((segment) => (segment.kind === "lines" ? segment.lines : []));
  return { additions, deletions, lines, segments };
}

/**
 * Web `buildFilesFromDiffHunk` drops `@@` and diffs the snippet, so the first
 * visible row is line 1 of that snippet.
 */
export function toolDiffSegmentsFromPatch(patch: string): ToolDiffSegment[] {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  for (const raw of patch.split("\n")) {
    if (
      raw.length === 0 ||
      raw.startsWith("@@") ||
      raw.startsWith("---") ||
      raw.startsWith("+++") ||
      raw.startsWith("diff ") ||
      raw.startsWith("index ") ||
      raw.startsWith("\\")
    ) {
      continue;
    }
    if (raw.startsWith("-")) {
      oldLines.push(raw.slice(1));
      continue;
    }
    if (raw.startsWith("+")) {
      newLines.push(raw.slice(1));
      continue;
    }
    if (raw.startsWith(" ")) {
      const text = raw.slice(1);
      oldLines.push(text);
      newLines.push(text);
    }
  }
  if (oldLines.length === 0 && newLines.length === 0) return [];
  return toolDiffSegments(oldLines.join("\n"), newLines.join("\n")).segments;
}

export function toolDiffRevealMore(
  current: ToolDiffReveal | undefined,
  edge: "start" | "end",
): ToolDiffReveal {
  const base = current ?? { fromStart: 0, fromEnd: 0 };
  if (edge === "end") return { ...base, fromEnd: base.fromEnd + TOOL_DIFF_EXPAND_LINES };
  return { ...base, fromStart: base.fromStart + TOOL_DIFF_EXPAND_LINES };
}

function gapRows(
  segment: number,
  lines: readonly ToolDiffHunkLine[],
  reveal: ToolDiffReveal | undefined,
  edge: "start" | "end",
): ToolDiffVisibleRow[] {
  const fromStart = reveal?.fromStart ?? 0;
  const fromEnd = reveal?.fromEnd ?? 0;
  if (fromStart + fromEnd >= lines.length) {
    return lines.map((line) => ({ kind: "line", line }));
  }
  const rows: ToolDiffVisibleRow[] = [];
  for (const line of lines.slice(0, fromStart)) rows.push({ kind: "line", line });
  rows.push({
    kind: "gap",
    segment,
    count: lines.length - fromStart - fromEnd,
    edge,
  });
  if (fromEnd > 0) {
    for (const line of lines.slice(lines.length - fromEnd)) rows.push({ kind: "line", line });
  }
  return rows;
}

/** Collapsed gaps stay hidden until `revealed` pulls lines in from one edge. */
export function toolDiffVisibleRows(
  segments: readonly ToolDiffSegment[],
  revealed: Readonly<Record<number, ToolDiffReveal>> = {},
): ToolDiffVisibleRow[] {
  const onlyGap = segments.length === 1 && segments[0]?.kind === "gap";
  const rows: ToolDiffVisibleRow[] = [];
  let seenLines = false;
  segments.forEach((segment, index) => {
    if (segment.kind === "gap") {
      const edge = seenLines || onlyGap ? "start" : "end";
      rows.push(...gapRows(index, segment.lines, revealed[index], edge));
      return;
    }
    seenLines = true;
    for (const line of segment.lines) rows.push({ kind: "line", line });
  });
  return rows;
}
