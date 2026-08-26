import type { WorkspaceSetupProgress } from "@/features/project/store/use-project-store";
import { isWorkspaceSetupBlocking } from "@/features/workspace/lib/workspace-setup";
import type { WorkspaceCreateJob } from "@/features/workspace/store/workspace-creation-store";

export type HeaderWorkspaceSetupItem = {
  id: string;
  workspaceId: string | null;
  job: WorkspaceCreateJob | null;
  progress: WorkspaceSetupProgress | null;
};

export function collectHeaderWorkspaceSetupItems(input: {
  jobs: WorkspaceCreateJob[];
  setupProgress: Record<string, WorkspaceSetupProgress>;
  currentWorkspaceId?: string | null;
}): HeaderWorkspaceSetupItem[] {
  const items: HeaderWorkspaceSetupItem[] = [];
  const seenWorkspaceIds = new Set<string>();

  for (const job of input.jobs) {
    const progress = job.workspaceId ? input.setupProgress[job.workspaceId] ?? null : null;
    if (
      !progress &&
      job.workspaceId &&
      job.workspaceId === input.currentWorkspaceId
    ) {
      seenWorkspaceIds.add(job.workspaceId);
      continue;
    }

    items.push({
      id: job.id,
      workspaceId: job.workspaceId,
      job,
      progress,
    });
    if (job.workspaceId) seenWorkspaceIds.add(job.workspaceId);
  }

  for (const [workspaceId, progress] of Object.entries(input.setupProgress)) {
    if (seenWorkspaceIds.has(workspaceId)) continue;
    items.push({
      id: `setup:${workspaceId}`,
      workspaceId,
      job: null,
      progress,
    });
  }

  return items;
}

export function isHeaderWorkspaceSetupReadyToOpen(item: HeaderWorkspaceSetupItem): boolean {
  if (!item.workspaceId) return false;
  if (isWorkspaceSetupBlocking(item.progress)) return false;
  if (!item.progress) return true;
  return item.progress.status === "completed";
}

export function visibleHeaderWorkspaceSetupItems(
  items: HeaderWorkspaceSetupItem[],
  currentWorkspaceId: string | null,
): HeaderWorkspaceSetupItem[] {
  if (items.length <= 1) return items;
  return items.filter(
    (item) =>
      !(item.workspaceId === currentWorkspaceId && isHeaderWorkspaceSetupReadyToOpen(item)),
  );
}

export const WORKSPACE_AUTO_ENTER_DELAY_MS = 5_000;
export const WORKSPACE_SETUP_AUTO_FINISH_DELAY_MS = 5_000;

export function getWorkspaceAutoEnterSeconds(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1_000));
}

export function selectHeaderWorkspaceSetupChipItem(
  items: HeaderWorkspaceSetupItem[],
  currentWorkspaceId: string | null,
): HeaderWorkspaceSetupItem | null {
  if (items.length === 0) return null;
  const pending = items.filter((item) => !isHeaderWorkspaceSetupReadyToOpen(item));
  const pool = pending.length > 0 ? pending : items;
  if (currentWorkspaceId) {
    const current = pool.find((item) => item.workspaceId === currentWorkspaceId);
    if (current) return current;
  }
  return pool[pool.length - 1] ?? null;
}
