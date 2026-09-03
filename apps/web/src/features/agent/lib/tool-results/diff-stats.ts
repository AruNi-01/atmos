import { parseDiffFromFile, type FileContents } from "@pierre/diffs";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { presentAgentTool, type ToolPresentation } from "@/features/agent/lib/tool-results/parse-tool-result";

export type DiffLineStats = {
  additions: number;
  deletions: number;
};

export type DiffLineRange = {
  startLine: number;
  endLine: number;
};

const EMPTY_STATS: DiffLineStats = { additions: 0, deletions: 0 };

export function countPatchStats(patch: string): DiffLineStats {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}

export function countFileDiffStats(
  oldContent: string,
  newContent: string,
  path = "file",
): DiffLineStats {
  try {
    const oldFile: FileContents = { name: path, contents: oldContent };
    const newFile: FileContents = { name: path, contents: newContent };
    const diff = parseDiffFromFile(oldFile, newFile);
    return diff.hunks.reduce(
      (sum, hunk) => ({
        additions: sum.additions + hunk.additionLines,
        deletions: sum.deletions + hunk.deletionLines,
      }),
      { ...EMPTY_STATS },
    );
  } catch {
    return { ...EMPTY_STATS };
  }
}

function countCodeLines(code: string): number {
  if (!code) return 0;
  return code.split("\n").length - (code.endsWith("\n") ? 1 : 0);
}

export function mergeDiffLineRanges(ranges: DiffLineRange[]): DiffLineRange[] {
  if (ranges.length <= 1) return ranges;
  const sorted = [...ranges].sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
  const merged: DiffLineRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.startLine <= last.endLine + 1) {
      last.endLine = Math.max(last.endLine, range.endLine);
      continue;
    }
    merged.push({ ...range });
  }
  return merged;
}

type PierreHunkPart = {
  type?: string;
  additions?: number;
  additionLineIndex?: number;
};

type PierreHunk = {
  hunkContent?: PierreHunkPart[];
};

export function changedLineRangesFromContents(
  oldContent: string,
  newContent: string,
  path = "file",
): DiffLineRange[] {
  if (!newContent) return [];
  if (!oldContent) {
    const lines = countCodeLines(newContent);
    return lines > 0 ? [{ startLine: 1, endLine: lines }] : [];
  }
  try {
    const diff = parseDiffFromFile(
      { name: path, contents: oldContent },
      { name: path, contents: newContent },
    );
    const ranges: DiffLineRange[] = [];
    for (const hunk of (diff.hunks ?? []) as PierreHunk[]) {
      for (const part of hunk.hunkContent ?? []) {
        if (part.type !== "change") continue;
        const additions = part.additions ?? 0;
        if (additions <= 0) continue;
        const startLine = (part.additionLineIndex ?? 0) + 1;
        ranges.push({ startLine, endLine: startLine + additions - 1 });
      }
    }
    return mergeDiffLineRanges(ranges);
  } catch {
    return [];
  }
}

export function changedLineRangesFromPatch(patch: string): DiffLineRange[] {
  const ranges: DiffLineRange[] = [];
  let newLine = 0;
  let inHunk = false;
  for (const line of patch.split("\n")) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (header) {
      newLine = Number(header[1]);
      inHunk = true;
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (!inHunk) continue;
    if (line.startsWith("+")) {
      ranges.push({ startLine: newLine, endLine: newLine });
      newLine += 1;
      continue;
    }
    if (line.startsWith("-")) continue;
    if (line.startsWith("\\")) continue;
    newLine += 1;
  }
  return mergeDiffLineRanges(ranges);
}

export function changedLineRangesForPresentation(
  presentation: ToolPresentation,
  path?: string | null,
): DiffLineRange[] {
  if (presentation.kind === "diff") {
    const files = path
      ? presentation.files.filter((file) => file.path === path)
      : presentation.files;
    return mergeDiffLineRanges(
      files.flatMap((file) => changedLineRangesFromContents(file.oldContent, file.newContent, file.path)),
    );
  }
  if (presentation.kind === "patch") {
    return changedLineRangesFromPatch(presentation.patch);
  }
  if (presentation.kind === "code" && presentation.hint === "new") {
    const lines = countCodeLines(presentation.code);
    return lines > 0 ? [{ startLine: 1, endLine: lines }] : [];
  }
  return [];
}

export function diffStatsForPresentation(presentation: ToolPresentation): DiffLineStats {
  if (presentation.kind === "diff") {
    return presentation.files.reduce((sum, file) => {
      const next = countFileDiffStats(file.oldContent, file.newContent, file.path);
      return {
        additions: sum.additions + next.additions,
        deletions: sum.deletions + next.deletions,
      };
    }, { ...EMPTY_STATS });
  }
  if (presentation.kind === "patch") {
    return countPatchStats(presentation.patch);
  }
  if (presentation.kind === "code" && presentation.hint === "new") {
    return { additions: countCodeLines(presentation.code), deletions: 0 };
  }
  if (presentation.kind === "code" && presentation.hint === "deleted") {
    return { additions: 0, deletions: countCodeLines(presentation.code) };
  }
  return { ...EMPTY_STATS };
}

export function sumToolGroupDiffStats(parts: AgentToolCallPart[]): DiffLineStats {
  return parts.reduce((sum, part) => {
    if (part.kind !== "edit") return sum;
    if (part.result?.type === "diff_stats") {
      return {
        additions: sum.additions + part.result.additions,
        deletions: sum.deletions + part.result.deletions,
      };
    }
    const parsed = presentAgentTool(part);
    const next = diffStatsForPresentation(parsed.presentation);
    return {
      additions: sum.additions + next.additions,
      deletions: sum.deletions + next.deletions,
    };
  }, { ...EMPTY_STATS });
}
