import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import {
  changedLineRangesFromContents,
  changedLineRangesFromPatch,
  countFileDiffStats,
  countPatchStats,
  diffStatsForPresentation,
  type DiffLineRange,
} from "@/features/agent/lib/tool-results/diff-stats";
import { parseToolResult } from "@/features/agent/lib/tool-results/parse-tool-result";

export type TurnFileChange = {
  path: string;
  additions: number;
  deletions: number;
  selectRanges: DiffLineRange[];
};

const FILE_CHANGE_KINDS = new Set(["edit", "delete", "move"]);

type Acc = TurnFileChange & {
  oldContent?: string;
  newContent?: string;
  patch?: string;
};

function parseToolPart(part: AgentToolCallPart) {
  return parseToolResult({
    tool: part.name,
    description: part.title ?? undefined,
    status: part.status ?? undefined,
    raw_input: part.input,
    content: Array.isArray(part.content) ? part.content as never : undefined,
    raw_output: part.output,
  });
}

function pathKey(path: string): string {
  return path.trim().replace(/\\/g, "/");
}

function pathFromPatch(patch: string): string | null {
  for (const line of patch.split("\n")) {
    if (!line.startsWith("+++ ")) continue;
    const raw = line.slice(4).trim();
    if (!raw || raw === "/dev/null") continue;
    return raw.replace(/^[ab]\//, "");
  }
  return null;
}

function finalizeRanges(item: Acc): DiffLineRange[] {
  if (item.oldContent != null && item.newContent != null) {
    return changedLineRangesFromContents(item.oldContent, item.newContent, item.path);
  }
  if (item.patch) return changedLineRangesFromPatch(item.patch);
  return item.selectRanges;
}

export function collectTurnFileChanges(
  parts: AgentPart[],
  options?: { includeRanges?: boolean },
): TurnFileChange[] {
  const byPath = new Map<string, Acc>();

  const add = (
    path: string | null | undefined,
    additions: number,
    deletions: number,
    extra?: { oldContent?: string; newContent?: string; patch?: string; selectRanges?: DiffLineRange[] },
  ) => {
    const trimmed = path?.trim();
    if (!trimmed) return;
    const key = pathKey(trimmed);
    const prev = byPath.get(key);
    if (prev) {
      prev.additions += additions;
      prev.deletions += deletions;
      if (extra?.oldContent != null && prev.oldContent == null) prev.oldContent = extra.oldContent;
      if (extra?.newContent != null) prev.newContent = extra.newContent;
      if (extra?.patch) prev.patch = extra.patch;
      return;
    }
    byPath.set(key, {
      path: trimmed,
      additions,
      deletions,
      selectRanges: extra?.selectRanges ?? [],
      oldContent: extra?.oldContent,
      newContent: extra?.newContent,
      patch: extra?.patch,
    });
  };

  for (const part of parts) {
    if (part.type !== "tool_call") continue;
    if (!FILE_CHANGE_KINDS.has(part.kind ?? "")) continue;
    const parsed = parseToolPart(part);
    const presentation = parsed.presentation;
    if (presentation.kind === "diff") {
      for (const file of presentation.files) {
        const stats = countFileDiffStats(file.oldContent, file.newContent, file.path);
        add(file.path, stats.additions, stats.deletions, {
          oldContent: file.oldContent,
          newContent: file.newContent,
        });
      }
      continue;
    }
    if (presentation.kind === "patch") {
      const stats = countPatchStats(presentation.patch);
      add(
        presentation.path ?? parsed.path ?? pathFromPatch(presentation.patch),
        stats.additions,
        stats.deletions,
        { patch: presentation.patch },
      );
      continue;
    }
    if (presentation.kind === "code" && (presentation.hint === "new" || presentation.hint === "deleted")) {
      const stats = diffStatsForPresentation(presentation);
      add(presentation.path ?? parsed.path, stats.additions, stats.deletions, {
        oldContent: presentation.hint === "new" ? "" : presentation.code,
        newContent: presentation.hint === "new" ? presentation.code : "",
      });
      continue;
    }
    if (presentation.kind === "delete") {
      add(presentation.path, 0, 0);
      continue;
    }
    if (presentation.kind === "move") {
      add(presentation.to, 0, 0);
      continue;
    }
    if (parsed.path) {
      const stats = diffStatsForPresentation(presentation);
      add(parsed.path, stats.additions, stats.deletions);
    }
  }

  const includeRanges = options?.includeRanges !== false;
  return [...byPath.values()].map((item) => ({
    path: item.path,
    additions: item.additions,
    deletions: item.deletions,
    selectRanges: includeRanges ? finalizeRanges(item) : [],
  }));
}

export function selectRangesForTurnFile(parts: AgentPart[], path: string): DiffLineRange[] {
  const key = pathKey(path);
  const match = collectTurnFileChanges(parts).find((item) => pathKey(item.path) === key);
  return match?.selectRanges ?? [];
}
