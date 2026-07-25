import type { Group, Project, Workspace } from "@/shared/types/domain";
import type { FlattenedWorkspaceEntry } from "@/app-shell/sidebar/workspace-grouping";

export const UNGROUPED_USER_GROUP_KEY = "__ungrouped__";

export type UserGroupView = {
  key: string;
  label: string;
  groupId: string | null;
  /** Projects that are members of this group (full project with all workspaces). */
  projects: Project[];
  /** Workspaces that are direct members of this group. */
  directWorkspaces: FlattenedWorkspaceEntry[];
};

function workspaceEntry(
  project: Project,
  workspace: Workspace,
): FlattenedWorkspaceEntry {
  return {
    projectId: project.id,
    projectName: project.name,
    projectPath: project.mainFilePath,
    workspace,
  };
}

/**
 * Build sidebar views for `groupingMode === "group"`.
 *
 * - Projects with a project membership appear under that group (with all workspaces).
 * - Workspaces with a workspace membership appear as direct members (dual visibility).
 * - Projects without membership appear under Ungrouped.
 */
export function buildUserGroupViews(
  groups: Group[],
  projects: Project[],
  ungroupedLabel: string,
): UserGroupView[] {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const projectGroupById = new Map<string, string>();
  const workspaceGroupById = new Map<string, string>();

  for (const group of groups) {
    for (const member of group.members) {
      if (member.memberType === "project") {
        projectGroupById.set(member.memberId, group.id);
      } else if (member.memberType === "workspace") {
        workspaceGroupById.set(member.memberId, group.id);
      }
    }
  }

  const views: UserGroupView[] = groups
    .slice()
    .sort((a, b) => a.sidebarOrder - b.sidebarOrder)
    .map((group) => {
      const projectMembers = group.members
        .filter((member) => member.memberType === "project")
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((member) => projectsById.get(member.memberId))
        .filter((project): project is Project => Boolean(project));

      const directWorkspaces = group.members
        .filter((member) => member.memberType === "workspace")
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .flatMap((member) => {
          for (const project of projects) {
            const workspace = project.workspaces.find(
              (ws) => ws.id === member.memberId && !ws.isArchived,
            );
            if (workspace) {
              return [workspaceEntry(project, workspace)];
            }
          }
          return [];
        });

      return {
        key: group.id,
        label: group.name,
        groupId: group.id,
        projects: projectMembers,
        directWorkspaces,
      };
    });

  const ungroupedProjects = projects
    .filter((project) => !projectGroupById.has(project.id))
    .slice()
    .sort((a, b) => a.sidebarOrder - b.sidebarOrder);

  views.push({
    key: UNGROUPED_USER_GROUP_KEY,
    label: ungroupedLabel,
    groupId: null,
    projects: ungroupedProjects,
    directWorkspaces: [],
  });

  return views;
}

export function findGroupIdForMember(
  groups: Group[],
  memberType: "project" | "workspace",
  memberId: string,
): string | null {
  for (const group of groups) {
    if (
      group.members.some(
        (member) =>
          member.memberType === memberType && member.memberId === memberId,
      )
    ) {
      return group.id;
    }
  }
  return null;
}

export type GroupedProjectWorkspace = {
  workspaceId: string;
  workspaceName: string;
  groupId: string;
  groupName: string;
};

/**
 * Workspaces under `project` that have their own group membership
 * (direct workspace membership — not inherited via project).
 */
export function findGroupedWorkspacesForProject(
  groups: Group[],
  project: Project,
): GroupedProjectWorkspace[] {
  const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
  const result: GroupedProjectWorkspace[] = [];

  for (const workspace of project.workspaces) {
    if (workspace.isArchived) continue;
    const groupId = findGroupIdForMember(groups, "workspace", workspace.id);
    if (!groupId) continue;
    result.push({
      workspaceId: workspace.id,
      workspaceName: workspace.displayName?.trim() || workspace.name,
      groupId,
      groupName: groupNameById.get(groupId) ?? groupId,
    });
  }

  return result;
}

export function countUserGroupItems(view: UserGroupView): number {
  return view.projects.length + view.directWorkspaces.length;
}
