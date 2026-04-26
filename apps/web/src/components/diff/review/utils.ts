import { parsePatchFiles } from "@pierre/diffs";
import type { ReviewThreadDto } from "@/api/ws-api";

export function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function statusTone(status: string) {
  switch (status) {
    case "fixed":
    case "closed":
      return "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
    case "needs_user_check":
      return "text-amber-600 bg-amber-500/10 border-amber-500/20";
    case "dismissed":
    case "archived":
      return "text-muted-foreground bg-muted border-border";
    case "in_progress":
    case "running":
    case "finalizing":
      return "text-sky-600 bg-sky-500/10 border-sky-500/20";
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
      case "needs_user_check":
        return 1;
      case "in_progress":
        return 2;
      case "fixed":
        return 3;
      case "dismissed":
        return 4;
      default:
        return 5;
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
    return right.created_at.localeCompare(left.created_at);
  });
}

export const REVIEW_AGENT_STORAGE_KEY = "atmos.review.default_agent_id";
