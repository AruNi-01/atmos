import type { TaskWorkspaceLinearDraft } from "@/features/task/store/task-workspace-draft-store";

/** sessionStorage key for Linear issue snapshot across Task → Create workspace. */
export const PENDING_LINEAR_LINK_STORAGE_KEY = "atmos.pendingLinearLink";

export function writePendingLinearLink(
  issue: TaskWorkspaceLinearDraft,
): void {
  try {
    sessionStorage.setItem(
      PENDING_LINEAR_LINK_STORAGE_KEY,
      JSON.stringify(issue),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function readPendingLinearLinkRaw(): string | null {
  try {
    return sessionStorage.getItem(PENDING_LINEAR_LINK_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingLinearLink(): void {
  try {
    sessionStorage.removeItem(PENDING_LINEAR_LINK_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
