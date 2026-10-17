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
export const TOOL_DIFF_SEPARATOR_MARGIN = 8;
export const TOOL_DIFF_SEPARATOR_RADIUS = 6;
/** `@media (pointer: fine)` column. Web discussion diffs use that layout. */
export const TOOL_DIFF_EXPAND_BUTTON = 34;
export const TOOL_DIFF_EXPAND_RULE = 2;
export const TOOL_DIFF_EXPAND_ICON = 16;
/** `padding: 0 1ch` on the 13px header font. Same 0.6em advance as the code gutter. */
export const TOOL_DIFF_SEPARATOR_TEXT_PAD = (13 * 6) / 10;
/**
 * Pierre `diffs-icon-expand`. The path points down. `[data-expand-down]`
 * applies `scaleY(-1)`, so a leading separator's button points up.
 */
export const TOOL_DIFF_EXPAND_ICON_PATH =
  "M3.47 5.47a.75.75 0 0 1 1.06 0L8 8.94l3.47-3.47a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 0-1.06";
/** Pierre `diffs-icon-expand-all`, used when one button reveals both ends. */
export const TOOL_DIFF_EXPAND_ALL_ICON_PATH =
  "M11.47 9.47a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 1 1 1.06-1.06L8 12.94zM7.526 1.418a.75.75 0 0 1 1.004.052l4 4a.75.75 0 1 1-1.06 1.06L8 3.06 4.53 6.53a.75.75 0 1 1-1.06-1.06l4-4z";
/** `color-mix(in lab, page 96%, #000)` and `color-mix(in lab, page 85%, #fff)`. */
export const TOOL_DIFF_SEPARATOR_LIGHT = "#e9e9eb";
export const TOOL_DIFF_SEPARATOR_DARK = "#262626";

export type ToolDiffHunkLine = {
  op: "add" | "del" | "ctx";
  text: string;
  oldNo: number | null;
  newNo: number | null;
  /** Pierre's "No newline at end of file" row follows this line. */
  noNewline?: boolean;
};

/** Pierre's English `createNoNewlineElement` copy. Shown in every locale. */
export const TOOL_DIFF_NO_NEWLINE_LABEL = "No newline at end of file";
/** `[data-no-newline] span { opacity: .6 }`. */
export const TOOL_DIFF_NO_NEWLINE_OPACITY = 0.6;
/** `--diffs-fg` is `light-dark(#000, #fff)`. */
export const TOOL_DIFF_FG_LIGHT = "#000000";
export const TOOL_DIFF_FG_DARK = "#ffffff";

export type ToolDiffSegment =
  | { kind: "lines"; lines: ToolDiffHunkLine[] }
  | { kind: "gap"; lines: ToolDiffHunkLine[] };

export type ToolDiffReveal = { fromStart: number; fromEnd: number };

export type ToolDiffGapPlace = "first" | "middle" | "last" | "only";
export type ToolDiffExpandDirection = "up" | "down" | "both";

export type ToolDiffVisibleRow =
  | { kind: "line"; line: ToolDiffHunkLine }
  | {
      kind: "gap";
      segment: number;
      count: number;
      /** Original gap length. Pierre stacks two buttons when this exceeds 100. */
      range: number;
      place: ToolDiffGapPlace;
    };

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
      if (raw.startsWith("\\")) {
        const last = lines[lines.length - 1];
        if (last) last.noNewline = true;
        continue;
      }
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
  direction: ToolDiffExpandDirection,
): ToolDiffReveal {
  const base = current ?? { fromStart: 0, fromEnd: 0 };
  return {
    fromStart:
      base.fromStart + (direction === "up" || direction === "both" ? TOOL_DIFF_EXPAND_LINES : 0),
    fromEnd:
      base.fromEnd + (direction === "down" || direction === "both" ? TOOL_DIFF_EXPAND_LINES : 0),
  };
}

/** Pierre's button set for a line-info separator. The label itself is always "both". */
export function toolDiffExpandButtons(
  place: ToolDiffGapPlace,
  range: number,
): ToolDiffExpandDirection[] {
  const chunked = range > TOOL_DIFF_EXPAND_LINES;
  if (!chunked) {
    if (place === "last") return ["up"];
    if (place === "middle") return ["both"];
    return ["down"];
  }
  const buttons: ToolDiffExpandDirection[] = [];
  if (place !== "first" && place !== "only") buttons.push("up");
  if (place !== "last" && place !== "only") buttons.push("down");
  return buttons;
}

/** `margin-block: 8px`, with the outer edge of a leading or trailing separator cleared. */
export function toolDiffSeparatorMargin(place: ToolDiffGapPlace): {
  marginBottom: number;
  marginTop: number;
} {
  return {
    marginTop: place === "first" || place === "only" ? 0 : TOOL_DIFF_SEPARATOR_MARGIN,
    marginBottom: place === "last" || place === "only" ? 0 : TOOL_DIFF_SEPARATOR_MARGIN,
  };
}

function gapRows(
  segment: number,
  lines: readonly ToolDiffHunkLine[],
  reveal: ToolDiffReveal | undefined,
  place: ToolDiffGapPlace,
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
    range: lines.length,
    place,
  });
  if (fromEnd > 0) {
    for (const line of lines.slice(lines.length - fromEnd)) rows.push({ kind: "line", line });
  }
  return rows;
}

function gapPlace(segments: readonly ToolDiffSegment[], index: number): ToolDiffGapPlace {
  const hasLinesBefore = segments.slice(0, index).some((segment) => segment.kind === "lines");
  const hasLinesAfter = segments.slice(index + 1).some((segment) => segment.kind === "lines");
  if (!hasLinesBefore && !hasLinesAfter) return "only";
  if (!hasLinesBefore) return "first";
  if (!hasLinesAfter) return "last";
  return "middle";
}

/** Collapsed gaps stay hidden until `revealed` pulls lines in from one edge. */
export function toolDiffVisibleRows(
  segments: readonly ToolDiffSegment[],
  revealed: Readonly<Record<number, ToolDiffReveal>> = {},
): ToolDiffVisibleRow[] {
  const rows: ToolDiffVisibleRow[] = [];
  segments.forEach((segment, index) => {
    if (segment.kind === "gap") {
      rows.push(...gapRows(index, segment.lines, revealed[index], gapPlace(segments, index)));
      return;
    }
    for (const line of segment.lines) rows.push({ kind: "line", line });
  });
  return rows;
}
