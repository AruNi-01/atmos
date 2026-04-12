"use client";

import React from "react";
import {
  Badge,
  Button,
  DndContext,
  DragOverlay,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@workspace/ui";
import type { DragEndEvent, DragStartEvent } from "@workspace/ui";
import { functionSettingsApi } from "@/api/ws-api";
import { useAppRouter } from "@/hooks/use-app-router";
import { useQueryState } from "nuqs";
import { leftSidebarParams } from "@/lib/nuqs/searchParams";
import type {
  Project,
  Workspace,
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/types/types";
import { formatRelativeTime } from "@atmos/shared";
import {
  getWorkspaceWorkflowStatusMeta,
  WORKSPACE_WORKFLOW_STATUS_OPTIONS,
} from "@/components/layout/sidebar/workspace-status";
import {
  getWorkspacePriorityMeta,
  WORKSPACE_PRIORITY_OPTIONS,
  WORKSPACE_PRIORITY_SORT_WEIGHT,
  WorkspaceLabelBadges,
  WorkspaceLabelPicker,
  WorkspacePrioritySelect,
  WorkspaceStatusSelect,
} from "@/components/layout/sidebar/workspace-metadata-controls";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  CircleCheck,
  Eye,
  EyeOff,
  Flag,
  Folder,
  ListFilter,
  LogIn,
  Plus,
  Search,
  Settings2,
  Tags,
  X,
} from "lucide-react";
import { CreateWorkspaceDialog } from "@/components/dialogs/CreateWorkspaceDialog";

type KanbanEntry = {
  projectId: string;
  projectName: string;
  workspace: Workspace;
};

type BoardColumn = {
  status: WorkspaceWorkflowStatus;
};

const BOARD_COLUMNS: BoardColumn[] = WORKSPACE_WORKFLOW_STATUS_OPTIONS.map((option) => ({
  status: option.value,
}));

const STATUS_COLOR_MAP: Record<WorkspaceWorkflowStatus, string> = {
  backlog: "#94a3b8",
  todo: "#94a3b8",
  in_progress: "#3b82f6",
  in_review: "#22c55e",
  blocked: "#eab308",
  completed: "#8b5cf6",
  canceled: "#6b7280",
};

const KANBAN_SORT_BY_VALUES = ["last_visit", "create_time", "priority"] as const;
const KANBAN_SORT_ORDER_VALUES = ["asc", "desc"] as const;
const KANBAN_CARD_PROPERTY_KEYS = [
  "project",
  "priority",
  "status",
  "workspace_name",
  "display_name",
  "labels",
  "last_visit",
  "enter_button",
] as const;

type KanbanSortBy = (typeof KANBAN_SORT_BY_VALUES)[number];
type KanbanSortOrder = (typeof KANBAN_SORT_ORDER_VALUES)[number];
type KanbanCardPropertyKey = (typeof KANBAN_CARD_PROPERTY_KEYS)[number];
type KanbanCardProperties = Record<KanbanCardPropertyKey, boolean>;

const DEFAULT_KANBAN_CARD_PROPERTIES: KanbanCardProperties = {
  project: true,
  priority: true,
  status: true,
  workspace_name: true,
  display_name: true,
  labels: true,
  last_visit: true,
  enter_button: true,
};

const KANBAN_CARD_PROPERTY_OPTIONS: Array<{ key: KanbanCardPropertyKey; label: string }> = [
  { key: "project", label: "Project" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "workspace_name", label: "Workspace Name" },
  { key: "display_name", label: "Display Name" },
  { key: "labels", label: "Labels" },
  { key: "last_visit", label: "Last Visit" },
  { key: "enter_button", label: "Enter Button" },
];
type WorkspaceKanbanViewSavedState = {
  sort_by: KanbanSortBy;
  sort_order: KanbanSortOrder;
  filters: {
    search_query: string;
    statuses: WorkspaceWorkflowStatus[];
    priorities: WorkspacePriority[];
    label_ids: string[];
    project_ids: string[];
    hidden_columns: WorkspaceWorkflowStatus[];
  };
  properties: KanbanCardProperties;
};

interface WorkspaceKanbanViewProps {
  projects: Project[];
  availableLabels: WorkspaceLabel[];
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
  onCreateLabel: (data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateLabel: (labelId: string, data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateLabels: (
    projectId: string,
    workspaceId: string,
    labels: WorkspaceLabel[],
  ) => Promise<void>;
  trigger: React.ReactNode;
}

function KanbanWorkspaceCard({
  workspace,
  projectId,
  projectName,
  cardProperties,
  onEnterWorkspace,
  availableLabels,
  onUpdateWorkflowStatus,
  onUpdatePriority,
  onCreateLabel,
  onUpdateLabel,
  onUpdateLabels,
}: {
  workspace: Workspace;
  projectId: string;
  projectName: string;
  cardProperties: KanbanCardProperties;
  onEnterWorkspace: (projectId: string, workspaceId: string) => void;
  availableLabels: WorkspaceLabel[];
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
  onCreateLabel: (data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateLabel: (labelId: string, data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateLabels: (
    projectId: string,
    workspaceId: string,
    labels: WorkspaceLabel[],
  ) => Promise<void>;
}) {
  return (
    <div className="w-full rounded-md border border-border bg-background p-3 text-left shadow-xs">
      {cardProperties.project || cardProperties.priority || cardProperties.status ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {cardProperties.priority ? (
              <WorkspacePrioritySelect
                value={workspace.priority}
                onChange={(value) => void onUpdatePriority(projectId, workspace.id, value)}
                triggerVariant="icon"
                contentSide="right"
                triggerClassName="size-6 border border-border/60 bg-muted/35"
              />
            ) : null}
            {cardProperties.project ? <span className="text-sm font-medium text-foreground">{projectName}</span> : null}
          </div>
          {cardProperties.status ? (
            <WorkspaceStatusSelect
              value={workspace.workflowStatus}
              onChange={(value) => void onUpdateWorkflowStatus(projectId, workspace.id, value)}
              triggerVariant="icon"
              contentSide="right"
              triggerClassName="size-6 bg-muted/35"
            />
          ) : null}
        </div>
      ) : null}

      {cardProperties.workspace_name ? <h3 className="mb-2 line-clamp-2 text-sm font-semibold">{workspace.name}</h3> : null}
      {cardProperties.display_name && workspace.displayName?.trim() ? (
        <div className="mb-3 text-xs text-muted-foreground">{workspace.displayName}</div>
      ) : null}

      {cardProperties.labels ? (
        <div className="mb-3 flex min-h-[1.5rem] flex-wrap items-center gap-1.5">
          <WorkspaceLabelPicker
            labels={workspace.labels}
            availableLabels={availableLabels}
            onChange={(nextLabels) => onUpdateLabels(projectId, workspace.id, nextLabels)}
            onCreateLabel={onCreateLabel}
            onUpdateLabel={onUpdateLabel}
            contentSide="right"
          />
          <WorkspaceLabelBadges labels={workspace.labels} className="contents" />
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between pt-2">
        {cardProperties.last_visit ? (
          <span className="text-xs text-muted-foreground">{formatRelativeTime(workspace.lastVisitedAt ?? workspace.createdAt)}</span>
        ) : <span />}
        {cardProperties.enter_button ? (
          <Button
            size="sm"
            variant="outline"
            className="size-7 p-0"
            onClick={() => {
              onEnterWorkspace(projectId, workspace.id);
            }}
            aria-label="Enter workspace"
          >
            <LogIn className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface DragItem {
  id: string;
  projectId: string;
  status: WorkspaceWorkflowStatus;
  preview: {
    projectName: string;
    workspaceName: string;
    displayName?: string | null;
    priority: WorkspacePriority;
    workflowStatus: WorkspaceWorkflowStatus;
    labels: WorkspaceLabel[];
    lastVisitedAt?: string | null;
    createdAt: string;
  };
}

function DraggableWorkspaceCard(props: React.ComponentProps<typeof KanbanWorkspaceCard> & { isRecentlyDropped?: boolean }) {
  const { isRecentlyDropped, ...cardProps } = props;
  const dragItem = React.useMemo<DragItem>(() => ({
    id: cardProps.workspace.id,
    projectId: cardProps.projectId,
    status: cardProps.workspace.workflowStatus,
    preview: {
      projectName: cardProps.projectName,
      workspaceName: cardProps.workspace.name,
      displayName: cardProps.workspace.displayName,
      priority: cardProps.workspace.priority,
      workflowStatus: cardProps.workspace.workflowStatus,
      labels: cardProps.workspace.labels,
      lastVisitedAt: cardProps.workspace.lastVisitedAt,
      createdAt: cardProps.workspace.createdAt,
    },
  }), [cardProps.projectId, cardProps.projectName, cardProps.workspace]);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `workspace:${cardProps.workspace.id}`,
    data: { item: dragItem },
  });

  const nodeRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isRecentlyDropped && nodeRef.current) {
      setTimeout(() => {
        nodeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  }, [isRecentlyDropped]);

  return (
    <div
      ref={(node) => {
        nodeRef.current = node;
        setNodeRef(node);
      }}
      {...attributes}
      {...listeners}
      className={cn(
        "relative z-0",
        isDragging && "z-50"
      )}
      style={{ opacity: isDragging ? 0.3 : 1, cursor: "grab" }}
    >
      <div className={cn(
        "transition-all duration-500 ease-out rounded-md",
        isDragging && "scale-[1.01] shadow-lg ring-1 ring-border/40",
        isRecentlyDropped && "bg-primary/20 ring-2 ring-primary animate-pulse"
      )}>
        <KanbanWorkspaceCard {...cardProps} />
      </div>
    </div>
  );
}

function KanbanDragPreview({ item }: { item: DragItem }) {
  const priorityOption = getWorkspacePriorityMeta(item.preview.priority);
  const statusMeta = getWorkspaceWorkflowStatusMeta(item.preview.workflowStatus);
  const PriorityIcon = priorityOption.icon;
  const StatusIcon = statusMeta.icon;

  return (
    <div className="w-[348px] origin-[20%_20%] rotate-[2.6deg]">
      <div className="rounded-md border border-border bg-background p-3 shadow-2xl ring-1 ring-border/40">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-md border border-border/60 bg-muted/35">
              <PriorityIcon className={cn("shrink-0", priorityOption.className)} />
            </span>
            <span className="text-sm font-medium text-foreground">{item.preview.projectName}</span>
          </div>
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-muted/35">
            <StatusIcon className={cn("size-3.5 shrink-0", statusMeta.className)} />
          </span>
        </div>
        <h3 className="mb-2 line-clamp-2 text-sm font-semibold">{item.preview.workspaceName}</h3>
        {item.preview.displayName?.trim() ? (
          <div className="mb-3 text-xs text-muted-foreground">{item.preview.displayName}</div>
        ) : null}
        <div className="mb-3 flex min-h-[1.5rem] flex-wrap items-center gap-1.5">
          {item.preview.labels.slice(0, 4).map((label) => (
            <Badge key={label.id} variant="outline" className="gap-1.5 rounded-full bg-background text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: label.color }} aria-hidden="true" />
              {label.name}
            </Badge>
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(item.preview.lastVisitedAt ?? item.preview.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

function DroppableColumn({
  status,
  activeDragItem,
  children,
}: {
  status: WorkspaceWorkflowStatus;
  activeDragItem: DragItem | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `kanban-status:${status}`,
    data: { status },
  });
  const isValidTarget = isOver && activeDragItem?.status !== status;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "scrollbar-on-hover relative min-h-0 flex-1 space-y-2 overflow-y-auto p-2 transition-colors",
        isValidTarget && "bg-muted/30"
      )}
    >
      {children}
    </div>
  );
}

export function WorkspaceKanbanView({
  projects,
  availableLabels,
  onUpdateWorkflowStatus,
  onUpdatePriority,
  onCreateLabel,
  onUpdateLabel,
  onUpdateLabels,
  trigger,
}: WorkspaceKanbanViewProps) {
  const router = useAppRouter();
  const [isKanbanExpanded, setIsKanbanExpanded] = useQueryState("lsKanban", leftSidebarParams.lsKanban);
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
  const [selectedStatuses, setSelectedStatuses] = React.useState<WorkspaceWorkflowStatus[]>([]);
  const [selectedPriorities, setSelectedPriorities] = React.useState<WorkspacePriority[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = React.useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = React.useState<string[]>([]);
  const [recentlyDroppedId, setRecentlyDroppedId] = React.useState<string | null>(null);
  const [activeDragItem, setActiveDragItem] = React.useState<DragItem | null>(null);
  const [hiddenColumns, setHiddenColumns] = React.useState<WorkspaceWorkflowStatus[]>([]);
  const [sortBy, setSortBy] = React.useState<KanbanSortBy>("last_visit");
  const [sortOrder, setSortOrder] = React.useState<KanbanSortOrder>("desc");
  const [cardProperties, setCardProperties] = React.useState<KanbanCardProperties>(DEFAULT_KANBAN_CARD_PROPERTIES);
  const [isSettingsReady, setIsSettingsReady] = React.useState(false);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = React.useState(false);
  const [createWorkspaceStatus, setCreateWorkspaceStatus] =
    React.useState<WorkspaceWorkflowStatus>("in_progress");
  const skipPersistRef = React.useRef(false);
  const [labelFilterQuery, setLabelFilterQuery] = React.useState("");
  const [projectFilterQuery, setProjectFilterQuery] = React.useState("");
  const searchContainerRef = React.useRef<HTMLDivElement | null>(null);
  const boardScrollRef = React.useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
  );

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
      const settings = await functionSettingsApi.get();
      const section = settings.workspace_kanban_view;
      const raw = (section && typeof section === "object" && "state" in (section as Record<string, unknown>))
        ? (section as { state?: unknown }).state
        : section;
      const state = (raw && typeof raw === "object") ? raw as Partial<WorkspaceKanbanViewSavedState> : {};
      const filters =
        state.filters && typeof state.filters === "object"
          ? (state.filters as Partial<WorkspaceKanbanViewSavedState["filters"]>)
          : {};
      const properties =
        state.properties && typeof state.properties === "object"
          ? (state.properties as Partial<KanbanCardProperties>)
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
      const loadedHiddenColumns = Array.isArray(filters.hidden_columns)
        ? filters.hidden_columns.filter((item): item is WorkspaceWorkflowStatus => availableStatusSet.has(item as WorkspaceWorkflowStatus))
        : [];

      const nextCardProperties = KANBAN_CARD_PROPERTY_KEYS.reduce<KanbanCardProperties>((acc, key) => {
        const rawValue = properties[key];
        acc[key] = typeof rawValue === "boolean" ? rawValue : DEFAULT_KANBAN_CARD_PROPERTIES[key];
        return acc;
      }, { ...DEFAULT_KANBAN_CARD_PROPERTIES });

      setSortBy(loadedSortBy);
      setSortOrder(loadedSortOrder);
      const loadedSearchQuery = typeof filters.search_query === "string" ? filters.search_query : "";
      setSearchQuery((prev) => (prev.trim() ? prev : loadedSearchQuery));
      setSelectedStatuses(loadedStatuses);
      setSelectedPriorities(loadedPriorities);
      setSelectedLabelIds(loadedLabelIds);
      setSelectedProjectIds(loadedProjectIds);
      setHiddenColumns(loadedHiddenColumns);
      setCardProperties(nextCardProperties);
    } catch {
      if (blocking) {
        setSortBy("last_visit");
        setSortOrder("desc");
        setSelectedStatuses([]);
        setSelectedPriorities([]);
        setSelectedLabelIds([]);
        setSelectedProjectIds([]);
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
  }, [availablePrioritySet, availableStatusSet, setSearchQuery]);

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
        statuses: selectedStatuses,
        priorities: selectedPriorities,
        label_ids: selectedLabelIds,
        project_ids: selectedProjectIds,
        hidden_columns: hiddenColumns,
      },
      properties: cardProperties,
    };

    await functionSettingsApi.update("workspace_kanban_view", "state", payload);
  }, [
    cardProperties,
    hiddenColumns,
    searchQuery,
    selectedLabelIds,
    selectedPriorities,
    selectedProjectIds,
    selectedStatuses,
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

  const activeFilterTypeCount = [
    selectedStatuses.length > 0,
    selectedPriorities.length > 0,
    selectedLabelIds.length > 0,
    selectedProjectIds.length > 0,
  ].filter(Boolean).length;

  const toggleStatus = (value: WorkspaceWorkflowStatus) =>
    setSelectedStatuses((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  const togglePriority = (value: WorkspacePriority) =>
    setSelectedPriorities((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  const toggleLabel = (value: string) =>
    setSelectedLabelIds((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  const toggleProject = (value: string) =>
    setSelectedProjectIds((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );

  const grouped = React.useMemo(() => {
    const buckets = new Map<WorkspaceWorkflowStatus, KanbanEntry[]>();
    projects.forEach((project) => {
      project.workspaces.forEach((workspace) => {
        if (selectedProjectIds.length > 0 && !selectedProjectIds.includes(project.id)) return;
        if (selectedStatuses.length > 0 && !selectedStatuses.includes(workspace.workflowStatus)) return;
        if (selectedPriorities.length > 0 && !selectedPriorities.includes(workspace.priority)) return;
        if (
          selectedLabelIds.length > 0 &&
          !workspace.labels.some((label) => selectedLabelIds.includes(label.id))
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

        const list = buckets.get(workspace.workflowStatus) ?? [];
        list.push({ projectId: project.id, projectName: project.name, workspace });
        buckets.set(workspace.workflowStatus, list);
      });
    });

    buckets.forEach((list) => {
      list.sort((a, b) => {
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
  }, [projects, searchQuery, selectedLabelIds, selectedPriorities, selectedProjectIds, selectedStatuses, sortBy, sortOrder]);

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
    const item = event.active.data.current?.item as DragItem | undefined;
    setActiveDragItem(item ?? null);
  }, []);

  const handleDragEnd = React.useCallback((event: DragEndEvent) => {
    const item = event.active.data.current?.item as DragItem | undefined;
    const targetStatus = event.over?.data.current?.status as WorkspaceWorkflowStatus | undefined;
    setActiveDragItem(null);
    if (!item || !targetStatus || item.status === targetStatus) return;

    void onUpdateWorkflowStatus(item.projectId, item.id, targetStatus);
    setRecentlyDroppedId(item.id);
    setTimeout(() => {
      setRecentlyDroppedId((prev) => (prev === item.id ? null : prev));
    }, 2000);
  }, [onUpdateWorkflowStatus]);

  const handleDragCancel = React.useCallback(() => {
    setActiveDragItem(null);
  }, []);

  const handleEnterWorkspace = React.useCallback((_projectId: string, workspaceId: string) => {
    void setIsKanbanExpanded(false).then(() => {
      router.push(`/workspace?id=${workspaceId}`);
    });
  }, [router, setIsKanbanExpanded]);

  const selectedFilterChips = React.useMemo(() => {
    const chips: Array<{
      key: string;
      label: string;
      type: "status" | "priority" | "label" | "project";
      value: string;
    }> = [];
    selectedStatuses.forEach((status) => {
      chips.push({
        key: `status-${status}`,
        label: getWorkspaceWorkflowStatusMeta(status).label,
        type: "status",
        value: status,
      });
    });
    selectedPriorities.forEach((priority) => {
      chips.push({
        key: `priority-${priority}`,
        label: WORKSPACE_PRIORITY_OPTIONS.find((item) => item.value === priority)?.label ?? priority,
        type: "priority",
        value: priority,
      });
    });
    selectedLabelIds.forEach((labelId) => {
      const label = availableLabels.find((item) => item.id === labelId);
      if (label) chips.push({ key: `label-${labelId}`, label: label.name, type: "label", value: labelId });
    });
    selectedProjectIds.forEach((projectId) => {
      const project = projects.find((item) => item.id === projectId);
      if (project) chips.push({ key: `project-${projectId}`, label: project.name, type: "project", value: projectId });
    });
    return chips;
  }, [availableLabels, projects, selectedLabelIds, selectedPriorities, selectedProjectIds, selectedStatuses]);

  const clearAllFilters = React.useCallback(() => {
    setSelectedStatuses([]);
    setSelectedPriorities([]);
    setSelectedLabelIds([]);
    setSelectedProjectIds([]);
  }, []);

  const removeFilterChip = React.useCallback((chip: {
    type: "status" | "priority" | "label" | "project";
    value: string;
  }) => {
    if (chip.type === "status") {
      setSelectedStatuses((prev) => prev.filter((item) => item !== chip.value));
      return;
    }
    if (chip.type === "priority") {
      setSelectedPriorities((prev) => prev.filter((item) => item !== chip.value));
      return;
    }
    if (chip.type === "label") {
      setSelectedLabelIds((prev) => prev.filter((item) => item !== chip.value));
      return;
    }
    setSelectedProjectIds((prev) => prev.filter((item) => item !== chip.value));
  }, []);

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

  const filteredLabelOptions = React.useMemo(() => {
    const q = labelFilterQuery.trim().toLowerCase();
    if (!q) return availableLabels;
    return availableLabels.filter((label) => label.name.toLowerCase().includes(q));
  }, [availableLabels, labelFilterQuery]);

  const filteredProjectOptions = React.useMemo(() => {
    const q = projectFilterQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(q));
  }, [projectFilterQuery, projects]);

  const visibleColumns = React.useMemo(
    () => BOARD_COLUMNS.filter((column) => !hiddenColumns.includes(column.status)),
    [hiddenColumns],
  );
  const hiddenColumnList = React.useMemo(
    () => BOARD_COLUMNS.filter((column) => hiddenColumns.includes(column.status)),
    [hiddenColumns],
  );

  const hideColumn = React.useCallback((status: WorkspaceWorkflowStatus) => {
    setHiddenColumns((prev) => (prev.includes(status) ? prev : [...prev, status]));
  }, []);

  const showColumn = React.useCallback((status: WorkspaceWorkflowStatus) => {
    setHiddenColumns((prev) => prev.filter((item) => item !== status));
    }, []);

  const openCreateWorkspaceDialog = React.useCallback((status: WorkspaceWorkflowStatus) => {
    setCreateWorkspaceStatus(status);
    setIsCreateWorkspaceOpen(true);
  }, []);

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
        className="top-1/2 left-1/2 h-[100dvh] w-[100vw] max-w-[100vw] translate-x-[-50%] translate-y-[-50%] gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] sm:rounded-2xl sm:border sm:border-border"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Workspace Kanban</DialogTitle>
          <DialogDescription>Expanded kanban board view</DialogDescription>
        </DialogHeader>
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <div className="flex h-10 items-center justify-between border-b px-6 py-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button size="xs" variant="secondary" className="relative">
                    {activeFilterTypeCount > 0 ? (
                      <span className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                        {activeFilterTypeCount}
                      </span>
                    ) : null}
                    <ListFilter className="mr-1 size-4" />
                    Filter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 p-1">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Folder className="size-4" />
                      Project
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      <div className="p-2">
                        <Input
                          value={projectFilterQuery}
                          onChange={(e) => setProjectFilterQuery(e.target.value)}
                          placeholder="Search projects..."
                          className="h-7 text-xs"
                        />
                      </div>
                      {filteredProjectOptions.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No matching projects</div>
                      ) : (
                        filteredProjectOptions.map((project) => (
                          <DropdownMenuItem
                            key={project.id}
                            onSelect={(e) => {
                              e.preventDefault();
                              toggleProject(project.id);
                            }}
                            className="cursor-pointer"
                          >
                            <span>{project.name}</span>
                            {selectedProjectIds.includes(project.id) ? <Check className="ml-auto size-4" /> : null}
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <CircleCheck className="size-4" />
                      Status
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      {WORKSPACE_WORKFLOW_STATUS_OPTIONS.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          onSelect={(e) => {
                            e.preventDefault();
                            toggleStatus(option.value);
                          }}
                          className="cursor-pointer"
                        >
                          <option.icon className={cn("size-4", option.className)} />
                          <span>{option.label}</span>
                          {selectedStatuses.includes(option.value) ? <Check className="ml-auto size-4" /> : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Flag className="size-4" />
                      Priority
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      {WORKSPACE_PRIORITY_OPTIONS.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          onSelect={(e) => {
                            e.preventDefault();
                            togglePriority(option.value);
                          }}
                          className="cursor-pointer"
                        >
                          <option.icon className={cn("size-4", option.className)} />
                          <span>{option.label}</span>
                          {selectedPriorities.includes(option.value) ? <Check className="ml-auto size-4" /> : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Tags className="size-4" />
                      Labels
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      <div className="p-2">
                        <Input
                          value={labelFilterQuery}
                          onChange={(e) => setLabelFilterQuery(e.target.value)}
                          placeholder="Search labels..."
                          className="h-7 text-xs"
                        />
                      </div>
                      {filteredLabelOptions.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No matching labels</div>
                      ) : (
                        filteredLabelOptions.map((label) => (
                          <DropdownMenuItem
                            key={label.id}
                            onSelect={(e) => {
                              e.preventDefault();
                              toggleLabel(label.id);
                            }}
                            className="cursor-pointer"
                          >
                            <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} />
                            <span>{label.name}</span>
                            {selectedLabelIds.includes(label.id) ? <Check className="ml-auto size-4" /> : null}
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  {activeFilterTypeCount > 0 ? (
                    <>
                      <DropdownMenuSeparator className="mx-2" />
                      <DropdownMenuItem
                        onClick={clearAllFilters}
                        className="text-xs font-medium text-muted-foreground"
                      >
                        Clear All Filters
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>

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
                        title={`Remove ${chip.label}`}
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
                    placeholder="Search project/workspace..."
                    className={cn(
                      "h-7 border-0 bg-transparent pr-8 text-xs shadow-none focus-visible:ring-0",
                      isSearchOpen ? "opacity-100" : "pointer-events-none opacity-0",
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
                      <span className="text-xs font-medium text-foreground">Order</span>
                      <div className="flex items-center gap-1.5">
                        <Select value={sortBy} onValueChange={(value) => setSortBy(value as KanbanSortBy)}>
                          <SelectTrigger className="h-5 w-[112px] px-2 text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="last_visit">Last Visit</SelectItem>
                            <SelectItem value="create_time">Create Time</SelectItem>
                            <SelectItem value="priority">Priority</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="icon-xs"
                          variant="outline"
                          className="size-5"
                          onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
                          aria-label={sortOrder === "desc" ? "Switch to ascending" : "Switch to descending"}
                          title={sortOrder === "desc" ? "Descending" : "Ascending"}
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
                    <div className="pb-1 text-xs font-medium text-foreground">Properties</div>
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
            </div>
          </div>
          <div
            ref={boardScrollRef}
            className="scrollbar-on-hover min-h-0 min-w-0 flex-1 overflow-x-scroll overflow-y-hidden p-2"
          >
            {!isSettingsReady ? (
              <div className="flex h-full min-h-[260px] items-center justify-center text-sm text-muted-foreground">
                Loading kanban settings...
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
                    const items = grouped.get(column.status) ?? [];
                    const meta = getWorkspaceWorkflowStatusMeta(column.status);
                    const StatusIcon = meta.icon;

                    return (
                      <section
                        key={column.status}
                        className="flex h-full flex-shrink-0 flex-col overflow-hidden rounded-md"
                        style={{ backgroundColor: `${STATUS_COLOR_MAP[column.status]}10` }}
                      >
                        <header className={cn("sticky top-0 z-10 h-[44px] rounded-t-md px-3")}>
                          <div className="flex h-full w-full items-center justify-between">
                            <div className="flex items-center gap-2">
                              <StatusIcon className={cn("size-3.5", meta.className)} />
                              <span className="text-sm font-medium">{meta.label}</span>
                              <span className="text-sm text-muted-foreground">{items.length}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => hideColumn(column.status)}
                                className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                title={`Hide ${meta.label}`}
                              >
                                <EyeOff className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openCreateWorkspaceDialog(column.status)}
                                className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                title={`Create workspace in ${meta.label}`}
                              >
                                <Plus className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        </header>
                        <DroppableColumn status={column.status} activeDragItem={activeDragItem}>
                          {items.map(({ projectId, projectName, workspace }) => (
                            <DraggableWorkspaceCard
                              key={workspace.id}
                              isRecentlyDropped={recentlyDroppedId === workspace.id}
                              workspace={workspace}
                              projectId={projectId}
                              projectName={projectName}
                              cardProperties={cardProperties}
                              onEnterWorkspace={handleEnterWorkspace}
                              availableLabels={availableLabels}
                              onUpdateWorkflowStatus={onUpdateWorkflowStatus}
                              onUpdatePriority={onUpdatePriority}
                              onCreateLabel={onCreateLabel}
                              onUpdateLabel={onUpdateLabel}
                              onUpdateLabels={onUpdateLabels}
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
                          <span className="text-sm font-medium text-muted-foreground">Hidden columns</span>
                        </div>
                      </header>
                      <div className="space-y-2 p-2">
                        {hiddenColumnList.map((column) => {
                          const meta = getWorkspaceWorkflowStatusMeta(column.status);
                          const StatusIcon = meta.icon;
                          const hiddenCount = (grouped.get(column.status) ?? []).length;
                          return (
                            <div key={column.status} className="flex items-center rounded-md border border-border/60 bg-background px-2 py-1.5">
                              <StatusIcon className={cn("size-3.5", meta.className)} />
                              <span className="ml-2 text-xs text-foreground">{meta.label}</span>
                              <span className="ml-1 text-xs text-muted-foreground">{hiddenCount}</span>
                              <button
                                type="button"
                                onClick={() => showColumn(column.status)}
                                className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                title={`Show ${meta.label}`}
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
        onClose={() => setIsCreateWorkspaceOpen(false)}
        defaultWorkflowStatus={createWorkspaceStatus}
        projectSelectionInHeader
        requireProjectSelection
      />
    </Dialog>
  );
}
