"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useFocusRestore } from "@/shared/hooks/use-focus-restore";
import { useDesktopTrafficLightsPadding } from "@/shared/hooks/use-desktop-traffic-lights-padding";
import {
  Button,
  DndContext,
  DragOverlay,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
  MouseSensor,
  useSensor,
  useSensors,
} from "@workspace/ui";
import type { DragEndEvent, DragStartEvent } from "@workspace/ui";
import { functionSettingsApi, wsWorkspaceApi } from "@/api/ws-api";
import { useFunctionSettingsStore } from "@/features/settings/store/function-settings-store";
import type { GithubIssuePayload } from "@/api/ws-api";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useQueryState } from "nuqs";
import { leftSidebarParams } from "@/shared/lib/nuqs/searchParams";
import type {
  Group,
  Project,
  Workspace,
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";
import {
  getWorkspaceWorkflowStatusMeta,
  SIDEBAR_GROUPING_OPTIONS,
  type SidebarGroupingMode,
  WORKSPACE_WORKFLOW_STATUS_OPTIONS,
} from "@/app-shell/sidebar/workspace-status";
import {
  getWorkspacePriorityMeta,
  WORKSPACE_PRIORITY_OPTIONS,
  WORKSPACE_PRIORITY_SORT_WEIGHT,
} from "@/app-shell/sidebar/workspace-metadata-controls";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Eye,
  EyeOff,
  Import,
  Plus,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { CreateWorkspaceDialog } from "@/features/workspace/components/CreateWorkspaceDialog";
import { ImportGithubIssuesDialog } from "@/features/github/components/ImportGithubIssuesDialog";
import {
  WorkspaceKanbanFilterMenu,
  type WorkspaceKanbanFilters,
} from "@/app-shell/sidebar/WorkspaceKanbanFilterMenu";
import {
  DraggableWorkspaceCard,
  DroppableColumn,
  KanbanDragPreview,
  KanbanWorkspaceCard,
} from "@/app-shell/sidebar/WorkspaceKanbanCard";
import {
  DEFAULT_KANBAN_CARD_PROPERTIES,
  KANBAN_CARD_PROPERTY_OPTIONS,
  KANBAN_SORT_BY_VALUES,
  KANBAN_SORT_ORDER_VALUES,
  mapKanbanWorkspaceModel,
  resolveKanbanCardProperties,
  type DragItem,
  type KanbanCardProperties,
  type KanbanEntry,
  type KanbanSortBy,
  type KanbanSortOrder,
  type WorkspaceKanbanViewSavedState,
} from "@/app-shell/sidebar/WorkspaceKanbanTypes";
import {
  buildKanbanBoardColumns,
  columnBackgroundTint,
  isKanbanDragAssignable,
  resolveKanbanColumnKeys,
  type KanbanBoardColumn,
} from "@/app-shell/sidebar/kanban-columns";

export {
  DEFAULT_KANBAN_CARD_PROPERTIES,
  KanbanWorkspaceCard,
  resolveKanbanCardProperties,
};
export type { KanbanCardProperties };

interface WorkspaceKanbanViewProps {
  projects: Project[];
  availableLabels: WorkspaceLabel[];
  groups?: Group[];
  groupingMode?: SidebarGroupingMode;
  onGroupingModeChange?: (mode: SidebarGroupingMode) => void;
  onUpdateWorkflowStatus: (
    projectId: string,
    workspaceId: string,
    workflowStatus: WorkspaceWorkflowStatus,
  ) => Promise<void>;
  onUpdatePriority: (
    projectId: string,
    workspaceId: string,
    priority: WorkspacePriority,
  ) => Promise<void>;
  onSetWorkspaceGroup?: (workspaceId: string, groupId: string | null) => Promise<void> | void;
  onCreateLabel: (data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateLabel: (labelId: string, data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateLabels: (
    projectId: string,
    workspaceId: string,
    labels: WorkspaceLabel[],
  ) => Promise<void>;
  onPinWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  onUnpinWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
  onArchiveWorkspace?: (projectId: string, workspaceId: string) => Promise<void>;
  onDeleteWorkspace?: (projectId: string, workspaceId: string) => Promise<void>;
  filters: WorkspaceKanbanFilters;
  onFiltersChange: (filters: WorkspaceKanbanFilters) => void;
  trigger: React.ReactNode;
}

export function WorkspaceKanbanView({
  projects,
  availableLabels,
  groups = [],
  groupingMode = "status",
  onGroupingModeChange,
  onUpdateWorkflowStatus,
  onUpdatePriority,
  onSetWorkspaceGroup,
  onCreateLabel,
  onUpdateLabel,
  onUpdateLabels,
  onPinWorkspace,
  onUnpinWorkspace,
  onArchiveWorkspace,
  onDeleteWorkspace,
  filters,
  onFiltersChange,
  trigger,
}: WorkspaceKanbanViewProps) {
  const t = useTranslations("appShell.kanban");
  const groupsT = useTranslations("appShell.groups");
  const groupingT = useTranslations("appShell.workspaceGrouping");
  const router = useAppRouter();
  const [isKanbanExpanded, setIsKanbanExpanded] = useQueryState("lsKanban", leftSidebarParams.lsKanban);
  const { onCloseAutoFocusPrevent } = useFocusRestore(!!isKanbanExpanded);
  const [searchQuery, setSearchQuery] = useQueryState("lsKanbanQ", leftSidebarParams.lsKanbanQ);
  const availableStatusSet = React.useMemo(
    () => new Set(WORKSPACE_WORKFLOW_STATUS_OPTIONS.map((option) => option.value)),
    [],
  );
  const availablePrioritySet = React.useMemo(
    () => new Set(WORKSPACE_PRIORITY_OPTIONS.map((option) => option.value)),
    [],
  );
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [recentlyDroppedId, setRecentlyDroppedId] = React.useState<string | null>(null);
  const [activeDragItem, setActiveDragItem] = React.useState<DragItem | null>(null);
  const [hiddenColumns, setHiddenColumns] = React.useState<string[]>([]);
  const [sortBy, setSortBy] = React.useState<KanbanSortBy>("last_visit");
  const [sortOrder, setSortOrder] = React.useState<KanbanSortOrder>("desc");
  const [cardProperties, setCardProperties] = React.useState<KanbanCardProperties>(DEFAULT_KANBAN_CARD_PROPERTIES);
  const [isSettingsReady, setIsSettingsReady] = React.useState(false);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = React.useState(false);
  const [createWorkspaceStatus, setCreateWorkspaceStatus] =
    React.useState<WorkspaceWorkflowStatus>("in_progress");
  const [isImportIssuesOpen, setIsImportIssuesOpen] = React.useState(false);
  const [showIssueOnly, setShowIssueOnly] = React.useState(false);
  const [buildFromIssueWorkspace, setBuildFromIssueWorkspace] = React.useState<{
    projectId: string;
    workspaceId: string;
    issue: GithubIssuePayload;
  } | null>(null);
  const skipPersistRef = React.useRef(false);
  const searchContainerRef = React.useRef<HTMLDivElement | null>(null);
  const boardScrollRef = React.useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
  );
  const dragAssignable = isKanbanDragAssignable(groupingMode);

  const needsTrafficLightsPadding = useDesktopTrafficLightsPadding();
  const [isBrowser, setIsBrowser] = React.useState(false);
  React.useEffect(() => {
    setIsBrowser(true);
  }, []);

  React.useEffect(() => {
    if (searchQuery.trim()) {
      setIsSearchOpen(true);
    }
  }, [searchQuery]);

  // Issue-only workspaces are not loaded by the sidebar store (fetchProjects).
  // We only fetch them when the user toggles showIssueOnly on.
  const [issueOnlyWorkspaces, setIssueOnlyWorkspaces] = React.useState<Map<string, Workspace[]>>(new Map());
  const [issueOnlyLoaded, setIssueOnlyLoaded] = React.useState(false);

  const fetchIssueOnlyWorkspaces = React.useCallback(async () => {
    const results = await Promise.allSettled(
      projects.map(async (project) => {
        const workspaces = await wsWorkspaceApi.listByProject(project.id, true);
        // Filter to only issue_only workspaces (the store already has manual ones)
        const issueOnly = workspaces
          .filter((w) => w.create_source === 'issue_only')
          .map(mapKanbanWorkspaceModel);
        return { projectId: project.id, workspaces: issueOnly };
      }),
    );
    const map = new Map<string, Workspace[]>();
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        map.set(result.value.projectId, result.value.workspaces);
      }
    });
    setIssueOnlyWorkspaces(map);
    setIssueOnlyLoaded(true);
  }, [projects]);

  // Fetch issue_only workspaces when showIssueOnly is toggled on
  React.useEffect(() => {
    if (!isKanbanExpanded || !showIssueOnly || issueOnlyLoaded) return;
    void fetchIssueOnlyWorkspaces();
  }, [isKanbanExpanded, showIssueOnly, issueOnlyLoaded, fetchIssueOnlyWorkspaces]);

  // Build kanbanProjects by merging store data with issue_only workspaces
  const kanbanProjects = React.useMemo(() => {
    if (!isKanbanExpanded) return null;
    return projects.map((project) => {
      if (!showIssueOnly) return project;
      const extra = issueOnlyWorkspaces.get(project.id) ?? [];
      if (extra.length === 0) return project;
      const existingIds = new Set(project.workspaces.map((w) => w.id));
      const uniqueExtra = extra.filter((w) => !existingIds.has(w.id));
      return { ...project, workspaces: [...project.workspaces, ...uniqueExtra] };
    });
  }, [isKanbanExpanded, projects, showIssueOnly, issueOnlyWorkspaces]);

  const reloadKanbanProjects = React.useCallback(async () => {
    // Re-fetch issue_only workspaces after import
    await fetchIssueOnlyWorkspaces();
  }, [fetchIssueOnlyWorkspaces]);

  const loadWorkspaceKanbanSettings = React.useCallback(async ({ blocking = false }: { blocking?: boolean } = {}) => {
    if (blocking) {
      setIsSettingsReady(false);
    }
    skipPersistRef.current = true;

    try {
      const settings = await useFunctionSettingsStore.getState().load();
      const section = settings.workspace_kanban_view;
      const raw = (section && typeof section === "object" && "state" in (section as Record<string, unknown>))
        ? (section as { state?: unknown }).state
        : section;
      const state = (raw && typeof raw === "object") ? raw as Partial<WorkspaceKanbanViewSavedState> : {};
      const filters =
        state.filters && typeof state.filters === "object"
          ? (state.filters as Partial<WorkspaceKanbanViewSavedState["filters"]>)
          : {};
      const loadedSortBy = KANBAN_SORT_BY_VALUES.includes(state.sort_by as KanbanSortBy) ? state.sort_by as KanbanSortBy : "last_visit";
      const loadedSortOrder = KANBAN_SORT_ORDER_VALUES.includes(state.sort_order as KanbanSortOrder) ? state.sort_order as KanbanSortOrder : "desc";
      const loadedStatuses = Array.isArray(filters.statuses)
        ? filters.statuses.filter((item): item is WorkspaceWorkflowStatus => availableStatusSet.has(item as WorkspaceWorkflowStatus))
        : [];
      const loadedPriorities = Array.isArray(filters.priorities)
        ? filters.priorities.filter((item): item is WorkspacePriority => availablePrioritySet.has(item as WorkspacePriority))
        : [];
      const loadedLabelIds = Array.isArray(filters.label_ids)
        ? filters.label_ids.filter((item): item is string => typeof item === "string")
        : [];
      const loadedProjectIds = Array.isArray(filters.project_ids)
        ? filters.project_ids.filter((item): item is string => typeof item === "string")
        : [];
      const loadedGroupIds = Array.isArray(filters.group_ids)
        ? filters.group_ids.filter((item): item is string => typeof item === "string")
        : [];
      const loadedHiddenColumns = Array.isArray(filters.hidden_columns)
        ? filters.hidden_columns.filter((item): item is string => typeof item === "string")
        : [];
      const loadedShowAutomationWorkspaces =
        typeof filters.show_automation_workspaces === "boolean"
          ? filters.show_automation_workspaces
          : false;
      const loadedShowIssueOnly = typeof state.show_issue_only === 'boolean' ? state.show_issue_only : false;

      const nextCardProperties = resolveKanbanCardProperties(state);

      setSortBy(loadedSortBy);
      setSortOrder(loadedSortOrder);
      const loadedSearchQuery = typeof filters.search_query === "string" ? filters.search_query : "";
      setSearchQuery((prev) => (prev.trim() ? prev : loadedSearchQuery));
      onFiltersChange({
        statuses: loadedStatuses,
        priorities: loadedPriorities,
        labelIds: loadedLabelIds,
        projectIds: loadedProjectIds,
        groupIds: loadedGroupIds,
        showAutomationWorkspaces: loadedShowAutomationWorkspaces,
      });
      setHiddenColumns(loadedHiddenColumns);
      setCardProperties(nextCardProperties);
      setShowIssueOnly(loadedShowIssueOnly);
    } catch {
      if (blocking) {
        setSortBy("last_visit");
        setSortOrder("desc");
        onFiltersChange({
          statuses: [],
          priorities: [],
          labelIds: [],
          projectIds: [],
          groupIds: [],
          showAutomationWorkspaces: false,
        });
        setHiddenColumns([]);
        setCardProperties(DEFAULT_KANBAN_CARD_PROPERTIES);
      }
    } finally {
      if (blocking) {
        setIsSettingsReady(true);
      }
      setTimeout(() => {
        skipPersistRef.current = false;
      }, 0);
    }
  }, [availablePrioritySet, availableStatusSet, onFiltersChange, setSearchQuery]);

  React.useEffect(() => {
    if (!isKanbanExpanded || isSettingsReady) return;
    void loadWorkspaceKanbanSettings({ blocking: true });
  }, [isKanbanExpanded, isSettingsReady, loadWorkspaceKanbanSettings]);

  const persistWorkspaceKanbanSettings = React.useCallback(async () => {
    const payload: WorkspaceKanbanViewSavedState = {
      sort_by: sortBy,
      sort_order: sortOrder,
      filters: {
        search_query: searchQuery,
        statuses: filters.statuses,
        priorities: filters.priorities,
        label_ids: filters.labelIds,
        project_ids: filters.projectIds,
        group_ids: filters.groupIds,
        hidden_columns: hiddenColumns,
        show_automation_workspaces: filters.showAutomationWorkspaces,
      },
      properties: cardProperties,
      show_issue_only: showIssueOnly,
    };

    await functionSettingsApi.update("workspace_kanban_view", "state", payload);
  }, [
    cardProperties,
    filters,
    hiddenColumns,
    searchQuery,
    sortBy,
    sortOrder,
    showIssueOnly,
  ]);

  React.useEffect(() => {
    if (!isSettingsReady || skipPersistRef.current) return;
    const timer = window.setTimeout(() => {
      void persistWorkspaceKanbanSettings();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isSettingsReady, persistWorkspaceKanbanSettings]);

  const boardColumns = React.useMemo(
    () =>
      buildKanbanBoardColumns({
        groupingMode,
        projects: kanbanProjects ?? projects,
        groups,
        availableLabels,
        ungroupedLabel: groupsT("ungrouped"),
        untaggedLabel: groupingT("untagged"),
      }),
    [availableLabels, groupingMode, groupingT, groups, groupsT, kanbanProjects, projects],
  );

  const grouped = React.useMemo(() => {
    const sourceProjects = kanbanProjects ?? projects;
    const buckets = new Map<string, KanbanEntry[]>();
    sourceProjects.forEach((project) => {
      project.workspaces.forEach((workspace) => {
        // Filter out issue_only workspaces unless showIssueOnly is true
        if (!showIssueOnly && workspace.createSource === 'issue_only') return;
        if (!filters.showAutomationWorkspaces && workspace.createSource === 'automation') return;
        if (filters.projectIds.length > 0 && !filters.projectIds.includes(project.id)) return;
        if (filters.statuses.length > 0 && !filters.statuses.includes(workspace.workflowStatus)) return;
        if (filters.priorities.length > 0 && !filters.priorities.includes(workspace.priority)) return;
        if (
          filters.labelIds.length > 0 &&
          !workspace.labels.some((label) => filters.labelIds.includes(label.id))
        ) return;
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          const displayName = workspace.displayName?.toLowerCase() ?? "";
          const workspaceName = workspace.name.toLowerCase();
          const projectName = project.name.toLowerCase();
          if (!projectName.includes(q) && !workspaceName.includes(q) && !displayName.includes(q)) {
            return;
          }
        }

        const columnKeys = resolveKanbanColumnKeys({
          groupingMode,
          projectId: project.id,
          workspace,
          groups,
        });
        const entry = { projectId: project.id, projectName: project.name, workspace };
        for (const key of columnKeys) {
          const list = buckets.get(key) ?? [];
          list.push(entry);
          buckets.set(key, list);
        }
      });
    });

    buckets.forEach((list) => {
      list.sort((a, b) => {
        // Pinned items always come first, preserving project tab order (pinOrder / pinnedAt)
        if (a.workspace.isPinned && !b.workspace.isPinned) return -1;
        if (!a.workspace.isPinned && b.workspace.isPinned) return 1;
        if (a.workspace.isPinned && b.workspace.isPinned) {
          const aOrder = a.workspace.pinOrder;
          const bOrder = b.workspace.pinOrder;
          if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) return aOrder - bOrder;
          if (aOrder !== undefined && bOrder === undefined) return -1;
          if (aOrder === undefined && bOrder !== undefined) return 1;
          const aTime = a.workspace.pinnedAt ? new Date(a.workspace.pinnedAt).getTime() : 0;
          const bTime = b.workspace.pinnedAt ? new Date(b.workspace.pinnedAt).getTime() : 0;
          if (aTime !== bTime) return bTime - aTime;
          return a.workspace.id.localeCompare(b.workspace.id);
        }

        let base = 0;
        if (sortBy === "priority") {
          base = WORKSPACE_PRIORITY_SORT_WEIGHT[a.workspace.priority] - WORKSPACE_PRIORITY_SORT_WEIGHT[b.workspace.priority];
        } else if (sortBy === "create_time") {
          base = new Date(a.workspace.createdAt).getTime() - new Date(b.workspace.createdAt).getTime();
        } else {
          base =
            new Date(a.workspace.lastVisitedAt || a.workspace.createdAt).getTime() -
            new Date(b.workspace.lastVisitedAt || b.workspace.createdAt).getTime();
        }
        const ordered = sortOrder === "asc" ? base : -base;
        if (ordered !== 0) return ordered;
        const fallbackA = new Date(a.workspace.lastVisitedAt || a.workspace.createdAt).getTime();
        const fallbackB = new Date(b.workspace.lastVisitedAt || b.workspace.createdAt).getTime();
        return fallbackB - fallbackA;
      });
    });

    return buckets;
  }, [filters, groupingMode, groups, kanbanProjects, projects, searchQuery, showIssueOnly, sortBy, sortOrder]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.cursor;
    if (activeDragItem) {
      document.body.style.cursor = "grabbing";
    }
    return () => {
      document.body.style.cursor = prev;
    };
  }, [activeDragItem]);

  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    if (!dragAssignable) return;
    const item = event.active.data.current?.item as DragItem | undefined;
    setActiveDragItem(item ?? null);
  }, [dragAssignable]);

  const handleDragEnd = React.useCallback((event: DragEndEvent) => {
    const item = event.active.data.current?.item as DragItem | undefined;
    const targetColumnKey = event.over?.data.current?.columnKey as string | undefined;
    setActiveDragItem(null);
    if (!item || !targetColumnKey || !dragAssignable) return;
    if (item.sourceColumnKey === targetColumnKey) return;

    const targetColumn = boardColumns.find((column) => column.key === targetColumnKey);
    if (!targetColumn) return;

    if (groupingMode === "status" && targetColumn.status) {
      void onUpdateWorkflowStatus(item.projectId, item.id, targetColumn.status);
    } else if (groupingMode === "priority" && targetColumn.priority) {
      void onUpdatePriority(item.projectId, item.id, targetColumn.priority);
    } else if (groupingMode === "group" && onSetWorkspaceGroup) {
      void onSetWorkspaceGroup(item.id, targetColumn.groupId ?? null);
    } else {
      return;
    }

    setRecentlyDroppedId(item.id);
    setTimeout(() => {
      setRecentlyDroppedId((prev) => (prev === item.id ? null : prev));
    }, 2000);
  }, [
    boardColumns,
    dragAssignable,
    groupingMode,
    onSetWorkspaceGroup,
    onUpdatePriority,
    onUpdateWorkflowStatus,
  ]);

  const handleDragCancel = React.useCallback(() => {
    setActiveDragItem(null);
  }, []);

  const handleEnterWorkspace = React.useCallback((projectId: string, workspaceId: string) => {
    // Check if this is an issue_only workspace
    const sourceProjects = kanbanProjects ?? projects;
    const workspace = sourceProjects
      .find((p) => p.id === projectId)
      ?.workspaces.find((w) => w.id === workspaceId);

    if (workspace?.createSource === 'issue_only' && workspace.githubIssue) {
      setBuildFromIssueWorkspace({
        projectId,
        workspaceId,
        issue: workspace.githubIssue,
      });
      setIsCreateWorkspaceOpen(true);
      return;
    }

    void setIsKanbanExpanded(false).then(() => {
      router.push(`/workspace?id=${workspaceId}`);
    });
  }, [kanbanProjects, projects, router, setIsKanbanExpanded]);

  const selectedFilterChips = React.useMemo(() => {
    const chips: Array<{
      key: string;
      label: string;
      type: "status" | "priority" | "label" | "project" | "group";
      value: string;
    }> = [];
    filters.statuses.forEach((status) => {
      chips.push({
        key: `status-${status}`,
        label: t(getWorkspaceWorkflowStatusMeta(status).labelKey),
        type: "status",
        value: status,
      });
    });
    filters.priorities.forEach((priority) => {
      chips.push({
        key: `priority-${priority}`,
        label: t(WORKSPACE_PRIORITY_OPTIONS.find((item) => item.value === priority)?.labelKey ?? "priority.noPriority"),
        type: "priority",
        value: priority,
      });
    });
    filters.labelIds.forEach((labelId) => {
      const label = availableLabels.find((item) => item.id === labelId);
      if (label) chips.push({ key: `label-${labelId}`, label: label.name, type: "label", value: labelId });
    });
    filters.projectIds.forEach((projectId) => {
      const project = projects.find((item) => item.id === projectId);
      if (project) chips.push({ key: `project-${projectId}`, label: project.name, type: "project", value: projectId });
    });
    filters.groupIds.forEach((groupId) => {
      if (groupId === "__ungrouped__") {
        chips.push({ key: `group-${groupId}`, label: groupsT("ungrouped"), type: "group", value: groupId });
        return;
      }
      const group = groups.find((item) => item.id === groupId);
      if (group) chips.push({ key: `group-${groupId}`, label: group.name, type: "group", value: groupId });
    });
    return chips;
  }, [availableLabels, filters, groups, groupsT, projects, t]);

  const removeFilterChip = React.useCallback((chip: {
    type: "status" | "priority" | "label" | "project" | "group";
    value: string;
  }) => {
    if (chip.type === "status") {
      onFiltersChange({
        ...filters,
        statuses: filters.statuses.filter((item) => item !== chip.value),
      });
      return;
    }
    if (chip.type === "priority") {
      onFiltersChange({
        ...filters,
        priorities: filters.priorities.filter((item) => item !== chip.value),
      });
      return;
    }
    if (chip.type === "label") {
      onFiltersChange({
        ...filters,
        labelIds: filters.labelIds.filter((item) => item !== chip.value),
      });
      return;
    }
    if (chip.type === "group") {
      onFiltersChange({
        ...filters,
        groupIds: filters.groupIds.filter((item) => item !== chip.value),
      });
      return;
    }
    onFiltersChange({
      ...filters,
      projectIds: filters.projectIds.filter((item) => item !== chip.value),
    });
  }, [filters, onFiltersChange]);

  React.useEffect(() => {
    if (!isSearchOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!searchContainerRef.current?.contains(event.target as Node) && !searchQuery.trim()) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isSearchOpen, searchQuery]);

  const visibleColumns = React.useMemo(
    () => boardColumns.filter((column) => !hiddenColumns.includes(column.key)),
    [boardColumns, hiddenColumns],
  );
  const hiddenColumnList = React.useMemo(
    () => boardColumns.filter((column) => hiddenColumns.includes(column.key)),
    [boardColumns, hiddenColumns],
  );

  const hideColumn = React.useCallback((columnKey: string) => {
    setHiddenColumns((prev) => (prev.includes(columnKey) ? prev : [...prev, columnKey]));
  }, []);

  const showColumn = React.useCallback((columnKey: string) => {
    setHiddenColumns((prev) => prev.filter((item) => item !== columnKey));
  }, []);

  const openCreateWorkspaceDialog = React.useCallback((status: WorkspaceWorkflowStatus = "in_progress") => {
    setCreateWorkspaceStatus(status);
    setIsCreateWorkspaceOpen(true);
  }, []);

  const columnTitle = React.useCallback(
    (column: KanbanBoardColumn) => (column.labelIsI18nKey ? t(column.label as never) : column.label),
    [t],
  );

    return (
    <Dialog
      open={!!isKanbanExpanded}
      onOpenChange={(open) => {
        void setIsKanbanExpanded(open);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocusPrevent}
        className={cn(
          "top-1/2 left-1/2 h-[100dvh] w-[100vw] max-w-[100vw] translate-x-[-50%] translate-y-[-50%] gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] sm:rounded-2xl sm:border sm:border-border",
          needsTrafficLightsPadding &&
            "top-[32px] h-[calc(100dvh-32px)] translate-y-0 sm:top-[32px] sm:h-[calc(100dvh-3rem)]"
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("dialog.title")}</DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <div className="flex h-10 items-center justify-between border-b px-6 py-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <WorkspaceKanbanFilterMenu
                projects={projects}
                availableLabels={availableLabels}
                groups={groups}
                filters={filters}
                onFiltersChange={onFiltersChange}
                showGrouping={Boolean(onGroupingModeChange)}
                groupingMode={groupingMode}
                onGroupingModeChange={onGroupingModeChange}
              />

              {selectedFilterChips.length > 0 ? (
                <div className="scrollbar-on-hover flex max-w-[520px] items-center gap-1 overflow-x-auto whitespace-nowrap pr-1">
                  {selectedFilterChips.map((chip) => (
                    <div
                      key={chip.key}
                      className="group relative inline-flex h-6 items-center rounded-full border border-border bg-background px-2 text-xs text-foreground"
                    >
                      <span>{chip.label}</span>
                      <button
                        type="button"
                        onClick={() => removeFilterChip(chip)}
                        className="absolute right-1 inline-flex size-4 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:bg-accent hover:text-foreground"
                        title={t("filter.removeChip", { label: chip.label })}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <div ref={searchContainerRef} className="relative h-7 w-56">
                <div
                  className={cn(
                    "absolute right-0 top-0 h-7 overflow-hidden rounded-md border border-border bg-background transition-[width] duration-200 ease-out",
                    isSearchOpen ? "w-56" : "w-7",
                  )}
                >
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("search.placeholder")}
                    className={cn(
                      "h-7 border-0 bg-transparent pr-8 text-xs shadow-none focus-visible:ring-0",
                      isSearchOpen ? "opacity-100" : "pointer-events-none opacity-0 absolute",
                    )}
                    autoFocus={isSearchOpen}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 inline-flex size-7 items-center justify-center text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      if (isSearchOpen && !searchQuery.trim()) {
                        setIsSearchOpen(false);
                        return;
                      }
                      setIsSearchOpen(true);
                    }}
                  >
                    <Search className="size-4" />
                  </button>
                </div>
              </div>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-xs" variant="outline" className="size-7">
                    <Settings2 className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 p-1.5">
                  <div className="px-2 pt-1">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground">{t("settings.order")}</span>
                      <div className="flex items-center gap-1.5">
                        <Select value={sortBy} onValueChange={(value) => setSortBy(value as KanbanSortBy)}>
                          <SelectTrigger className="!h-5 w-[84px] gap-1 rounded-sm px-1.5 py-0 text-[10px] [&_svg]:size-3">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="last_visit">{t("sort.lastVisit")}</SelectItem>
                            <SelectItem value="create_time">{t("sort.createTime")}</SelectItem>
                            <SelectItem value="priority">{t("sort.priority")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="icon-xs"
                          variant="outline"
                          className="size-5 rounded-sm"
                          onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
                          aria-label={sortOrder === "desc" ? t("sort.switchToAscending") : t("sort.switchToDescending")}
                          title={sortOrder === "desc" ? t("sort.descending") : t("sort.ascending")}
                        >
                          {sortOrder === "desc" ? (
                            <ArrowDownWideNarrow className="size-3.5" />
                          ) : (
                            <ArrowUpNarrowWide className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <DropdownMenuSeparator className="mx-2 my-2" />
                  <div className="space-y-1 px-2 pb-1">
                    <div className="pb-1 text-xs font-medium text-foreground">{t("settings.properties")}</div>
                    {KANBAN_CARD_PROPERTY_OPTIONS.map((option) => (
                      <div key={option.key} className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1 hover:bg-muted/45">
                        <span className="text-xs text-foreground">{option.label}</span>
                        <Switch
                          checked={cardProperties[option.key]}
                          onCheckedChange={(checked) =>
                            setCardProperties((prev) => ({ ...prev, [option.key]: checked }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="icon-xs"
                variant="outline"
                className="size-7"
                onClick={() => setIsImportIssuesOpen(true)}
                title={t("toolbar.importGithubIssues")}
              >
                <Import className="size-3.5" />
              </Button>
              <Button
                size="icon-xs"
                variant={showIssueOnly ? "default" : "outline"}
                className="size-7"
                onClick={() => setShowIssueOnly((prev) => !prev)}
                title={showIssueOnly ? t("toolbar.hideIssueOnly") : t("toolbar.showIssueOnly")}
              >
                {showIssueOnly ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              </Button>
            </div>
          </div>
          <div
            ref={boardScrollRef}
            className="scrollbar-on-hover min-h-0 min-w-0 flex-1 overflow-x-scroll overflow-y-hidden p-2"
          >
            {!isSettingsReady ? (
              <div className="flex h-full min-h-[260px] items-center justify-center text-sm text-muted-foreground">
                {t("loadingSettings")}
              </div>
            ) : isBrowser ? (
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <div className="grid h-full min-w-max grid-flow-col auto-cols-[348px] gap-2">
                  {visibleColumns.map((column) => {
                    const items = grouped.get(column.key) ?? [];
                    const title = columnTitle(column);
                    const ModeIcon =
                      SIDEBAR_GROUPING_OPTIONS.find((option) => option.value === groupingMode)?.icon ??
                      null;
                    const statusMeta = column.status
                      ? getWorkspaceWorkflowStatusMeta(column.status)
                      : null;
                    const priorityMeta = column.priority
                      ? getWorkspacePriorityMeta(column.priority)
                      : null;
                    const HeaderIcon = statusMeta?.icon ?? priorityMeta?.icon ?? ModeIcon;
                    const headerIconClass =
                      statusMeta?.className ??
                      priorityMeta?.className ??
                      "text-muted-foreground";
                    // Color-backed modes use a swatch; status/priority keep their level icons.
                    const showColorSwatch =
                      groupingMode === "label" ||
                      groupingMode === "project" ||
                      groupingMode === "group" ||
                      groupingMode === "time" ||
                      (!HeaderIcon && Boolean(column.color));

                    return (
                      <section
                        key={column.key}
                        className="flex h-full flex-shrink-0 flex-col overflow-hidden rounded-md"
                        style={{ backgroundColor: columnBackgroundTint(column.color) }}
                      >
                        <header className={cn("sticky top-0 z-10 h-[44px] rounded-t-md px-3")}>
                          <div className="flex h-full w-full items-center justify-between">
                            <div className="flex min-w-0 items-center gap-2">
                              {showColorSwatch ? (
                                <span
                                  className="size-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: column.color }}
                                />
                              ) : HeaderIcon ? (
                                <HeaderIcon className={cn("size-3.5 shrink-0", headerIconClass)} />
                              ) : null}
                              <span className="truncate text-sm font-medium">{title}</span>
                              <span className="text-sm text-muted-foreground">{items.length}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => hideColumn(column.key)}
                                className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                title={t("column.hide", { label: title })}
                              >
                                <EyeOff className="size-3.5" />
                              </button>
                              {groupingMode === "status" && column.status ? (
                                <button
                                  type="button"
                                  onClick={() => openCreateWorkspaceDialog(column.status)}
                                  className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                  title={t("column.createWorkspace", { label: title })}
                                >
                                  <Plus className="size-3.5" />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </header>
                        <DroppableColumn
                          columnKey={column.key}
                          activeDragItem={activeDragItem}
                          dropDisabled={!dragAssignable}
                        >
                          {items.map(({ projectId, projectName, workspace }) => (
                            <DraggableWorkspaceCard
                              key={`${column.key}:${workspace.id}`}
                              isRecentlyDropped={recentlyDroppedId === workspace.id}
                              sourceColumnKey={column.key}
                              dragDisabled={!dragAssignable}
                              workspace={workspace}
                              projectId={projectId}
                              projectName={projectName}
                              cardProperties={cardProperties}
                              groups={groups}
                              onEnterWorkspace={handleEnterWorkspace}
                              availableLabels={availableLabels}
                              onUpdateWorkflowStatus={onUpdateWorkflowStatus}
                              onUpdatePriority={onUpdatePriority}
                              onCreateLabel={onCreateLabel}
                              onUpdateLabel={onUpdateLabel}
                              onUpdateLabels={onUpdateLabels}
                              onPinWorkspace={onPinWorkspace}
                              onUnpinWorkspace={onUnpinWorkspace}
                              onArchiveWorkspace={onArchiveWorkspace}
                              onDeleteWorkspace={onDeleteWorkspace}
                            />
                          ))}
                        </DroppableColumn>
                      </section>
                    );
                  })}
                  {hiddenColumnList.length > 0 ? (
                    <section className="flex h-full flex-shrink-0 flex-col overflow-hidden rounded-md border border-dashed border-border/70 bg-muted/20">
                      <header className="sticky top-0 z-10 h-[44px] px-3">
                        <div className="flex h-full items-center">
                          <span className="text-sm font-medium text-muted-foreground">{t("column.hidden")}</span>
                        </div>
                      </header>
                      <div className="space-y-2 p-2">
                        {hiddenColumnList.map((column) => {
                          const title = columnTitle(column);
                          const hiddenCount = (grouped.get(column.key) ?? []).length;
                          return (
                            <div key={column.key} className="flex items-center rounded-md border border-border/60 bg-background px-2 py-1.5">
                              <span
                                className="size-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: column.color }}
                              />
                              <span className="ml-2 truncate text-xs text-foreground">{title}</span>
                              <span className="ml-1 text-xs text-muted-foreground">{hiddenCount}</span>
                              <button
                                type="button"
                                onClick={() => showColumn(column.key)}
                                className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                title={t("column.show", { label: title })}
                              >
                                <Eye className="size-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}
                </div>
                <DragOverlay dropAnimation={null}>
                  {activeDragItem ? <KanbanDragPreview item={activeDragItem} /> : null}
                </DragOverlay>
              </DndContext>
            ) : (
              <div className="grid h-full min-w-max grid-flow-col auto-cols-[348px] gap-2" />
            )}
          </div>
        </div>
      </DialogContent>
      <CreateWorkspaceDialog
        isOpen={isCreateWorkspaceOpen}
        onClose={() => {
          setIsCreateWorkspaceOpen(false);
          setBuildFromIssueWorkspace(null);
        }}
        defaultWorkflowStatus={createWorkspaceStatus}
        projectSelectionInHeader
        requireProjectSelection
        defaultProjectId={buildFromIssueWorkspace?.projectId}
        preselectedIssue={buildFromIssueWorkspace?.issue}
        sourceWorkspaceId={buildFromIssueWorkspace?.workspaceId}
      />
      <ImportGithubIssuesDialog
        isOpen={isImportIssuesOpen}
        onClose={() => setIsImportIssuesOpen(false)}
        onImported={reloadKanbanProjects}
      />
    </Dialog>
  );
}
