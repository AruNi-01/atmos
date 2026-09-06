import type { FileDiffLine } from "./file-diff-gift-types";

/** Truncate diff rows so only the first `charCount` characters of joined content remain. */
export function truncateFileDiffLines(
  lines: FileDiffLine[],
  charCount: number,
): FileDiffLine[] {
  if (charCount <= 0) return [];
  let remaining = charCount;
  const out: FileDiffLine[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (remaining <= 0) break;
    if (remaining >= line.content.length) {
      out.push(line);
      remaining -= line.content.length;
      if (index < lines.length - 1) remaining -= 1;
      continue;
    }
    out.push({
      ...line,
      id: `${line.id}:partial`,
      content: line.content.slice(0, remaining),
    });
    break;
  }
  return out;
}
