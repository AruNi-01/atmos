export const PROJECT_ROW_LABEL = "Project";

export function recentEntrySubtitle(entry: {
  kind: "project" | "workspace";
  projectName: string;
}): string {
  if (entry.kind === "project") return PROJECT_ROW_LABEL;
  return entry.projectName.trim();
}

/** Branch from the workspace, or from `git_get_status_batch` when the model is blank. */
export function projectGroupWorkspaceSubtitle(input: { branch: string }): string {
  return input.branch.trim() || "No branch";
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
