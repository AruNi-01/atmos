import type { WorkspaceModel } from "@/api/ws-api";
import {
  WORKSPACE_WORKFLOW_STATUS_OPTIONS,
} from "@/app-shell/sidebar/workspace-status";
import type {
  Workspace,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";
import { normalizeWorkspaceCreateSource } from "@/shared/lib/workspace-create-source";

export type KanbanEntry = {
  projectId: string;
  projectName: string;
  workspace: Workspace;
};

export type BoardColumn = {
  status: WorkspaceWorkflowStatus;
};

export function mapKanbanWorkspaceModel(model: WorkspaceModel): Workspace {
  const createSource = normalizeWorkspaceCreateSource(model.create_source);

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
    linearLinks: (model.linear_links ?? []).map((link: {
      external_id: string;
      identifier: string;
      title: string;
      url: string;
    }) => ({
      externalId: link.external_id,
      identifier: link.identifier,
      title: link.title,
      url: link.url,
    })),
    createSource,
  };
}

export const BOARD_COLUMNS: BoardColumn[] = WORKSPACE_WORKFLOW_STATUS_OPTIONS.map((option) => ({
  status: option.value,
}));

export const STATUS_COLOR_MAP: Record<WorkspaceWorkflowStatus, string> = {
  backlog: "#94a3b8",
  todo: "#94a3b8",
  in_progress: "#3b82f6",
  in_review: "#22c55e",
  blocked: "#eab308",
  completed: "#8b5cf6",
  canceled: "#6b7280",
};

export const KANBAN_SORT_BY_VALUES = ["last_visit", "create_time", "priority"] as const;
export const KANBAN_SORT_ORDER_VALUES = ["asc", "desc"] as const;
export const KANBAN_CARD_PROPERTY_KEYS = [
  "project",
  "priority",
  "status",
  "workspace_name",
  "group",
  "agent_status",
  "pull_request",
  "display_name",
  "labels",
  "last_visit",
] as const;

export type KanbanSortBy = (typeof KANBAN_SORT_BY_VALUES)[number];
export type KanbanSortOrder = (typeof KANBAN_SORT_ORDER_VALUES)[number];
export type KanbanCardPropertyKey = (typeof KANBAN_CARD_PROPERTY_KEYS)[number];
export type KanbanCardProperties = Record<KanbanCardPropertyKey, boolean>;

export const DEFAULT_KANBAN_CARD_PROPERTIES: KanbanCardProperties = {
  project: true,
  priority: true,
  status: true,
  workspace_name: true,
  group: true,
  agent_status: true,
  pull_request: true,
  display_name: true,
  labels: true,
  last_visit: true,
};

/** Settings popover property toggles — labels come from i18n `settings.propertyLabels.<key>`. */
export const KANBAN_CARD_PROPERTY_OPTIONS: Array<{ key: KanbanCardPropertyKey }> =
  KANBAN_CARD_PROPERTY_KEYS.map((key) => ({ key }));

export type WorkspaceKanbanViewSavedState = {
  sort_by: KanbanSortBy;
  sort_order: KanbanSortOrder;
  filters: {
    search_query: string;
    statuses: WorkspaceWorkflowStatus[];
    priorities: WorkspacePriority[];
    label_ids: string[];
    project_ids: string[];
    group_ids?: string[];
    /** Status keys (legacy) or generic column keys for multi-mode boards. */
    hidden_columns: string[];
    show_automation_workspaces?: boolean;
  };
  properties: KanbanCardProperties;
};

export function resolveKanbanCardProperties(raw: unknown): KanbanCardProperties {
  const state = raw && typeof raw === "object"
    ? raw as Partial<WorkspaceKanbanViewSavedState>
    : {};
  const properties =
    state.properties && typeof state.properties === "object"
      ? (state.properties as Partial<KanbanCardProperties>)
      : {};

  return KANBAN_CARD_PROPERTY_KEYS.reduce<KanbanCardProperties>((acc, key) => {
    const rawValue = properties[key];
    acc[key] = typeof rawValue === "boolean" ? rawValue : DEFAULT_KANBAN_CARD_PROPERTIES[key];
    return acc;
  }, { ...DEFAULT_KANBAN_CARD_PROPERTIES });
}

export interface DragItem {
  id: string;
  projectId: string;
  status: WorkspaceWorkflowStatus;
  priority: WorkspacePriority;
  /** Column key the card was dragged from (for non-status boards). */
  sourceColumnKey: string;
  preview: {
    projectName: string;
    /** Full workspace snapshot so the overlay can render the real card chrome. */
    workspace: Workspace;
  };
}
