export interface WorkspaceGitStatusTarget {
  id: string;
  localPath: string;
}

export interface WorkspaceGitStatusFanOut {
  paths: string[];
  workspaceIdsByPath: Map<string, string[]>;
}

export function buildWorkspaceGitStatusFanOut(
  workspaces: readonly WorkspaceGitStatusTarget[],
): WorkspaceGitStatusFanOut {
  const paths: string[] = [];
  const workspaceIdsByPath = new Map<string, string[]>();

  for (const workspace of workspaces) {
    const workspaceIds = workspaceIdsByPath.get(workspace.localPath);
    if (workspaceIds) {
      workspaceIds.push(workspace.id);
      continue;
    }

    paths.push(workspace.localPath);
    workspaceIdsByPath.set(workspace.localPath, [workspace.id]);
  }

  return { paths, workspaceIdsByPath };
}
