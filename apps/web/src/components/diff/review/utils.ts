import { parsePatchFiles } from "@pierre/diffs";
import { formatLocalDateTime, parseUTCDate } from "@atmos/shared";
import type { ReviewThreadDto } from "@/api/ws-api";

export function isOpenReviewThreadStatus(status: string) {
  return status === "open" || status === "agent_fixed";
}

export function reviewThreadStatusLabel(status: string) {
  switch (status) {
    case "open":
      return "Open";
    case "agent_fixed":
      return "Agent Fixed";
    case "fixed":
      return "Fixed";
    case "dismissed":
      return "Dismissed";
    default:
      return status.replaceAll("_", " ");
  }
}

export function compareReviewTimestamps(left: string, right: string) {
  return parseUTCDate(left).getTime() - parseUTCDate(right).getTime();
}

export function formatReviewDateTime(value: string | null | undefined) {
  if (!value) return "Unknown";
  try {
    return formatLocalDateTime(value, "MMM d, HH:mm");
  } catch {
    return value;
  }
}

export function statusTone(status: string) {
  switch (status) {
    case "open":
      return "text-blue-600 bg-blue-500/10 border-blue-500/20";
    case "agent_fixed":
      return "text-amber-600 bg-amber-500/10 border-amber-500/20";
    case "fixed":
      return "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
    case "dismissed":
      return "text-muted-foreground bg-muted border-border";
    default:
      return "text-foreground bg-muted/50 border-border";
  }
}

export function sessionStatusTone(status: string) {
  switch (status) {
    case "active":
      return "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
    case "closed":
      return "text-muted-foreground bg-muted border-border";
    case "archived":
      return "text-amber-600 bg-amber-500/10 border-amber-500/20";
    default:
      return "text-foreground bg-muted/50 border-border";
  }
}

export function isPatchRenderable(patch: string) {
  try {
    return parsePatchFiles(patch).length > 0;
  } catch {
    return false;
  }
}

export function threadTitle(thread: ReviewThreadDto) {
  if (thread.title?.trim()) return thread.title.trim();
  if (thread.anchor_start_line === thread.anchor_end_line) {
    return `Comment on L${thread.anchor_start_line}`;
  }
  return `Comment on L${thread.anchor_start_line}-${thread.anchor_end_line}`;
}

export function sortThreads(
  threads: ReviewThreadDto[],
  currentFileSnapshotGuid: string | null,
) {
  const statusRank = (status: string) => {
    switch (status) {
      case "open":
        return 0;
      case "agent_fixed":
        return 1;
      case "fixed":
        return 2;
      case "dismissed":
        return 3;
      default:
        return 4;
    }
  };

  return [...threads].sort((left, right) => {
    const leftCurrent =
      left.file_snapshot_guid === currentFileSnapshotGuid ? 0 : 1;
    const rightCurrent =
      right.file_snapshot_guid === currentFileSnapshotGuid ? 0 : 1;
    if (leftCurrent !== rightCurrent) return leftCurrent - rightCurrent;
    const leftStatus = statusRank(left.status);
    const rightStatus = statusRank(right.status);
    if (leftStatus !== rightStatus) return leftStatus - rightStatus;
    return compareReviewTimestamps(right.created_at, left.created_at);
  });
}

export const REVIEW_AGENT_STORAGE_KEY = "atmos.review.default_agent_id";
