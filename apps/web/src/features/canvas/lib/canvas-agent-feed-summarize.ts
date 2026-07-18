import type {
  CanvasAgentFeedEntry,
  CanvasAgentFeedScreenshot,
} from "./canvas-agent-feed";
import type { CanvasAgentFeedKind } from "./canvas-agent-feed-labels";

export interface SummarizedFeedRow {
  id: string;
  label: string;
  kind: CanvasAgentFeedKind;
  count: number;
  status: CanvasAgentFeedEntry["status"];
  /** Latest timestamp among merged entries. */
  time: number;
  /** Screenshot thumb for a successful capture row (not merged). */
  screenshot?: CanvasAgentFeedScreenshot | null;
  command?: string;
}

/** Merge consecutive identical labels (agent often issues many `create-*` in a row). */
export function summarizeConsecutiveEntries(
  entries: readonly CanvasAgentFeedEntry[],
): SummarizedFeedRow[] {
  const rows: SummarizedFeedRow[] = [];

  for (const entry of entries) {
    const time = entry.completedAt ?? entry.startedAt;
    const last = rows.at(-1);
    // Never merge screenshot rows — each keeps its own thumbnail.
    const isScreenshot =
      normalizeVerb(entry.command) === "screenshot" || Boolean(entry.screenshot);
    const canMerge =
      last &&
      !isScreenshot &&
      !last.screenshot &&
      last.label === entry.label &&
      last.kind === entry.kind;

    if (canMerge && last) {
      last.count += 1;
      if (entry.status === "active") last.status = "active";
      else if (entry.status === "error") last.status = "error";
      if (time >= last.time) last.time = time;
      continue;
    }
    rows.push({
      id: entry.requestId,
      label: entry.label,
      kind: entry.kind,
      count: 1,
      status: entry.status,
      time,
      screenshot: entry.screenshot ?? null,
      command: entry.command,
    });
  }

  return rows;
}

function normalizeVerb(command: string): string {
  return command.trim().toLowerCase().replace(/_/g, "-");
}
