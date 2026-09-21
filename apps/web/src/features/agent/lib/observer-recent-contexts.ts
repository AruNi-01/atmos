import type { Project } from "@/shared/types/domain";

export const OBSERVER_RECENT_CONTEXT_LIMIT = 5;

export type ObserverRecentContextKind = "project" | "workspace";

export type ObserverRecentContext = {
  id: string;
  kind: ObserverRecentContextKind;
  name: string;
  projectName?: string;
  label: string;
  visitedAt: number;
};

function visitedAt(iso: string | undefined): number {
  if (!iso) return 0;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : 0;
}

function workspaceLabel(workspaceName: string, projectName: string): string {
  return `${workspaceName} / ${projectName}`;
}

export function recentObserverChatContexts(
  projects: Project[],
  limit = OBSERVER_RECENT_CONTEXT_LIMIT,
): ObserverRecentContext[] {
  const items: ObserverRecentContext[] = [];
  for (const project of projects) {
    items.push({
      id: project.id,
      kind: "project",
      name: project.name,
      label: project.name,
      visitedAt: visitedAt(project.lastVisitedAt ?? project.createdAt),
    });
    for (const workspace of project.workspaces) {
      if (workspace.isArchived) continue;
      const name = workspace.displayName?.trim() || workspace.name;
      items.push({
        id: workspace.id,
        kind: "workspace",
        name,
        projectName: project.name,
        label: workspaceLabel(name, project.name),
        visitedAt: visitedAt(workspace.lastVisitedAt ?? workspace.createdAt),
      });
    }
  }
  items.sort((left, right) => {
    if (right.visitedAt !== left.visitedAt) return right.visitedAt - left.visitedAt;
    return left.label.localeCompare(right.label);
  });
  return items.slice(0, Math.max(0, limit));
}
