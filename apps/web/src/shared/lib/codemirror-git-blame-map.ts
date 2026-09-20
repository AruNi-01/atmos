import type { GitBlameRange } from "@/api/ws-api-types";

export function lookupBlameRange(
  ranges: readonly GitBlameRange[],
  line: number,
): GitBlameRange | null {
  for (const range of ranges) {
    if (line >= range.start_line && line <= range.end_line) {
      return range;
    }
  }
  return null;
}

function alignLines(saved: readonly string[], current: readonly string[]): Array<number | null> {
  const map: Array<number | null> = Array.from({ length: current.length }, () => null);
  let i = 0;
  let j = 0;
  while (i < saved.length && j < current.length) {
    if (saved[i] === current[j]) {
      map[j] = i;
      i += 1;
      j += 1;
      continue;
    }
    const ni = saved.indexOf(current[j] ?? "", i);
    const nj = current.indexOf(saved[i] ?? "", j);
    if (ni !== -1 && (nj === -1 || ni - i <= nj - j)) {
      map[j] = ni;
      i = ni + 1;
      j += 1;
    } else if (nj !== -1) {
      j += 1;
    } else {
      j += 1;
    }
  }
  return map;
}

export function remapBlameRangesForDoc(
  ranges: readonly GitBlameRange[],
  saved: string,
  current: string,
): GitBlameRange[] {
  if (saved === current) {
    return [...ranges];
  }
  const savedLines = saved.split("\n");
  const currentLines = current.split("\n");
  const alignment = alignLines(savedLines, currentLines);
  const perLine: Array<string | null> = currentLines.map((_, index) => {
    const diskIndex = alignment[index];
    if (diskIndex == null) return null;
    const diskLine = diskIndex + 1;
    return lookupBlameRange(ranges, diskLine)?.commit_hash ?? null;
  });

  const remapped: GitBlameRange[] = [];
  for (let i = 0; i < perLine.length; i += 1) {
    const hash = perLine[i] ?? null;
    const line = i + 1;
    const last = remapped[remapped.length - 1];
    if (last && last.commit_hash === hash && last.end_line + 1 === line) {
      last.end_line = line;
    } else {
      remapped.push({ start_line: line, end_line: line, commit_hash: hash });
    }
  }
  return remapped;
}
