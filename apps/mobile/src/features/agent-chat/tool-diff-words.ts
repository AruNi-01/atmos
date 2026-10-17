import { diffWordsWithSpace } from "diff";

/**
 * Pierre's intra-line mark (`lineDiffType: "word-alt"`). A paired deletion
 * and addition share one `diffWordsWithSpace` pass. A one-character unchanged
 * token is swallowed into the changed run before it. The last token stays its
 * own run. Lines longer than 1000 characters stay unmarked.
 */
export const TOOL_DIFF_WORD_MAX = 1000;

/** Pierre `[data-code] { tab-size: var(--diffs-tab-size, 2) }`. */
export const TOOL_DIFF_TAB_SIZE = 2;

/**
 * `rgb(from addition/deletion base / .15)` in light and `/ .2` in dark.
 * The addition base is the soft theme's added-file color.
 */
export const TOOL_DIFF_WORD_ADD_LIGHT = "rgba(7, 196, 128, 0.15)";
export const TOOL_DIFF_WORD_ADD_DARK = "rgba(96, 209, 153, 0.2)";
export const TOOL_DIFF_WORD_DEL_LIGHT = "rgba(255, 46, 63, 0.15)";
export const TOOL_DIFF_WORD_DEL_DARK = "rgba(255, 103, 98, 0.2)";
/** `[data-diff-span] { border-radius: 3px }`. */
export const TOOL_DIFF_WORD_RADIUS = 3;

export type ToolDiffWordPiece = { text: string; changed: boolean };

type Span = [changed: 0 | 1, text: string];

export function toolDiffWordFill(op: "add" | "del", isDark: boolean): string {
  if (op === "add") return isDark ? TOOL_DIFF_WORD_ADD_DARK : TOOL_DIFF_WORD_ADD_LIGHT;
  return isDark ? TOOL_DIFF_WORD_DEL_DARK : TOOL_DIFF_WORD_DEL_LIGHT;
}

function withoutLastNewline(text: string): string {
  if (text.endsWith("\n")) {
    return text.endsWith("\r\n") ? text.slice(0, -2) : text.slice(0, -1);
  }
  return text;
}

function pushOrJoin(spans: Span[], value: string, neutral: boolean, isLastItem: boolean): void {
  const last = spans[spans.length - 1];
  if (last == null || isLastItem) {
    spans.push([neutral ? 0 : 1, value]);
    return;
  }
  const lastNeutral = last[0] === 0;
  if (neutral === lastNeutral || (neutral && value.length === 1 && !lastNeutral)) {
    last[1] += value;
    return;
  }
  spans.push([neutral ? 0 : 1, value]);
}

function piecesFromSpans(spans: Span[]): ToolDiffWordPiece[] {
  return spans
    .filter((span) => span[1].length > 0)
    .map((span) => ({ text: span[1], changed: span[0] === 1 }));
}

export function toolDiffWordPieces(
  before: string,
  after: string,
): { deletion: ToolDiffWordPiece[]; addition: ToolDiffWordPiece[] } | null {
  const deletionText = withoutLastNewline(before);
  const additionText = withoutLastNewline(after);
  if (deletionText.length > TOOL_DIFF_WORD_MAX || additionText.length > TOOL_DIFF_WORD_MAX) {
    return null;
  }
  const changes = diffWordsWithSpace(deletionText, additionText);
  const last = changes[changes.length - 1];
  const deletion: Span[] = [];
  const addition: Span[] = [];
  for (const item of changes) {
    const neutral = !item.added && !item.removed;
    const isLastItem = item === last;
    if (neutral) {
      pushOrJoin(deletion, item.value, true, isLastItem);
      pushOrJoin(addition, item.value, true, isLastItem);
    } else if (item.removed) {
      pushOrJoin(deletion, item.value, false, isLastItem);
    } else {
      pushOrJoin(addition, item.value, false, isLastItem);
    }
  }
  return { deletion: piecesFromSpans(deletion), addition: piecesFromSpans(addition) };
}

type DiffWordLine = { op: "add" | "del" | "ctx"; text: string };

/** Zip deletions and additions inside each run of changed lines, by index. */
export function toolDiffLineWordPieces(
  lines: readonly DiffWordLine[],
): Array<ToolDiffWordPiece[] | null> {
  const pieces: Array<ToolDiffWordPiece[] | null> = lines.map(() => null);
  let index = 0;
  while (index < lines.length) {
    if (lines[index]?.op === "ctx") {
      index += 1;
      continue;
    }
    const start = index;
    while (index < lines.length && lines[index]?.op !== "ctx") index += 1;
    const deletions: number[] = [];
    const additions: number[] = [];
    for (let cursor = start; cursor < index; cursor += 1) {
      const line = lines[cursor];
      if (line?.op === "del") deletions.push(cursor);
      else if (line?.op === "add") additions.push(cursor);
    }
    const count = Math.min(deletions.length, additions.length);
    for (let pair = 0; pair < count; pair += 1) {
      const deletionIndex = deletions[pair];
      const additionIndex = additions[pair];
      if (deletionIndex == null || additionIndex == null) continue;
      const spanned = toolDiffWordPieces(
        lines[deletionIndex]?.text ?? "",
        lines[additionIndex]?.text ?? "",
      );
      if (!spanned) continue;
      pieces[deletionIndex] = spanned.deletion;
      pieces[additionIndex] = spanned.addition;
    }
  }
  return pieces;
}

/**
 * Expand tabs to Pierre's stop of 2, measured in code points from the start
 * of the line. A stop that the column already sits on advances a full stop.
 */
export function toolDiffExpandTabs(
  text: string,
  column = 0,
  tabSize = TOOL_DIFF_TAB_SIZE,
): { text: string; column: number } {
  let col = column;
  let out = "";
  for (const char of text) {
    if (char !== "\t") {
      out += char;
      col += 1;
      continue;
    }
    const spaces = tabSize - (col % tabSize);
    out += " ".repeat(spaces);
    col += spaces;
  }
  return { text: out, column: col };
}

/** Paint text for one row. Tabs expand across word pieces. An empty line keeps one space so the row stays one line tall. */
export function toolDiffVisiblePieces(
  pieces: readonly ToolDiffWordPiece[] | null,
  raw: string,
): ToolDiffWordPiece[] {
  const source =
    pieces != null && pieces.length > 0
      ? pieces
      : [{ text: raw.length > 0 ? raw : " ", changed: false }];
  let column = 0;
  return source.map((piece) => {
    const expanded = toolDiffExpandTabs(piece.text, column);
    column = expanded.column;
    if (expanded.text === piece.text) return piece;
    return { text: expanded.text, changed: piece.changed };
  });
}
