"use client";

import React, { useState } from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@workspace/ui";
import { useAppRouter } from "@/hooks/use-app-router";
import { useContextParams } from "@/hooks/use-context-params";
import {
  Pin,
  Archive,
  Trash2,
  AlertTriangle,
  GitBranch,
  Pencil,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Checkbox,
  cn,
} from "@workspace/ui";
import type { Workspace, WorkspaceLabel, WorkspacePriority } from "@/types/types";
import { PROJECT_COLOR_PRESETS } from "@/types/types";
import { formatRelativeTime } from "@atmos/shared";
import { getWorkspaceShortName } from "@/utils/workspace";
import { gitApi } from "@/api/ws-api";
import { AGENT_STATE, useAgentHooksStore } from "@/hooks/use-agent-hooks-store";
import { AgentHookStatusIndicator } from "@/components/agent/AgentHookStatusIndicator";
import { useTheme } from "next-themes";
import { SketchPicker } from "react-color";
import {
  getWorkspaceWorkflowStatusMeta,
  WORKSPACE_WORKFLOW_STATUS_OPTIONS,
} from "./workspace-status";
import type { WorkspaceWorkflowStatus } from "@/types/types";

export interface WorkspaceContentProps {
  workspace: Workspace;
  projectId: string;
  projectPath?: string;
  projectName?: string;
  showProjectName?: boolean;
  isDragging?: boolean;
  isPlaceholder?: boolean;
  attributes?: DraggableAttributes;
  listeners?: DraggableSyntheticListeners;
  onPin?: (workspaceId: string) => void;
  onUnpin?: (workspaceId: string) => void;
  onArchive?: (workspaceId: string) => void;
  onDelete?: (workspaceId: string) => void;
  onUpdateName?: (workspaceId: string, name: string) => Promise<void>;
  onUpdateWorkflowStatus?: (workspaceId: string, workflowStatus: WorkspaceWorkflowStatus) => void;
  onUpdatePriority?: (workspaceId: string, priority: WorkspacePriority) => void;
  availableLabels?: WorkspaceLabel[];
  onCreateLabel?: (data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateLabel?: (labelId: string, data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateLabels?: (workspaceId: string, labels: WorkspaceLabel[]) => Promise<void>;
}

type WorkspaceMetadataValueProps = {
  value: string;
  className?: string;
  valueClassName?: string;
  tooltipClassName?: string;
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

const LABEL_COLOR_PRESETS = [
  ...PROJECT_COLOR_PRESETS,
  { name: "Cyan", color: "#06b6d4" },
];

function PriorityNoneIcon({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-4 flex-col items-center justify-center gap-[3px]", className)}>
      {[0, 1, 2].map((line) => (
        <span
          key={line}
          className="h-[1.5px] w-3 rounded-full bg-current"
        />
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

function getWorkspacePriorityMeta(priority: WorkspacePriority) {
  return WORKSPACE_PRIORITY_OPTIONS.find(option => option.value === priority) ?? WORKSPACE_PRIORITY_OPTIONS[0];
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

function WorkspaceMetadataValue({
  value,
  className,
  valueClassName,
  tooltipClassName,
}: WorkspaceMetadataValueProps) {
  return (
    <div className={cn("min-w-0 flex-1 text-right", className)}>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-block max-w-full truncate whitespace-nowrap align-top text-foreground",
                valueClassName,
              )}
            >
              {value}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" align="center" sideOffset={8} avoidCollisions={false} className={cn("max-w-sm break-all", tooltipClassName)}>
            {value}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export const WorkspaceContent = React.memo<WorkspaceContentProps>(function WorkspaceContent({
  workspace,
  projectId,
  projectPath,
  projectName,
  showProjectName,
  isDragging,
  isPlaceholder,
  attributes,
  listeners,
  onPin,
  onUnpin,
  onArchive,
  onDelete,
  onUpdateName,
  onUpdateWorkflowStatus,
  onUpdatePriority,
  availableLabels = [],
  onCreateLabel,
  onUpdateLabel,
  onUpdateLabels,
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const router = useAppRouter();
  const { workspaceId } = useContextParams();
  const isActive = workspaceId === workspace.id;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showGitWarningDialog, setShowGitWarningDialog] = useState(false);
  const [gitWarningMessage, setGitWarningMessage] = useState('');
  const [pendingOperation, setPendingOperation] = useState<'archive' | 'delete' | null>(null);
  const [isCheckingGit, setIsCheckingGit] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editableName, setEditableName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [isInfoPopoverOpen, setIsInfoPopoverOpen] = useState(false);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isPriorityMenuOpen, setIsPriorityMenuOpen] = useState(false);
  const [isLabelPopoverOpen, setIsLabelPopoverOpen] = useState(false);
  const [labelEditorKey, setLabelEditorKey] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<WorkspaceLabel | null>(null);
  const [labelSearchQuery, setLabelSearchQuery] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState({ r: 59, g: 130, b: 246, a: 1 });
  const infoPopoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const infoPopoverTriggerRef = React.useRef<HTMLDivElement | null>(null);
  

  const cancelInfoPopoverClose = React.useCallback(() => {
    if (infoPopoverTimerRef.current) {
      clearTimeout(infoPopoverTimerRef.current);
      infoPopoverTimerRef.current = null;
    }
  }, []);

  const openInfoPopover = React.useCallback(() => {
    cancelInfoPopoverClose();
    infoPopoverTimerRef.current = setTimeout(() => {
      setIsInfoPopoverOpen(true);
      infoPopoverTimerRef.current = null;
    }, 1000);
  }, [cancelInfoPopoverClose]);

  const scheduleInfoPopoverClose = React.useCallback(() => {
    cancelInfoPopoverClose();
    infoPopoverTimerRef.current = setTimeout(() => {
      if (isStatusMenuOpen || isPriorityMenuOpen || isLabelPopoverOpen) {
        infoPopoverTimerRef.current = null;
        return;
      }
      setIsInfoPopoverOpen(false);
      infoPopoverTimerRef.current = null;
    }, 150);
  }, [cancelInfoPopoverClose, isLabelPopoverOpen, isPriorityMenuOpen, isStatusMenuOpen]);

  React.useEffect(() => {
    return () => {
      cancelInfoPopoverClose();
    };
  }, [cancelInfoPopoverClose]);

  React.useEffect(() => {
    if (!isInfoPopoverOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (infoPopoverTriggerRef.current?.contains(target)) return;
      if (target.closest("[data-workspace-popover-surface='true']")) return;

      cancelInfoPopoverClose();
      setIsInfoPopoverOpen(false);
      setIsStatusMenuOpen(false);
      setIsPriorityMenuOpen(false);
      setIsLabelPopoverOpen(false);
      setLabelEditorKey(null);
      setEditingLabel(null);
      setIsEditingName(false);
      setLabelSearchQuery("");
      setNewLabelName("");
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [cancelInfoPopoverClose, isInfoPopoverOpen]);

  const handleClick = () => {
    router.push(`/workspace?id=${workspace.id}`);
  };

  const handlePinClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (workspace.isPinned) {
      onUnpin?.(workspace.id);
    } else {
      onPin?.(workspace.id);
    }
  };

  const performArchive = () => {
    onArchive?.(workspace.id);
    if (isActive) {
      router.replace('/');
    }
  };

  const checkGitStatusAndProceed = async (operation: 'archive' | 'delete') => {
    const workspacePath = workspace.localPath;
    if (!workspacePath) {
      if (operation === 'archive') {
        performArchive();
      } else {
        setShowDeleteDialog(true);
      }
      return;
    }

    setIsCheckingGit(true);
    try {
      const status = await gitApi.getStatus(workspacePath);

      if (status.has_uncommitted_changes || status.has_unpushed_commits) {
        const issues: string[] = [];
        if (status.has_uncommitted_changes) {
          issues.push(`${status.uncommitted_count} uncommitted change(s)`);
        }
        if (status.has_unpushed_commits) {
          issues.push(`${status.unpushed_count} unpushed commit(s)`);
        }
        setGitWarningMessage(issues.join(' and '));
        setPendingOperation(operation);
        setShowGitWarningDialog(true);
      } else {
        if (operation === 'archive') {
          performArchive();
        } else {
          setShowDeleteDialog(true);
        }
      }
    } catch (error) {
      console.error('Failed to check git status:', error);
      if (operation === 'archive') {
        performArchive();
      } else {
        setShowDeleteDialog(true);
      }
    } finally {
      setIsCheckingGit(false);
    }
  };

  const handleArchiveClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await checkGitStatusAndProceed('archive');
  };

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await checkGitStatusAndProceed('delete');
  };

  const handleForceOperation = () => {
    setShowGitWarningDialog(false);
    if (pendingOperation === 'archive') {
      performArchive();
    } else if (pendingOperation === 'delete') {
      setShowDeleteDialog(true);
    }
    setPendingOperation(null);
  };

  const confirmDelete = () => {
    if (isActive) {
      router.replace('/');
    }
    onDelete?.(workspace.id);
    setShowDeleteDialog(false);
  };

  const shortName = getWorkspaceShortName(workspace.name);
  const rawDisplayName = workspace.displayName?.trim() || "";
  const displayName = rawDisplayName || shortName;
  const timeAgo = formatRelativeTime(workspace.lastVisitedAt ?? workspace.createdAt);
  const priorityMeta = getWorkspacePriorityMeta(workspace.priority);
  const PriorityIcon = priorityMeta.icon;
  const selectedLabelIds = React.useMemo(
    () => new Set(workspace.labels.map(label => label.id)),
    [workspace.labels],
  );
  const filteredAvailableLabels = React.useMemo(() => {
    const query = labelSearchQuery.trim().toLowerCase();
    if (!query) return availableLabels;
    return availableLabels.filter(label => label.name.toLowerCase().includes(query));
  }, [availableLabels, labelSearchQuery]);

  React.useEffect(() => {
    setEditableName(rawDisplayName);
  }, [rawDisplayName]);



  const workspaceAgentState = useAgentHooksStore((s) =>
    s.getAgentStateForContextId(workspace.id)
  );

  const handleSaveName = React.useCallback(async () => {
    const nextName = editableName.trim();
    if (!nextName || nextName === rawDisplayName || !onUpdateName) {
      setEditableName(rawDisplayName);
      setIsEditingName(false);
      return;
    }

    try {
      setIsSavingName(true);
      await onUpdateName(workspace.id, nextName);
      setIsEditingName(false);
    } finally {
      setIsSavingName(false);
    }
  }, [editableName, onUpdateName, rawDisplayName, workspace.id]);

  const handleToggleLabel = React.useCallback((label: WorkspaceLabel) => {
    if (!onUpdateLabels) return;
    const nextLabels = selectedLabelIds.has(label.id)
      ? workspace.labels.filter(existing => existing.id !== label.id)
      : [...workspace.labels, label];
    void onUpdateLabels(workspace.id, nextLabels);
  }, [onUpdateLabels, selectedLabelIds, workspace.id, workspace.labels]);

  const handleCreateLabel = React.useCallback(async () => {
    const name = newLabelName.trim();
    if (!name || !onCreateLabel || !onUpdateLabels) return;
    const color = `rgba(${newLabelColor.r}, ${newLabelColor.g}, ${newLabelColor.b}, ${newLabelColor.a})`;
    const label = editingLabel && onUpdateLabel
      ? await onUpdateLabel(editingLabel.id, { name, color })
      : await onCreateLabel({ name, color });
    const nextLabels = selectedLabelIds.has(label.id) ? workspace.labels : [...workspace.labels, label];
    await onUpdateLabels(workspace.id, nextLabels);
    setNewLabelName("");
    setLabelEditorKey(null);
    setEditingLabel(null);
  }, [editingLabel, newLabelColor, newLabelName, onCreateLabel, onUpdateLabel, onUpdateLabels, selectedLabelIds, workspace.id, workspace.labels]);

  const openLabelEditor = React.useCallback((label: WorkspaceLabel | null) => {
    setEditingLabel(label);
    setNewLabelName(label?.name ?? "");
    setNewLabelColor(label?.color ? parseColorToRgb(label.color) : { r: 59, g: 130, b: 246, a: 1 });
    setLabelEditorKey(label?.id ?? "new");
  }, []);

  return (
    <>
      <Popover open={isInfoPopoverOpen}>
        <PopoverTrigger asChild>
          <div
            ref={infoPopoverTriggerRef}
            {...attributes}
            {...listeners}
            onClick={handleClick}
            onMouseEnter={openInfoPopover}
            onMouseLeave={scheduleInfoPopoverClose}
            className={cn(
              "relative flex items-center px-3 py-1.5 rounded-md cursor-pointer transition-all border border-transparent hover:bg-sidebar-accent/50 group/ws",
              isActive
                ? 'bg-sidebar-accent/50 text-sidebar-foreground shadow-sm'
                : 'text-muted-foreground hover:text-sidebar-foreground',
              isPlaceholder && "opacity-20",
              isDragging && "bg-sidebar-accent shadow-xl scale-[1.02] border-sidebar-border text-sidebar-foreground"
            )}
          >
            <div className="relative flex min-w-0 w-full items-center">
              <div className="absolute -left-1 flex size-5 items-center justify-center rounded-sm">
                <GitBranch
                  className={cn(
                    "size-3.5",
                    isActive || isDragging ? 'text-sidebar-foreground' : 'text-muted-foreground',
                    workspace.isPinned ? "hidden" : "block group-hover/ws:hidden"
                  )}
                />
                <button
                  onClick={handlePinClick}
                  className={cn(
                    "absolute inset-0 flex items-center justify-center rounded-sm hover:bg-sidebar-border/50 hover:cursor-pointer z-10",
                    workspace.isPinned
                      ? "text-amber-500"
                      : "hidden group-hover/ws:flex text-muted-foreground hover:text-foreground"
                  )}
                  title={workspace.isPinned ? "Unpin" : "Pin"}
                >
                  <Pin className={cn("size-3.5", workspace.isPinned && "fill-amber-500")} />
                </button>
              </div>
              <div className="flex items-center min-w-0 gap-1.5 pl-5">
                <span className="text-[13px] font-medium truncate">
                  {shortName}
                  {showProjectName && projectName && (
                    <span className="ml-1 font-normal text-muted-foreground/50">/ {projectName}</span>
                  )}
                </span>
                {workspaceAgentState !== AGENT_STATE.IDLE && (
                  <AgentHookStatusIndicator
                    state={workspaceAgentState}
                    variant="compact"
                    className="shrink-0"
                  />
                )}
              </div>
              <div className="pointer-events-none absolute inset-y-0 -right-1 z-10 flex items-center gap-1 rounded-r-md pl-5 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 [mask-image:linear-gradient(to_right,transparent,black_30%)] group-hover/ws:pointer-events-auto group-hover/ws:opacity-100">
                <span className="text-[11px] text-muted-foreground">{timeAgo}</span>
                <button
                  onClick={handleArchiveClick}
                  className="size-4 flex items-center justify-center rounded text-muted-foreground transition-colors hover:cursor-pointer hover:text-foreground"
                  title="Archive"
                  disabled={isCheckingGit}
                >
                  <Archive className="size-3" />
                </button>
              </div>
            </div>
          </div>
        </PopoverTrigger>
        {!isDragging && (
          <PopoverContent
            data-workspace-popover-surface="true"
            side="right"
            align="start"
            sideOffset={10}
            className="w-72 space-y-3 p-3"
            onMouseEnter={openInfoPopover}
            onMouseLeave={scheduleInfoPopoverClose}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <DropdownMenu modal={false} onOpenChange={setIsPriorityMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={!onUpdatePriority}
                      className={cn(
                        "inline-flex h-6 items-center gap-1.5 rounded-md border border-border/60 bg-muted/35 px-2 text-xs text-foreground",
                        onUpdatePriority && "cursor-pointer transition-colors hover:bg-muted",
                      )}
                    >
                      <PriorityIcon className={cn("shrink-0", priorityMeta.className)} />
                      <span className="font-medium">{priorityMeta.label}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent data-workspace-popover-surface="true" side="right" align="start" className="w-40">
                    <DropdownMenuRadioGroup
                      value={workspace.priority}
                      onValueChange={(value) => onUpdatePriority?.(workspace.id, value as WorkspacePriority)}
                    >
                      {WORKSPACE_PRIORITY_OPTIONS.map((option) => {
                        const OptionIcon = option.icon;
                        return (
                          <DropdownMenuRadioItem
                            key={option.value}
                            value={option.value}
                            className="cursor-pointer pl-2 data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground [&>span:first-child]:hidden"
                          >
                            <OptionIcon className={cn("shrink-0", option.className)} />
                            <span className="font-medium">{option.label}</span>
                          </DropdownMenuRadioItem>
                        );
                      })}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                {(() => {
                  const statusMeta = getWorkspaceWorkflowStatusMeta(workspace.workflowStatus);
                  const StatusIcon = statusMeta.icon;
                  const statusChip = (
                    <button
                      type="button"
                      disabled={!onUpdateWorkflowStatus}
                      className={cn(
                        "inline-flex h-6 items-center gap-1.5 rounded-md border border-border/60 bg-muted/35 px-2 text-xs text-foreground",
                        onUpdateWorkflowStatus && "cursor-pointer transition-colors hover:bg-muted",
                      )}
                    >
                      <StatusIcon className={cn("size-3.5 shrink-0", statusMeta.className)} />
                      <span>{statusMeta.label}</span>
                    </button>
                  );
                  if (!onUpdateWorkflowStatus) return statusChip;
                  return (
                    <DropdownMenu modal={false} onOpenChange={setIsStatusMenuOpen}>
                      <DropdownMenuTrigger asChild>{statusChip}</DropdownMenuTrigger>
                      <DropdownMenuContent data-workspace-popover-surface="true" side="right" align="start" className="w-40">
                        <DropdownMenuRadioGroup
                          value={workspace.workflowStatus}
                          onValueChange={(value) => onUpdateWorkflowStatus(workspace.id, value as WorkspaceWorkflowStatus)}
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
                  );
                })()}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {onUpdateLabels && (
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
                    <PopoverContent data-workspace-popover-surface="true" side="right" align="start" className="w-64 space-y-3 p-3">
                      <Popover
                        open={labelEditorKey === "new"}
                        onOpenChange={(open) => {
                          if (open) {
                            openLabelEditor(null);
                          } else if (labelEditorKey === "new") {
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
                        <PopoverContent
                          data-workspace-popover-surface="true"
                          side="right"
                          align="start"
                          sideOffset={8}
                          alignOffset={28}
                          avoidCollisions
                          className="w-72 space-y-2 p-3"
                        >
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
                                background: isDark ? '#1c1c1f' : '#fff',
                                boxSizing: 'border-box',
                                borderRadius: '8px',
                                boxShadow: 'none',
                                border: isDark ? '1px solid #27272a' : '1px solid #e4e4e7',
                                padding: '10px',
                                width: '100%',
                              },
                              saturation: { borderRadius: '8px' },
                              activeColor: { borderRadius: '4px' },
                              hue: { height: '10px', borderRadius: '4px' },
                              alpha: { height: '10px', borderRadius: '4px' },
                            }
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
                        ) : filteredAvailableLabels.map(label => (
                          <div key={label.id} className="group/label-item relative">
                            <button
                              type="button"
                              onClick={() => handleToggleLabel(label)}
                              className={cn(
                                "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors hover:bg-muted",
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
                            </button>
                            {onUpdateLabel && (
                              <Popover
                                open={labelEditorKey === label.id}
                                onOpenChange={(open) => {
                                  if (open) {
                                    openLabelEditor(label);
                                  } else if (labelEditorKey === label.id) {
                                    setLabelEditorKey(null);
                                    setEditingLabel(null);
                                  }
                                }}
                              >
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openLabelEditor(label);
                                    }}
                                    className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-muted hover:text-foreground group-hover/label-item:opacity-100"
                                  >
                                    <Pencil className="size-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent
                                  data-workspace-popover-surface="true"
                                  side="right"
                                  align="start"
                                  sideOffset={8}
                                  alignOffset={28}
                                  avoidCollisions
                                  className="w-72 space-y-2 p-3"
                                >
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={newLabelName}
                                      onChange={(event) => setNewLabelName(event.target.value)}
                                      placeholder="Label name"
                                      className="h-7 flex-1 text-xs"
                                      autoFocus
                                    />
                                    <Button
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      disabled={!newLabelName.trim()}
                                      onClick={() => void handleCreateLabel()}
                                    >
                                      Save
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
                                          background: isDark ? '#1c1c1f' : '#fff',
                                          boxSizing: 'border-box',
                                          borderRadius: '8px',
                                          boxShadow: 'none',
                                          border: isDark ? '1px solid #27272a' : '1px solid #e4e4e7',
                                          padding: '10px',
                                          width: '100%',
                                        },
                                        saturation: { borderRadius: '8px' },
                                        activeColor: { borderRadius: '4px' },
                                        hue: { height: '10px', borderRadius: '4px' },
                                        alpha: { height: '10px', borderRadius: '4px' },
                                      }
                                    }}
                                  />
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                {workspace.labels.map(label => (
                  <span
                    key={label.id}
                    className="inline-flex h-6 items-center gap-1.5 rounded-full border border-dashed border-border bg-muted/60 px-2 text-xs text-foreground"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span>{label.name}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="shrink-0 whitespace-nowrap">Display name</span>
                <div className="group/display relative min-w-0 flex-1 text-right">
                  <TooltipProvider delayDuration={250}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block max-w-full truncate whitespace-nowrap align-top text-foreground">
                          {rawDisplayName || "Not set"}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" align="center" sideOffset={8} avoidCollisions={false} className="max-w-sm break-all">
                        {rawDisplayName || "Not set"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {onUpdateName ? (
                    <Popover
                      open={isEditingName}
                      onOpenChange={(open) => {
                        if (open) {
                          setEditableName(rawDisplayName);
                        }
                        setIsEditingName(open);
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="absolute right-0 top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded border border-border/60 bg-background/85 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-all hover:bg-muted hover:text-foreground group-hover/display:opacity-100"
                          title="Edit display name"
                        >
                          <Pencil className="size-2.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent data-workspace-popover-surface="true" side="right" align="start" className="w-56 p-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={editableName}
                            onChange={(e) => setEditableName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                void handleSaveName();
                              }
                              if (e.key === "Escape") {
                                setIsEditingName(false);
                              }
                            }}
                            className="h-7 flex-1 text-xs"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={isSavingName || !editableName.trim()}
                            onClick={() => void handleSaveName()}
                          >
                            Save
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="shrink-0 whitespace-nowrap">Workspace name</span>
                <WorkspaceMetadataValue value={workspace.name} />
              </div>
              <div className="flex items-center gap-3">
                <span className="shrink-0 whitespace-nowrap">Current branch</span>
                <WorkspaceMetadataValue value={workspace.branch} valueClassName="font-semibold text-foreground" />
              </div>
              <div className="flex items-center gap-3">
                <span className="shrink-0 whitespace-nowrap">Base branch</span>
                <WorkspaceMetadataValue value={workspace.baseBranch} />
              </div>
              <div className="flex items-center gap-3">
                <span className="shrink-0 whitespace-nowrap">Last active</span>
                <span className="min-w-0 flex-1 truncate whitespace-nowrap text-right text-foreground">{timeAgo}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="shrink-0 whitespace-nowrap">Path</span>
                <WorkspaceMetadataValue
                  value={workspace.localPath}
                  valueClassName="rounded-md bg-muted/60 px-2 py-1 text-left [direction:rtl]"
                  tooltipClassName="max-w-md text-xs"
                />
              </div>
            </div>
            <div className="flex items-center gap-1 border-t border-border/60 pt-2">
              <button
                type="button"
                onClick={handleArchiveClick}
                disabled={isCheckingGit}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Archive className="size-3" />
                <span>Archive</span>
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  disabled={isCheckingGit}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="size-3" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          </PopoverContent>
        )}
      </Popover>

      <Dialog open={showGitWarningDialog} onOpenChange={setShowGitWarningDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              Uncommitted Changes Detected
            </DialogTitle>
            <DialogDescription>
              This workspace has {gitWarningMessage}. These changes will be lost if you {pendingOperation} this workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGitWarningDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleForceOperation}>
              {pendingOperation === 'archive' ? 'Archive Anyway' : 'Continue to Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Workspace</DialogTitle>
            <DialogDescription>
              This will permanently delete the workspace `{workspace.displayName || workspace.name}` and its local directory. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
