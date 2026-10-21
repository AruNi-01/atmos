export const PROJECT_ROW_LABEL = "Project";

export function recentEntrySubtitle(entry: {
  kind: "project" | "workspace";
  projectName: string;
}): string {
  if (entry.kind === "project") return PROJECT_ROW_LABEL;
  return entry.projectName.trim();
}

/** Branch from bootstrap, plus the web list's `+N` uncommitted count when it is positive. */
export function projectGroupWorkspaceSubtitle(input: {
  branch: string;
  uncommitted?: number | null;
}): string {
  const branch = input.branch.trim() || "No branch";
  const count = input.uncommitted;
  if (typeof count === "number" && Number.isFinite(count) && count > 0) {
    return `${branch} · +${count}`;
  }
  return branch;
}

/**
 * Project kind label, then the repo's current branch from `git_get_status_batch`.
 * Until that branch exists, the workspace count already on the section keeps the line non-empty.
 */
export function projectGroupProjectSubtitle(input: {
  currentBranch?: string | null;
  workspaceCount: number;
}): string {
  const branch = input.currentBranch?.trim();
  if (branch) return `${PROJECT_ROW_LABEL} · ${branch}`;
  if (input.workspaceCount === 1) return `${PROJECT_ROW_LABEL} · 1 workspace`;
  if (input.workspaceCount > 1) {
    return `${PROJECT_ROW_LABEL} · ${input.workspaceCount} workspaces`;
  }
  return PROJECT_ROW_LABEL;
}
