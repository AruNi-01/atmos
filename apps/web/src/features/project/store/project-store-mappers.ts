import type { Project, Workspace, WorkspacePriority, WorkspaceWorkflowStatus } from "@/shared/types/domain";
import type { ProjectModel, WorkspaceModel } from "@/api/ws-api";

// Sort workspaces: pinned first (by pinOrder ASC), then by createdAt DESC.
export function sortWorkspaces(workspaces: Workspace[]): Workspace[] {
  return [...workspaces].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    if (a.isPinned && b.isPinned) {
      const aOrder = a.pinOrder;
      const bOrder = b.pinOrder;
      if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      if (aOrder !== undefined && bOrder === undefined) return -1;
      if (aOrder === undefined && bOrder !== undefined) return 1;

      const aTime = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
      const bTime = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.id.localeCompare(b.id);
    }

    const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bCreated - aCreated;
  });
}

export function mapProjectModel(model: ProjectModel, workspaces: Workspace[] = []): Project {
  return {
    id: model.guid,
    name: model.name,
    isOpen: true,
    workspaces,
    mainFilePath: model.main_file_path,
    sidebarOrder: model.sidebar_order,
    borderColor: model.border_color ?? undefined,
    logoPath: model.logo_path,
    targetBranch: model.target_branch ?? undefined,
  };
}

export function mapWorkspaceModel(model: WorkspaceModel): Workspace {
  return {
    id: model.guid,
    name: model.name,
    displayName: model.display_name ?? undefined,
    branch: model.branch,
    baseBranch: model.base_branch,
    isActive: false,
    status: "clean",
    projectId: model.project_guid,
    isPinned: model.is_pinned,
    pinnedAt: model.pinned_at ?? undefined,
    pinOrder: model.pin_order ?? undefined,
    isArchived: model.is_archived,
    archivedAt: model.archived_at ?? undefined,
    createdAt: model.created_at,
    lastVisitedAt: model.last_visited_at ?? undefined,
    workflowStatus: model.workflow_status as WorkspaceWorkflowStatus,
    priority: model.priority as WorkspacePriority,
    labels: (model.labels ?? []).map((label) => ({
      id: label.guid,
      name: label.name,
      color: label.color,
      source: (label.source as "manual" | "gitHub_issue" | "gitHub_pr") || "manual",
    })),
    localPath: model.local_path,
    githubIssue: model.github_issue,
    githubPr: model.github_pr,
    createSource: model.create_source === "issue_only" ? "issue_only" : "manual",
  };
}
