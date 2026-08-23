import type { AgentSurfaceFeedEntry, AgentSurfaceFeedScreenshot } from "./agent-surface-feed";
import type { AgentSurfaceFeedKind } from "./agent-surface-feed";

export interface SummarizedFeedRow {
  id: string;
  label: string;
  kind: AgentSurfaceFeedKind;
  count: number;
  status: AgentSurfaceFeedEntry["status"];
  time: number;
  screenshot?: AgentSurfaceFeedScreenshot | null;
  command?: string;
}

function isScreenshotEntry(entry: AgentSurfaceFeedEntry): boolean {
  if (entry.screenshot) return true;
  const command = entry.command.trim().toLowerCase().replace(/_/g, "-");
  return command === "screenshot" || command === "pt-screenshot";
}

/** Merge consecutive identical labels (agent often issues many creates in a row). */
export function summarizeConsecutiveEntries(
  entries: readonly AgentSurfaceFeedEntry[],
): SummarizedFeedRow[] {
  const rows: SummarizedFeedRow[] = [];

  for (const entry of entries) {
    const time = entry.completedAt ?? entry.startedAt;
    const last = rows.at(-1);
    const isScreenshot = isScreenshotEntry(entry);
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
