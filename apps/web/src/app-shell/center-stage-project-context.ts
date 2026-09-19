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

/** `/project` vs `/workspace` href for a center host + one-shot tab deep link. */
export function buildCenterHostTabHref(
  hostId: string,
  projects: Project[],
  tabValue: string,
): string {
  const { currentWorkspace } = resolveCenterStageProjectContext(projects, hostId);
  const kind = currentWorkspace ? "workspace" : "project";
  const params = new URLSearchParams();
  params.set("id", hostId);
  params.set("tab", tabValue);
  return `/${kind}?${params.toString()}`;
}
