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
};

function workspaceKanbanViewState(settings: FunctionSettingsSnapshot): unknown {
  const section = settings.workspace_kanban_view;
  if (section && typeof section === "object" && "state" in (section as Record<string, unknown>)) {
    return (section as { state?: unknown }).state;
  }
  return section;
}

export function parseWorkspaceKanbanFilters(settings: FunctionSettingsSnapshot): WorkspaceKanbanFilters {
  const availableStatusSet = new Set(WORKSPACE_WORKFLOW_STATUS_OPTIONS.map((option) => option.value));
  const availablePrioritySet = new Set(WORKSPACE_PRIORITY_OPTIONS.map((option) => option.value));
  const raw = workspaceKanbanViewState(settings);
  const state = raw && typeof raw === "object" ? raw as { filters?: Record<string, unknown> } : {};
  const filters = state.filters && typeof state.filters === "object" ? state.filters : {};

  return {
    statuses: Array.isArray(filters.statuses)
      ? filters.statuses.filter((item): item is WorkspaceWorkflowStatus => availableStatusSet.has(item as WorkspaceWorkflowStatus))
      : [],
    priorities: Array.isArray(filters.priorities)
      ? filters.priorities.filter((item): item is WorkspacePriority => availablePrioritySet.has(item as WorkspacePriority))
      : [],
    labelIds: Array.isArray(filters.label_ids)
      ? filters.label_ids.filter((item): item is string => typeof item === "string")
      : [],
    projectIds: Array.isArray(filters.project_ids)
      ? filters.project_ids.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export function parseWorkspaceKanbanCardProperties(settings: FunctionSettingsSnapshot): KanbanCardProperties {
  return resolveKanbanCardProperties(workspaceKanbanViewState(settings));
}

export { DEFAULT_KANBAN_CARD_PROPERTIES, EMPTY_WORKSPACE_KANBAN_FILTERS };
