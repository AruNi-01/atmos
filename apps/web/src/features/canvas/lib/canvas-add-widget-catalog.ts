import { SquareTerminal } from "lucide-react";

import type { Project, Workspace } from "@/shared/types/domain";
import type { CanvasContextRef } from "@/features/canvas/lib/canvas-widget-shape";
import {
  ADDABLE_CANVAS_WIDGET_TYPES,
  CANVAS_WIDGET_REGISTRY,
  type AddableCanvasWidgetType,
} from "@/features/canvas/lib/canvas-widget-registry";
import { CANVAS_TERMINAL_DEFAULT_SIZE } from "@/features/canvas/lib/canvas-terminal-shape";

/**
 * Shared catalog + context-option builders for "add widget" surfaces
 * (full dialog and empty-brush compact popover).
 */

export const CANVAS_TERMINAL_ADD_ITEM_TYPE = "terminal" as const;

export type AddableCanvasItemType =
  | AddableCanvasWidgetType
  | typeof CANVAS_TERMINAL_ADD_ITEM_TYPE;

export const CANVAS_TERMINAL_ADD_ITEM = {
  group: "workspace" as const,
  label: "",
  description: "",
  icon: SquareTerminal,
  defaultSize: CANVAS_TERMINAL_DEFAULT_SIZE,
  requiresContext: true,
};

export const ADDABLE_CANVAS_ITEM_TYPES: AddableCanvasItemType[] = [
  "center",
  CANVAS_TERMINAL_ADD_ITEM_TYPE,
  "workspace-context",
  ...ADDABLE_CANVAS_WIDGET_TYPES.filter(
    (type) => type !== "center" && type !== "workspace-context",
  ),
];

export function isCanvasWidgetAddItemType(
  type: AddableCanvasItemType,
): type is AddableCanvasWidgetType {
  return type !== CANVAS_TERMINAL_ADD_ITEM_TYPE;
}

export function getCanvasAddItemEntry(type: AddableCanvasItemType) {
  return type === CANVAS_TERMINAL_ADD_ITEM_TYPE
    ? CANVAS_TERMINAL_ADD_ITEM
    : CANVAS_WIDGET_REGISTRY[type];
}

export type CanvasAddContextOption = {
  value: string;
  kind: "project" | "workspace";
  label: string;
  detail: string;
  projectId: string;
  projectName: string;
  branch?: string;
  path: string;
  workspaceCount?: number;
  searchText: string;
  context: CanvasContextRef;
};

export function buildProjectContext(project: Project): CanvasContextRef {
  return {
    contextScope: "project",
    projectId: project.id,
    workspaceId: null,
    projectName: project.name,
    workspaceName: null,
    localPath: project.mainFilePath,
    repoPath: project.mainFilePath,
  };
}

export function buildWorkspaceContext(
  project: Project,
  workspace: Workspace,
): CanvasContextRef {
  return {
    contextScope: "workspace",
    projectId: project.id,
    workspaceId: workspace.id,
    projectName: project.name,
    // Stable workspace handle for tmux session naming (not display label).
    workspaceName: workspace.name,
    localPath: workspace.localPath,
    repoPath: workspace.localPath,
  };
}

export function buildSearchText(parts: string[]): string {
  return parts.join(" ").toLocaleLowerCase();
}

export function normalizeQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}

export function buildCanvasAddContextOptions(
  projects: Project[],
): CanvasAddContextOption[] {
  return projects.flatMap((project) => {
    const projectOption: CanvasAddContextOption = {
      value: `project:${project.id}`,
      kind: "project",
      label: project.name,
      detail: project.mainFilePath,
      projectId: project.id,
      projectName: project.name,
      path: project.mainFilePath,
      workspaceCount: project.workspaces.length,
      searchText: buildSearchText([
        project.name,
        project.mainFilePath,
        project.targetBranch ?? "",
      ]),
      context: buildProjectContext(project),
    };
    const workspaceOptions = project.workspaces.map(
      (workspace): CanvasAddContextOption => ({
        value: `workspace:${workspace.id}`,
        kind: "workspace",
        label: workspace.displayName || workspace.name,
        detail: `${project.name} / ${workspace.branch}`,
        projectId: project.id,
        projectName: project.name,
        branch: workspace.branch,
        path: workspace.localPath,
        searchText: buildSearchText([
          workspace.displayName ?? "",
          workspace.name,
          workspace.branch,
          workspace.localPath,
          project.name,
          project.mainFilePath,
        ]),
        context: buildWorkspaceContext(project, workspace),
      }),
    );
    return [projectOption, ...workspaceOptions];
  });
}
