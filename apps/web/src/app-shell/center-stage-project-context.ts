import type { Project, Workspace } from "@/shared/types/domain";
import { hostIdFromCenterKey } from "@/app-shell/center-space/center-space";

/**
 * Resolve the host project/workspace for a center context id.
 * Extra space paint ids (`host::space::id`) still map to the host workspace
 * path — spaces layer mosaics, they do not change the repo directory.
 */
export function resolveCenterStageProjectContext(
  projects: Project[],
  effectiveContextId: string | null,
): { currentProject: Project | undefined; currentWorkspace: Workspace | undefined } {
  if (!effectiveContextId) {
    return { currentProject: undefined, currentWorkspace: undefined };
  }
  const hostId = hostIdFromCenterKey(effectiveContextId);

  for (const project of projects) {
    const workspace = project.workspaces.find((row) => row.id === hostId);
    if (workspace) {
      return { currentProject: project, currentWorkspace: workspace };
    }
  }

  const project = projects.find((row) => row.id === hostId);
  return { currentProject: project, currentWorkspace: undefined };
}
