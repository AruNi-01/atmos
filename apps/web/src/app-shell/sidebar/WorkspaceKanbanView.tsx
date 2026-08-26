"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Button,
  DndContext,
  DragOverlay,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { functionSettingsApi } from "@/api/ws-api";
import { useFunctionSettingsStore } from "@/features/settings/store/function-settings-store";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useQueryState } from "nuqs";
import { leftSidebarParams } from "@/shared/lib/nuqs/searchParams";
import type {
  Group,
  Project,
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";
import {
  getWorkspaceAgentGroupMeta,
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
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import { useWorkspaceAgentGroupKeyMap } from "@/features/agent/hooks/use-workspace-agent-status";
import { CreateWorkspaceDialog } from "@/features/workspace/components/CreateWorkspaceDialog";
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
  onCreateGroup?: (name: string) => Promise<{ id: string } | void> | { id: string } | void;
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
  /**
   * When false, skip loading filter fields from `workspace_kanban_view` settings
   * (parent owns them — e.g. Tasks page via nuqs). Sort / card properties still load.
   * Defaults to true.
   */
  hydrateFiltersFromSettings?: boolean;
  /** Optional leading content in the toolbar (e.g. Atmos / GitHub source tabs). */
  headerLeading?: React.ReactNode;
  /**
   * When false, skip the local top chrome bar so a parent can own the source Tabs
   * (keeps the coss Indicator mounted for Atmos ↔ GitHub animation).
   */
  showTopChrome?: boolean;
  /**
   * When `showTopChrome` is false, portal search/settings/filter into this host
   * (same header row as the parent source tabs).
   */
  headerTrailingHost?: HTMLElement | null;
  /**
   * When false, hide search / settings / filter toolbar actions.
   * Used by the parent Task shell when the GitHub tab is active.
   */
  showToolbarActions?: boolean;
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
  onCreateGroup,
  onCreateLabel,
  onUpdateLabel,
  onUpdateLabels,
  onPinWorkspace,
  onUnpinWorkspace,
  onArchiveWorkspace,
  onDeleteWorkspace,
  filters,
  onFiltersChange,
  hydrateFiltersFromSettings = true,
  headerLeading,
  showTopChrome = true,
  headerTrailingHost = null,
  showToolbarActions = true,
}: WorkspaceKanbanViewProps) {
  const t = useTranslations("appShell.task");
  const groupsT = useTranslations("appShell.groups");
  const groupingT = useTranslations("appShell.workspaceGrouping");
  const router = useAppRouter();
  const workspaceAgentContextIds = React.useMemo(
    () => projects.flatMap((project) => project.workspaces.map((workspace) => workspace.id)),
    [projects],
  );
  const agentGroupKeyByWorkspaceId = useWorkspaceAgentGroupKeyMap(workspaceAgentContextIds);
  const [searchQuery, setSearchQuery] = useQueryState("lsTaskQ", leftSidebarParams.lsTaskQ);
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
  const skipPersistRef = React.useRef(false);
  const searchContainerRef = React.useRef<HTMLDivElement | null>(null);
  const boardScrollRef = React.useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
  );
  const dragAssignable = isKanbanDragAssignable(groupingMode);

  const [isBrowser, setIsBrowser] = React.useState(false);
  React.useEffect(() => {
    setIsBrowser(true);
  }, []);

  React.useEffect(() => {
    if (searchQuery.trim()) {
      setIsSearchOpen(true);
    }
  }, [searchQuery]);

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

      const nextCardProperties = resolveKanbanCardProperties(state);

      setSortBy(loadedSortBy);
      setSortOrder(loadedSortOrder);
      const loadedSearchQuery = typeof filters.search_query === "string" ? filters.search_query : "";
      setSearchQuery((prev) => (prev.trim() ? prev : loadedSearchQuery));
      if (hydrateFiltersFromSettings) {
        onFiltersChange({
          statuses: loadedStatuses,
          priorities: loadedPriorities,
          labelIds: loadedLabelIds,
          projectIds: loadedProjectIds,
          groupIds: loadedGroupIds,
          showAutomationWorkspaces: loadedShowAutomationWorkspaces,
        });
      }
      setHiddenColumns(loadedHiddenColumns);
      setCardProperties(nextCardProperties);
    } catch {
      if (blocking) {
        setSortBy("last_visit");
        setSortOrder("desc");
        if (hydrateFiltersFromSettings) {
          onFiltersChange({
            statuses: [],
            priorities: [],
            labelIds: [],
            projectIds: [],
            groupIds: [],
            showAutomationWorkspaces: false,
          });
        }
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
  }, [
    availablePrioritySet,
    availableStatusSet,
    hydrateFiltersFromSettings,
    onFiltersChange,
    setSearchQuery,
  ]);

  React.useEffect(() => {
    if (isSettingsReady) return;
    void loadWorkspaceKanbanSettings({ blocking: true });
  }, [isSettingsReady, loadWorkspaceKanbanSettings]);

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
    };

    await functionSettingsApi.update("workspace_kanban_view", "state", payload);
  }, [
    cardProperties,
    filters,
    hiddenColumns,
    searchQuery,
    sortBy,
    sortOrder,
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
        projects,
        groups,
        availableLabels,
        ungroupedLabel: groupsT("ungrouped"),
        untaggedLabel: groupingT("untagged"),
      }),
    [availableLabels, groupingMode, groupingT, groups, groupsT, projects],
  );

  const grouped = React.useMemo(() => {
    const buckets = new Map<string, KanbanEntry[]>();
    projects.forEach((project) => {
      project.workspaces.forEach((workspace) => {
        if (!filters.showAutomationWorkspaces && workspace.createSource === "automation") return;
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
          agentGroupKey: agentGroupKeyByWorkspaceId[workspace.id],
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
  }, [agentGroupKeyByWorkspaceId, filters, groupingMode, groups, projects, searchQuery, sortBy, sortOrder]);

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

  const handleEnterWorkspace = React.useCallback((_projectId: string, workspaceId: string) => {
    router.push(`/workspace?id=${workspaceId}`);
  }, [router]);

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

  const toolbarActions = showToolbarActions ? (
    <div className="flex h-7 items-center justify-end gap-1.5">
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
            <Search className="size-3.5" />
          </button>
        </div>
      </div>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          {/* Match Task source tabs + trailing actions (h-7). icon-xs defaults to sm:size-6. */}
          <Button size="icon-xs" variant="outline" className="size-7 sm:size-7">
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
                <span className="text-xs text-foreground">
                  {t(`settings.propertyLabels.${option.key}`)}
                </span>
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
      <WorkspaceKanbanFilterMenu
        projects={projects}
        availableLabels={availableLabels}
        groups={groups}
        filters={filters}
        onFiltersChange={onFiltersChange}
        showGrouping={Boolean(onGroupingModeChange)}
        groupingMode={groupingMode}
        onGroupingModeChange={onGroupingModeChange}
        align="end"
      />
    </div>
  ) : null;

  // Parent Task shell owns source Tabs; portal tools into that stable header row.
  const portaledToolbar =
    !showTopChrome && headerTrailingHost && toolbarActions
      ? createPortal(toolbarActions, headerTrailingHost)
      : null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
          {showTopChrome ? (
            <div className="flex h-10 shrink-0 items-center justify-between border-b px-6 py-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                {headerLeading}
              </div>
              {toolbarActions}
            </div>
          ) : (
            portaledToolbar
          )}
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
                    const statusMeta = groupingMode === "status"
                      ? getWorkspaceWorkflowStatusMeta(column.status ?? column.key)
                      : null;
                    const priorityMeta = column.priority
                      ? getWorkspacePriorityMeta(column.priority)
                      : null;
                    const agentMeta = column.agentGroup
                      ? getWorkspaceAgentGroupMeta(column.agentGroup)
                      : null;
                    const HeaderIcon = statusMeta?.icon ?? priorityMeta?.icon ?? agentMeta?.icon ?? ModeIcon;
                    const headerIconClass =
                      statusMeta?.className ??
                      priorityMeta?.className ??
                      agentMeta?.className ??
                      "text-muted-foreground";
                    // Color-backed modes use a swatch; status/priority/agent keep their level icons.
                    const showColorSwatch =
                      groupingMode === "label" ||
                      groupingMode === "project" ||
                      groupingMode === "group" ||
                      groupingMode === "time" ||
                      (!HeaderIcon && Boolean(column.color));

                    return (
                      <DroppableColumn
                        key={column.key}
                        columnKey={column.key}
                        activeDragItem={activeDragItem}
                        dropDisabled={!dragAssignable}
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
                                className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                                title={t("column.hide", { label: title })}
                              >
                                <EyeOff className="size-3.5" />
                              </button>
                              {groupingMode === "status" && column.status ? (
                                <button
                                  type="button"
                                  onClick={() => openCreateWorkspaceDialog(column.status)}
                                  className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                                  title={t("column.createWorkspace", { label: title })}
                                >
                                  <Plus className="size-3.5" />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </header>
                        <div className="scrollbar-on-hover relative min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
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
                              onSetWorkspaceGroup={onSetWorkspaceGroup}
                              onCreateGroup={onCreateGroup}
                              onCreateLabel={onCreateLabel}
                              onUpdateLabel={onUpdateLabel}
                              onUpdateLabels={onUpdateLabels}
                              onPinWorkspace={onPinWorkspace}
                              onUnpinWorkspace={onUnpinWorkspace}
                              onArchiveWorkspace={onArchiveWorkspace}
                              onDeleteWorkspace={onDeleteWorkspace}
                            />
                          ))}
                        </div>
                      </DroppableColumn>
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
                          const statusMeta = groupingMode === "status"
                            ? getWorkspaceWorkflowStatusMeta(column.status ?? column.key)
                            : null;
                          const priorityMeta = column.priority
                            ? getWorkspacePriorityMeta(column.priority)
                            : null;
                          const agentMeta = column.agentGroup
                            ? getWorkspaceAgentGroupMeta(column.agentGroup)
                            : null;
                          const HiddenIcon =
                            statusMeta?.icon ??
                            priorityMeta?.icon ??
                            agentMeta?.icon ??
                            null;
                          const hiddenIconClass =
                            statusMeta?.className ??
                            priorityMeta?.className ??
                            agentMeta?.className ??
                            "text-muted-foreground";
                          return (
                            <div key={column.key} className="flex items-center rounded-md border border-border/60 bg-background px-2 py-1.5">
                              {HiddenIcon ? (
                                <HiddenIcon className={cn("size-2.5 shrink-0", hiddenIconClass)} />
                              ) : (
                                <span
                                  className="size-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: column.color }}
                                />
                              )}
                              <span className="ml-2 truncate text-xs text-foreground">{title}</span>
                              <span className="ml-1 text-xs text-muted-foreground">{hiddenCount}</span>
                              <button
                                type="button"
                                onClick={() => showColumn(column.key)}
                                className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
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
                {/*
                  Portal outside center Panel (`contain: layout`). Fixed overlay
                  coords are viewport-based; contain creates a new fixed CB and
                  shifts the preview right by the panel's left offset.
                */}
                {typeof document !== "undefined"
                  ? createPortal(
                      <DragOverlay dropAnimation={null} zIndex={1600}>
                        {activeDragItem ? (
                          <KanbanDragPreview
                            item={activeDragItem}
                            cardProperties={cardProperties}
                            groups={groups}
                            availableLabels={availableLabels}
                          />
                        ) : null}
                      </DragOverlay>,
                      document.body,
                    )
                  : null}
              </DndContext>
            ) : (
              <div className="grid h-full min-w-max grid-flow-col auto-cols-[348px] gap-2" />
            )}
          </div>
      <CreateWorkspaceDialog
        isOpen={isCreateWorkspaceOpen}
        onClose={() => setIsCreateWorkspaceOpen(false)}
        defaultWorkflowStatus={createWorkspaceStatus}
        projectSelectionInHeader
        requireProjectSelection
      />
    </div>
  );
}
