import type {
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";
import {
  DEFAULT_KANBAN_CARD_PROPERTIES,
  resolveKanbanCardProperties,
  type KanbanCardProperties,
} from "@/app-shell/sidebar/WorkspaceKanbanView";
import {
  EMPTY_WORKSPACE_KANBAN_FILTERS,
  type WorkspaceKanbanFilters,
} from "@/app-shell/sidebar/WorkspaceKanbanFilterMenu";
import { WORKSPACE_PRIORITY_OPTIONS } from "@/app-shell/sidebar/workspace-metadata-controls";
import { WORKSPACE_WORKFLOW_STATUS_OPTIONS } from "@/app-shell/sidebar/workspace-status";

type FunctionSettingsSnapshot = {
  workspace_kanban_view?: unknown;
  workspace_sidebar?: {
    filters?: unknown;
    [key: string]: unknown;
  };
};

function workspaceKanbanViewState(settings: FunctionSettingsSnapshot): unknown {
  const section = settings.workspace_kanban_view;
  if (section && typeof section === "object" && "state" in (section as Record<string, unknown>)) {
    return (section as { state?: unknown }).state;
  }
  return section;
}

/** Wire shape stored under `workspace_sidebar.filters` (independent of kanban board). */
export type WorkspaceSidebarFiltersSavedState = {
  statuses: WorkspaceWorkflowStatus[];
  priorities: WorkspacePriority[];
  label_ids: string[];
  project_ids: string[];
  group_ids: string[];
  show_automation_workspaces: boolean;
};

export function serializeWorkspaceSidebarFilters(
  filters: WorkspaceKanbanFilters,
): WorkspaceSidebarFiltersSavedState {
  return {
    statuses: filters.statuses,
    priorities: filters.priorities,
    label_ids: filters.labelIds,
    project_ids: filters.projectIds,
    group_ids: filters.groupIds,
    show_automation_workspaces: filters.showAutomationWorkspaces,
  };
}

/**
 * Left-sidebar list filters only — do not read `workspace_kanban_view`.
 * Kanban board owns its own filter state under that section.
 */
export function parseWorkspaceSidebarFilters(
  settings: FunctionSettingsSnapshot,
): WorkspaceKanbanFilters {
  const availableStatusSet = new Set(WORKSPACE_WORKFLOW_STATUS_OPTIONS.map((option) => option.value));
  const availablePrioritySet = new Set(WORKSPACE_PRIORITY_OPTIONS.map((option) => option.value));
  const raw = settings.workspace_sidebar?.filters;
  const filters = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    statuses: Array.isArray(filters.statuses)
      ? filters.statuses.filter((item): item is WorkspaceWorkflowStatus =>
          availableStatusSet.has(item as WorkspaceWorkflowStatus),
        )
      : [],
    priorities: Array.isArray(filters.priorities)
      ? filters.priorities.filter((item): item is WorkspacePriority =>
          availablePrioritySet.has(item as WorkspacePriority),
        )
      : [],
    labelIds: Array.isArray(filters.label_ids)
      ? filters.label_ids.filter((item): item is string => typeof item === "string")
      : [],
    projectIds: Array.isArray(filters.project_ids)
      ? filters.project_ids.filter((item): item is string => typeof item === "string")
      : [],
    groupIds: Array.isArray(filters.group_ids)
      ? filters.group_ids.filter((item): item is string => typeof item === "string")
      : [],
    showAutomationWorkspaces:
      typeof filters.show_automation_workspaces === "boolean"
        ? filters.show_automation_workspaces
        : false,
  };
}

export function parseWorkspaceKanbanCardProperties(settings: FunctionSettingsSnapshot): KanbanCardProperties {
  return resolveKanbanCardProperties(workspaceKanbanViewState(settings));
}

export { DEFAULT_KANBAN_CARD_PROPERTIES, EMPTY_WORKSPACE_KANBAN_FILTERS };
