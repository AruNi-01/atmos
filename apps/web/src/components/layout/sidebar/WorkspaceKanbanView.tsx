"use client";

import React from "react";
import { DndProvider, useDrag, useDragLayer, useDrop } from "react-dnd";
import { getEmptyImage, HTML5Backend } from "react-dnd-html5-backend";
import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from "@workspace/ui";
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
import { PROJECT_COLOR_PRESETS } from "@/types/types";
import { formatRelativeTime } from "@atmos/shared";
import {
  getWorkspaceWorkflowStatusMeta,
  WORKSPACE_WORKFLOW_STATUS_OPTIONS,
} from "@/components/layout/sidebar/workspace-status";
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
  Search,
  Settings2,
  Tags,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { SketchPicker } from "react-color";

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

const PRIORITY_META: Record<WorkspacePriority, { label: string; className: string; dot: string }> = {
  no_priority: { label: "No priority", className: "text-muted-foreground", dot: "bg-muted-foreground/60" },
  urgent: { label: "Urgent", className: "text-red-400", dot: "bg-red-400" },
  high: { label: "High", className: "text-orange-400", dot: "bg-orange-400" },
  medium: { label: "Medium", className: "text-yellow-400", dot: "bg-yellow-400" },
  low: { label: "Low", className: "text-emerald-400", dot: "bg-emerald-400" },
};

const WORKSPACE_PRIORITY_OPTIONS: Array<{
  value: WorkspacePriority;
  label: string;
  className: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "no_priority", label: "No priority", className: "text-muted-foreground", icon: PriorityNoneIcon },
  { value: "urgent", label: "Urgent", className: "text-red-500/85", icon: PriorityUrgentIcon },
  { value: "high", label: "High", className: "text-orange-500", icon: PriorityBarsHighIcon },
  { value: "medium", label: "Medium", className: "text-yellow-500", icon: PriorityBarsMediumIcon },
  { value: "low", label: "Low", className: "text-emerald-500", icon: PriorityBarsLowIcon },
];

const LABEL_COLOR_PRESETS = [...PROJECT_COLOR_PRESETS, { name: "Cyan", color: "#06b6d4" }];
const WORKSPACE_PRIORITY_SORT_WEIGHT: Record<WorkspacePriority, number> = {
  no_priority: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
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

function PriorityNoneIcon({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-4 flex-col items-center justify-center gap-[3px]", className)}>
      {[0, 1, 2].map((line) => (
        <span key={line} className="h-[1.5px] w-3 rounded-full bg-current" />
      ))}
    </span>
  );
}

function PriorityUrgentIcon({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-4 items-center justify-center rounded-[3px] bg-current", className)}>
      <span className="text-[11px] font-bold leading-none text-background">!</span>
    </span>
  );
}

function PriorityBarsIcon({
  className,
  activeBars,
}: {
  className?: string;
  activeBars: number;
}) {
  return (
    <span className={cn("inline-flex h-4 w-4 items-end gap-[2px]", className)}>
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={cn(
            "w-[3px] rounded-[1px] bg-current",
            bar === 1 && "h-1.5",
            bar === 2 && "h-2.5",
            bar === 3 && "h-3.5",
            bar > activeBars && "opacity-30",
          )}
        />
      ))}
    </span>
  );
}

function PriorityBarsHighIcon({ className }: { className?: string }) {
  return <PriorityBarsIcon className={className} activeBars={3} />;
}

function PriorityBarsMediumIcon({ className }: { className?: string }) {
  return <PriorityBarsIcon className={className} activeBars={2} />;
}

function PriorityBarsLowIcon({ className }: { className?: string }) {
  return <PriorityBarsIcon className={className} activeBars={1} />;
}

function parseHexColor(color: string) {
  const hex = color.replace("#", "");
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function parseColorToRgb(color: string): { r: number; g: number; b: number; a: number } {
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1], 10),
      g: parseInt(rgbaMatch[2], 10),
      b: parseInt(rgbaMatch[3], 10),
      a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1,
    };
  }
  return { ...parseHexColor(color), a: 1 };
}

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
  onEnterWorkspace: () => void;
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
  const router = useAppRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [isLabelPopoverOpen, setIsLabelPopoverOpen] = React.useState(false);
  const [labelEditorKey, setLabelEditorKey] = React.useState<string | null>(null);
  const [editingLabel, setEditingLabel] = React.useState<WorkspaceLabel | null>(null);
  const [labelSearchQuery, setLabelSearchQuery] = React.useState("");
  const [newLabelName, setNewLabelName] = React.useState("");
  const [newLabelColor, setNewLabelColor] = React.useState({ r: 59, g: 130, b: 246, a: 1 });

  const statusMeta = getWorkspaceWorkflowStatusMeta(workspace.workflowStatus);
  const StatusIcon = statusMeta.icon;
  const priorityOption =
    WORKSPACE_PRIORITY_OPTIONS.find((option) => option.value === workspace.priority) ?? WORKSPACE_PRIORITY_OPTIONS[0];
  const PriorityIcon = priorityOption.icon;
  const selectedLabelIds = React.useMemo(
    () => new Set(workspace.labels.map((label) => label.id)),
    [workspace.labels],
  );
  const filteredAvailableLabels = React.useMemo(() => {
    const query = labelSearchQuery.trim().toLowerCase();
    if (!query) return availableLabels;
    return availableLabels.filter((label) => label.name.toLowerCase().includes(query));
  }, [availableLabels, labelSearchQuery]);

  const handleToggleLabel = React.useCallback((label: WorkspaceLabel) => {
    const nextLabels = selectedLabelIds.has(label.id)
      ? workspace.labels.filter((existing) => existing.id !== label.id)
      : [...workspace.labels, label];
    void onUpdateLabels(projectId, workspace.id, nextLabels);
  }, [onUpdateLabels, projectId, selectedLabelIds, workspace.id, workspace.labels]);

  const handleCreateLabel = React.useCallback(async () => {
    const name = newLabelName.trim();
    if (!name) return;
    const color = `rgba(${newLabelColor.r}, ${newLabelColor.g}, ${newLabelColor.b}, ${newLabelColor.a})`;
    const label = editingLabel
      ? await onUpdateLabel(editingLabel.id, { name, color })
      : await onCreateLabel({ name, color });
    const nextLabels = selectedLabelIds.has(label.id) ? workspace.labels : [...workspace.labels, label];
    await onUpdateLabels(projectId, workspace.id, nextLabels);
    setNewLabelName("");
    setLabelEditorKey(null);
    setEditingLabel(null);
  }, [editingLabel, newLabelColor, newLabelName, onCreateLabel, onUpdateLabel, onUpdateLabels, projectId, selectedLabelIds, workspace.id, workspace.labels]);

  const openLabelEditor = React.useCallback((label: WorkspaceLabel | null) => {
    setEditingLabel(label);
    setNewLabelName(label?.name ?? "");
    setNewLabelColor(label?.color ? parseColorToRgb(label.color) : { r: 59, g: 130, b: 246, a: 1 });
    setLabelEditorKey(label?.id ?? "new");
  }, []);

  return (
    <div className="w-full rounded-md border border-border bg-background p-3 text-left shadow-xs">
      {cardProperties.project || cardProperties.priority || cardProperties.status ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {cardProperties.priority ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 items-center justify-center rounded-md border border-border/60 bg-muted/35 text-xs text-foreground transition-colors hover:bg-muted"
                  >
                    <PriorityIcon className={cn("shrink-0", priorityOption.className)} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" className="w-40">
                  <DropdownMenuRadioGroup
                    value={workspace.priority}
                    onValueChange={(value) => void onUpdatePriority(projectId, workspace.id, value as WorkspacePriority)}
                  >
                    {WORKSPACE_PRIORITY_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={option.value}
                        className="cursor-pointer pl-2 data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground [&>span:first-child]:hidden"
                      >
                        <option.icon className={cn("shrink-0", option.className)} />
                        <span className="font-medium">{option.label}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {cardProperties.project ? <span className="text-sm font-medium text-foreground">{projectName}</span> : null}
          </div>
          {cardProperties.status ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-6 items-center justify-center rounded-md bg-muted/35 text-foreground transition-colors hover:bg-muted"
                  title={statusMeta.label}
                >
                  <StatusIcon className={cn("size-3.5 shrink-0", statusMeta.className)} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-40">
                <DropdownMenuRadioGroup
                  value={workspace.workflowStatus}
                  onValueChange={(value) =>
                    void onUpdateWorkflowStatus(projectId, workspace.id, value as WorkspaceWorkflowStatus)
                  }
                >
                  {WORKSPACE_WORKFLOW_STATUS_OPTIONS.map((option) => {
                    const OptionIcon = option.icon;
                    return (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={option.value}
                        className="cursor-pointer pl-2 data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground [&>span:first-child]:hidden"
                      >
                        <OptionIcon className={cn("size-4", option.className)} />
                        <span>{option.label}</span>
                      </DropdownMenuRadioItem>
                    );
                  })}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}

      {cardProperties.workspace_name ? <h3 className="mb-2 line-clamp-2 text-sm font-semibold">{workspace.name}</h3> : null}
      {cardProperties.display_name && workspace.displayName?.trim() ? (
        <div className="mb-3 text-xs text-muted-foreground">{workspace.displayName}</div>
      ) : null}

      {cardProperties.labels ? (
        <div className="mb-3 flex min-h-[1.5rem] flex-wrap items-center gap-1.5">
        <Popover
          open={isLabelPopoverOpen}
          onOpenChange={(open) => {
            setIsLabelPopoverOpen(open);
            if (!open) {
              setLabelEditorKey(null);
              setEditingLabel(null);
              setLabelSearchQuery("");
              setNewLabelName("");
            }
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-6 items-center rounded-full border border-dashed border-foreground/25 bg-foreground/12 px-2 text-xs font-medium text-foreground transition-colors hover:bg-foreground/18"
            >
              + Label
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-64 space-y-3 p-3">
            <Popover
              open={labelEditorKey === "new"}
              onOpenChange={(open) => {
                if (open) openLabelEditor(null);
                else if (labelEditorKey === "new") {
                  setLabelEditorKey(null);
                  setEditingLabel(null);
                }
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <span>Create New</span>
                  <span className="text-muted-foreground">+</span>
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" sideOffset={8} alignOffset={28} className="w-72 space-y-2 p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={newLabelName}
                    onChange={(event) => setNewLabelName(event.target.value)}
                    placeholder="New label"
                    className="h-7 flex-1 text-xs"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={!newLabelName.trim()}
                    onClick={() => void handleCreateLabel()}
                  >
                    {editingLabel ? "Save" : "Add"}
                  </Button>
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {LABEL_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setNewLabelColor({ ...parseHexColor(preset.color), a: 0.18 })}
                      className="h-6 w-full rounded border border-border/50 transition-transform hover:scale-105"
                      style={{ backgroundColor: preset.color }}
                      title={preset.name}
                    />
                  ))}
                </div>
                <SketchPicker
                  color={newLabelColor}
                  onChange={(color) => {
                    setNewLabelColor({
                      r: color.rgb.r,
                      g: color.rgb.g,
                      b: color.rgb.b,
                      a: color.rgb.a ?? 1,
                    });
                  }}
                  styles={{
                    default: {
                      picker: {
                        background: isDark ? "#1c1c1f" : "#fff",
                        boxSizing: "border-box",
                        borderRadius: "8px",
                        boxShadow: "none",
                        border: isDark ? "1px solid #27272a" : "1px solid #e4e4e7",
                        padding: "10px",
                        width: "100%",
                      },
                      saturation: { borderRadius: "8px" },
                      activeColor: { borderRadius: "4px" },
                      hue: { height: "10px", borderRadius: "4px" },
                      alpha: { height: "10px", borderRadius: "4px" },
                    },
                  }}
                />
              </PopoverContent>
            </Popover>
            <Input
              value={labelSearchQuery}
              onChange={(event) => setLabelSearchQuery(event.target.value)}
              placeholder="Search labels"
              className="h-7 text-xs"
            />
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {availableLabels.length === 0 ? (
                <div className="py-2 text-center text-xs text-muted-foreground">No labels yet</div>
              ) : filteredAvailableLabels.length === 0 ? (
                <div className="py-2 text-center text-xs text-muted-foreground">No matching labels</div>
              ) : filteredAvailableLabels.map((label) => (
                <div
                  key={label.id}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleToggleLabel(label);
                    }
                  }}
                  onClick={() => handleToggleLabel(label)}
                  className={cn(
                    "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-xs transition-colors hover:bg-muted",
                    selectedLabelIds.has(label.id) && "bg-muted",
                  )}
                >
                  <Checkbox
                    checked={selectedLabelIds.has(label.id)}
                    tabIndex={-1}
                    className="pointer-events-none size-3.5"
                  />
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
                  <span className="min-w-0 truncate">{label.name}</span>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {workspace.labels.map((label) => (
          <Badge key={label.id} variant="outline" className="gap-1.5 rounded-full bg-background text-muted-foreground">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: label.color }} aria-hidden="true" />
            {label.name}
          </Badge>
        ))}
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
              onEnterWorkspace();
              router.push(`/workspace?id=${workspace.id}`);
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

const CARD_DRAG_TYPE = "WORKSPACE_CARD";

interface DragItem {
  id: string;
  projectId: string;
  status: WorkspaceWorkflowStatus;
  newStatus?: WorkspaceWorkflowStatus;
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
  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: CARD_DRAG_TYPE,
    options: {
      dropEffect: "move",
    },
    item: {
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
    } as DragItem,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));
  React.useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  const nodeRef = React.useRef<HTMLDivElement>(null);
  
  React.useEffect(() => {
    if (isRecentlyDropped && nodeRef.current) {
      setTimeout(() => {
        nodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }, [isRecentlyDropped]);

  return (
    <div
      ref={(node) => {
        nodeRef.current = node;
        (drag as unknown as (node: HTMLDivElement | null) => void)(node);
      }}
      className={cn(
        "relative z-0",
        isDragging && "z-50"
      )}
      style={{ opacity: isDragging ? 0.3 : 1, cursor: "pointer" }}
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

function KanbanDragLayer() {
  const { isDragging, item, currentOffset } = useDragLayer((monitor) => ({
    item: monitor.getItem() as DragItem | null,
    isDragging: monitor.isDragging(),
    currentOffset: monitor.getSourceClientOffset(),
  }));

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.cursor;
    if (isDragging) {
      document.body.style.cursor = "pointer";
    }
    return () => {
      document.body.style.cursor = prev;
    };
  }, [isDragging]);

  if (!isDragging || !item || !currentOffset) return null;

  const priorityOption =
    WORKSPACE_PRIORITY_OPTIONS.find((option) => option.value === item.preview.priority) ?? WORKSPACE_PRIORITY_OPTIONS[0];
  const statusMeta = getWorkspaceWorkflowStatusMeta(item.preview.workflowStatus);
  const PriorityIcon = priorityOption.icon;
  const StatusIcon = statusMeta.icon;

  return (
    <div className="pointer-events-none fixed inset-0 z-[999]">
      <div
        className="w-[348px]"
        style={{
          transform: `translate(${currentOffset.x}px, ${currentOffset.y}px) rotate(2.6deg)`,
          transformOrigin: "20% 20%",
        }}
      >
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
    </div>
  );
}

function DroppableColumn({ status, onDrop, children }: { status: WorkspaceWorkflowStatus, onDrop: (item: DragItem) => void, children: React.ReactNode }) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: CARD_DRAG_TYPE,
    canDrop: () => true,
    drop: (item: DragItem) => {
      if (item.status !== status) {
        onDrop({ ...item, newStatus: status });
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver() && (monitor.getItem() as DragItem | null)?.status !== status,
    }),
  }));

  return (
    <div
      ref={drop as unknown as React.LegacyRef<HTMLDivElement>}
      className={cn(
        "scrollbar-on-hover relative min-h-0 flex-1 space-y-2 overflow-y-auto p-2 transition-colors",
        isOver && "bg-muted/30"
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
  const [hiddenColumns, setHiddenColumns] = React.useState<WorkspaceWorkflowStatus[]>([]);
  const [sortBy, setSortBy] = React.useState<KanbanSortBy>("last_visit");
  const [sortOrder, setSortOrder] = React.useState<KanbanSortOrder>("desc");
  const [cardProperties, setCardProperties] = React.useState<KanbanCardProperties>(DEFAULT_KANBAN_CARD_PROPERTIES);
  const [isSettingsReady, setIsSettingsReady] = React.useState(false);
  const [isSettingsHydrating, setIsSettingsHydrating] = React.useState(false);
  const skipPersistRef = React.useRef(false);
  const [labelFilterQuery, setLabelFilterQuery] = React.useState("");
  const [projectFilterQuery, setProjectFilterQuery] = React.useState("");
  const searchContainerRef = React.useRef<HTMLDivElement | null>(null);
  const boardScrollRef = React.useRef<HTMLDivElement | null>(null);

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
    setIsSettingsHydrating(true);
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
      setIsSettingsHydrating(false);
      if (blocking) {
        setIsSettingsReady(true);
      }
      setTimeout(() => {
        skipPersistRef.current = false;
      }, 0);
    }
  }, [availablePrioritySet, availableStatusSet]);

  React.useEffect(() => {
    if (!isKanbanExpanded) return;
    void loadWorkspaceKanbanSettings({ blocking: !isSettingsReady });
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

  const handleDrop = React.useCallback((item: DragItem) => {
    void onUpdateWorkflowStatus(item.projectId, item.id, item.newStatus as WorkspaceWorkflowStatus);
    setRecentlyDroppedId(item.id);
    setTimeout(() => {
      setRecentlyDroppedId((prev) => (prev === item.id ? null : prev));
    }, 2000);
  }, [onUpdateWorkflowStatus]);

  const handleEnterWorkspace = React.useCallback(() => {
    void setIsKanbanExpanded(false);
  }, [setIsKanbanExpanded]);

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
<DndProvider backend={HTML5Backend}>
<KanbanDragLayer />
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
                        <button
                          type="button"
                          onClick={() => hideColumn(column.status)}
                          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          title={`Hide ${meta.label}`}
                        >
                          <EyeOff className="size-3.5" />
                        </button>
                      </div>
                    </header>
                    <DroppableColumn status={column.status} onDrop={handleDrop}>
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
</DndProvider>
) : <div className="grid h-full min-w-max grid-flow-col auto-cols-[348px] gap-2" />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
