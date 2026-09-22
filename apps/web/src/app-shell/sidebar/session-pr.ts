import type { Workspace } from "@/shared/types/domain";
import { pickBranchHeadPr } from "@/features/github/hooks/use-workspace-pr-status";
import {
  normalizePrLifecycleState,
  type WorkspacePrLifecycleState,
} from "@/features/github/lib/workspace-pr-status";
import type { SidebarSessionRow } from "@/app-shell/sidebar/session-grouping";

type HeadPrLike = {
  number: number;
  state?: string | null;
  title?: string | null;
  head_ref?: string | null;
  headRefName?: string | null;
  is_draft?: boolean | null;
  isDraft?: boolean | null;
};

export function resolveSessionPrLifecycle(
  workspace: Workspace | null,
  branchPrs?: readonly HeadPrLike[] | null,
): WorkspacePrLifecycleState | null {
  if (!workspace) return null;
  const live = pickBranchHeadPr(branchPrs ? [...branchPrs] : [], workspace.branch);
  if (live) {
    return normalizePrLifecycleState(
      live.state,
      Boolean(live.is_draft ?? live.isDraft),
    );
  }
  const stored = workspace.githubPr;
  if (!stored) return null;
  const match = pickBranchHeadPr([stored], workspace.branch);
  if (!match) return null;
  return normalizePrLifecycleState(match.state, Boolean(match.is_draft));
}

export type SessionBranchPrTarget = {
  key: string;
  owner: string;
  repo: string;
  branch: string;
};

/** Unique owner/repo/branch pairs that already have a stored GitHub remote. */
export function sessionBranchPrTargets(
  rows: readonly SidebarSessionRow[],
): SessionBranchPrTarget[] {
  const targets = new Map<string, SessionBranchPrTarget>();
  for (const row of rows) {
    const owner = row.workspace?.githubPr?.owner?.trim();
    const repo = row.workspace?.githubPr?.repo?.trim();
    const branch = row.workspace?.branch?.trim();
    if (!owner || !repo || !branch) continue;
    const key = `${owner}/${repo}/${branch}`;
    if (!targets.has(key)) targets.set(key, { key, owner, repo, branch });
  }
  return [...targets.values()].sort((a, b) => a.key.localeCompare(b.key));
}
