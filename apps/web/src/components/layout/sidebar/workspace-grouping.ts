import type { Project, Workspace, WorkspaceWorkflowStatus } from "@/types/types";
import type { SidebarGroupingMode } from "./workspace-status";
import { getWorkspaceWorkflowStatusMeta } from "./workspace-status";

export type FlattenedWorkspaceEntry = {
  projectId: string;
  projectName: string;
  projectPath: string;
  workspace: Workspace;
};

export type WorkspaceGroup = {
  key: string;
  label: string;
  items: FlattenedWorkspaceEntry[];
};

export function flattenProjectWorkspaces(projects: Project[]): FlattenedWorkspaceEntry[] {
  return projects.flatMap((project) =>
    project.workspaces.map((workspace) => ({
      projectId: project.id,
      projectName: project.name,
      projectPath: project.mainFilePath,
      workspace,
    })),
  );
}

function getRecencySource(workspace: Workspace): string {
  return workspace.lastVisitedAt ?? workspace.createdAt;
}

function getRecencyTimestamp(workspace: Workspace): number {
  const source = getRecencySource(workspace);
  return source ? new Date(source).getTime() : 0;
}

function startOfDay(input: Date): Date {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate());
}

function getTimeGroup(source: Date, now: Date): { key: string; label: string } {
  const today = startOfDay(now).getTime();
  const sourceDay = startOfDay(source).getTime();
  const diffDays = Math.floor((today - sourceDay) / 86400000);

  if (diffDays <= 0) return { key: "today", label: "Today" };
  if (diffDays === 1) return { key: "yesterday", label: "Yesterday" };
  if (diffDays < 7) return { key: "last_7_days", label: "Last 7 Days" };
  if (diffDays < 30) return { key: "last_30_days", label: "Last 30 Days" };
  return { key: "older", label: "Older" };
}

export function getWorkspaceTimeGroupLabel(workspace: Workspace, now = new Date()): string {
  return getTimeGroup(new Date(getRecencySource(workspace)), now).label;
}

function sortEntriesByRecency(items: FlattenedWorkspaceEntry[]): FlattenedWorkspaceEntry[] {
  return [...items].sort((a, b) => {
    const aPinned = a.workspace.isPinned ? 1 : 0;
    const bPinned = b.workspace.isPinned ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return getRecencyTimestamp(b.workspace) - getRecencyTimestamp(a.workspace);
  });
}

export function groupWorkspaces(
  items: FlattenedWorkspaceEntry[],
  groupingMode: Exclude<SidebarGroupingMode, "project">,
): WorkspaceGroup[] {
  if (groupingMode === "status") {
    const STATUS_ORDER: WorkspaceWorkflowStatus[] = [
      "backlog",
      "todo",
      "in_progress",
      "in_review",
      "blocked",
      "completed",
      "canceled",
    ];

    const grouped = new Map<WorkspaceWorkflowStatus, FlattenedWorkspaceEntry[]>();

    for (const item of sortEntriesByRecency(items)) {
      const bucket = grouped.get(item.workspace.workflowStatus) ?? [];
      bucket.push(item);
      grouped.set(item.workspace.workflowStatus, bucket);
    }

    return STATUS_ORDER.map((status) => ({
      key: status,
      label: getWorkspaceWorkflowStatusMeta(status).label,
      items: grouped.get(status) ?? [],
    }));
  }

  const now = new Date();
  const grouped = new Map<string, WorkspaceGroup>();

  for (const item of sortEntriesByRecency(items)) {
    const source = new Date(getRecencySource(item.workspace));
    const group = getTimeGroup(source, now);
    const existing = grouped.get(group.key);
    if (existing) {
      existing.items.push(item);
    } else {
      grouped.set(group.key, {
        key: group.key,
        label: group.label,
        items: [item],
      });
    }
  }

  return [
    "today",
    "yesterday",
    "last_7_days",
    "last_30_days",
    "older",
  ]
    .map((key) => grouped.get(key))
    .filter((group): group is WorkspaceGroup => !!group);
}
