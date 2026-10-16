import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { normalizeFsPath, presentAgentTool, type ToolPresentation } from "@atmos/agent-transcript";

export const TURN_FILE_PREVIEW_COUNT = 3;

export type TurnFileChange = {
  path: string;
  additions: number;
  deletions: number;
};

const FILE_CHANGE_KINDS = new Set(["edit", "delete", "move"]);

/** Drop the empty line a trailing newline would invent. An empty string is no lines. */
function contentLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  return lines;
}

function lcsLength(left: string[], right: string[]): number {
  const rows = right.length + 1;
  let previous = new Array<number>(rows).fill(0);
  let current = new Array<number>(rows).fill(0);
  for (const line of left) {
    for (let index = 1; index < rows; index += 1) {
      current[index] =
        line === right[index - 1]
          ? previous[index - 1]! + 1
          : Math.max(previous[index]!, current[index - 1]!);
    }
    const swap = previous;
    previous = current;
    current = swap;
    current.fill(0);
  }
  return previous[right.length] ?? 0;
}

/** Line LCS: a line only on the new side is an addition, only on the old side a deletion. */
function lineDiffStats(
  oldContent: string,
  newContent: string,
): { additions: number; deletions: number } {
  const oldLines = contentLines(oldContent);
  const newLines = contentLines(newContent);
  const matched = lcsLength(oldLines, newLines);
  return {
    additions: newLines.length - matched,
    deletions: oldLines.length - matched,
  };
}

/** Same rules as web `countPatchStats`. */
function countPatchStats(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}

export function presentedTurnFileChange(presentation: ToolPresentation): TurnFileChange | null {
  switch (presentation.kind) {
    case "diff_stats":
      return presentation.path
        ? {
            path: presentation.path,
            additions: presentation.additions,
            deletions: presentation.deletions,
          }
        : null;
    case "patch": {
      if (!presentation.path) return null;
      const stats = countPatchStats(presentation.patch);
      return { path: presentation.path, ...stats };
    }
    case "code": {
      if (presentation.path == null) return null;
      if (presentation.hint !== "new" && presentation.hint !== "deleted") return null;
      const lines = contentLines(presentation.code).length;
      return presentation.hint === "new"
        ? { path: presentation.path, additions: lines, deletions: 0 }
        : { path: presentation.path, additions: 0, deletions: lines };
    }
    case "move":
      return presentation.to ? { path: presentation.to, additions: 0, deletions: 0 } : null;
    case "delete":
      return presentation.path ? { path: presentation.path, additions: 0, deletions: 0 } : null;
    default:
      return null;
  }
}

export function fileChangeName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || path;
}

export function collectTurnFileChanges(parts: AgentPart[]): TurnFileChange[] {
  const byPath = new Map<string, TurnFileChange>();

  const add = (path: string | null | undefined, additions: number, deletions: number) => {
    const trimmed = path?.trim();
    const key = normalizeFsPath(trimmed);
    if (!trimmed || !key) return;
    const prev = byPath.get(key);
    if (prev) {
      prev.additions += additions;
      prev.deletions += deletions;
      return;
    }
    byPath.set(key, { path: trimmed, additions, deletions });
  };

  for (const part of parts) {
    if (part.type !== "tool_call") continue;
    if (!FILE_CHANGE_KINDS.has(part.kind)) continue;
    const presentation = presentAgentTool(part).presentation;
    if (presentation.kind === "diff") {
      for (const file of presentation.files) {
        const stats = lineDiffStats(file.oldContent, file.newContent);
        add(file.path, stats.additions, stats.deletions);
      }
      continue;
    }
    const change = presentedTurnFileChange(presentation);
    if (!change) continue;
    add(change.path, change.additions, change.deletions);
  }

  return [...byPath.values()];
}

export function visibleTurnFileChanges<T>(
  changes: T[],
  expanded: boolean,
): { shown: T[]; hidden: number } {
  const hidden = Math.max(0, changes.length - TURN_FILE_PREVIEW_COUNT);
  if (hidden === 0 || expanded) return { shown: changes, hidden };
  return { shown: changes.slice(0, TURN_FILE_PREVIEW_COUNT), hidden };
}
