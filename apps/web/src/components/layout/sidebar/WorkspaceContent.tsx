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
  cn,
} from "@workspace/ui";
import type { Workspace, WorkspaceLabel, WorkspacePriority } from "@/types/types";
import { formatRelativeTime } from "@atmos/shared";
import { getWorkspaceShortName } from "@/utils/workspace";
import { gitApi } from "@/api/ws-api";
import { AGENT_STATE, useAgentHooksStore } from "@/hooks/use-agent-hooks-store";
import { AgentHookStatusIndicator } from "@/components/agent/AgentHookStatusIndicator";
import {
  WorkspaceLabelBadges,
  WorkspaceLabelPicker,
  WorkspacePrioritySelect,
  WorkspaceStatusSelect,
} from "./workspace-metadata-controls";
import type { WorkspaceWorkflowStatus } from "@/types/types";

export interface WorkspaceContentProps {
  workspace: Workspace;
  projectId: string;
  projectPath?: string;
  projectName?: string;
  showProjectName?: boolean;
  rightContext?: React.ReactNode;
  isDragging?: boolean;
  isPlaceholder?: boolean;
  suppressInfoPopover?: boolean;
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
  rightContext,
  isDragging,
  isPlaceholder,
  suppressInfoPopover,
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
  const infoPopoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const infoPopoverTriggerRef = React.useRef<HTMLDivElement | null>(null);
  const ignoreNextClickRef = React.useRef(false);
  

  const cancelInfoPopoverClose = React.useCallback(() => {
    if (infoPopoverTimerRef.current) {
      clearTimeout(infoPopoverTimerRef.current);
      infoPopoverTimerRef.current = null;
    }
  }, []);

  const openInfoPopover = React.useCallback(() => {
    if (suppressInfoPopover) {
      cancelInfoPopoverClose();
      setIsInfoPopoverOpen(false);
      return;
    }
    cancelInfoPopoverClose();
    infoPopoverTimerRef.current = setTimeout(() => {
      if (suppressInfoPopover) {
        infoPopoverTimerRef.current = null;
        setIsInfoPopoverOpen(false);
        return;
      }
      if (!infoPopoverTriggerRef.current?.matches(":hover")) {
        infoPopoverTimerRef.current = null;
        return;
      }
      setIsInfoPopoverOpen(true);
      infoPopoverTimerRef.current = null;
    }, 1000);
  }, [cancelInfoPopoverClose, suppressInfoPopover]);

  const openInfoPopoverNow = React.useCallback(() => {
    if (suppressInfoPopover) {
      cancelInfoPopoverClose();
      setIsInfoPopoverOpen(false);
      return;
    }
    cancelInfoPopoverClose();
    setIsInfoPopoverOpen(true);
  }, [cancelInfoPopoverClose, suppressInfoPopover]);

  React.useEffect(() => {
    if (suppressInfoPopover) {
      cancelInfoPopoverClose();
      setIsInfoPopoverOpen(false);
      setIsStatusMenuOpen(false);
      setIsPriorityMenuOpen(false);
      setIsLabelPopoverOpen(false);
    }
  }, [cancelInfoPopoverClose, suppressInfoPopover]);

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
      setIsEditingName(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [cancelInfoPopoverClose, isInfoPopoverOpen]);

  const handleClick = () => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }
    router.push(`/workspace?id=${workspace.id}`);
  };

  const handleTouchStart = React.useCallback(() => {
    if (!isInfoPopoverOpen) {
      ignoreNextClickRef.current = true;
      openInfoPopoverNow();
      window.setTimeout(() => {
        ignoreNextClickRef.current = false;
      }, 500);
    }
  }, [isInfoPopoverOpen, openInfoPopoverNow]);

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

  return (
    <>
      <Popover open={isInfoPopoverOpen}>
        <PopoverTrigger asChild>
          <div
            ref={infoPopoverTriggerRef}
            {...attributes}
            {...listeners}
            onClick={handleClick}
            onFocusCapture={openInfoPopoverNow}
            onMouseEnter={openInfoPopover}
            onMouseLeave={scheduleInfoPopoverClose}
            onTouchStart={handleTouchStart}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleClick();
              }
            }}
            role="button"
            tabIndex={0}
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
                {workspace.isPinned ? (
                  <button
                    onClick={handlePinClick}
                    className={cn(
                      "absolute inset-0 flex items-center justify-center rounded-sm hover:bg-sidebar-border/50 hover:cursor-pointer z-10",
                      isActive || isDragging ? 'text-sidebar-foreground' : 'text-muted-foreground',
                      "hover:text-foreground"
                    )}
                    title="Unpin"
                  >
                    <Pin className="size-3.5" />
                  </button>
                ) : (
                  <>
                    <GitBranch
                      className={cn(
                        "size-3.5 block group-hover/ws:hidden",
                        isActive || isDragging ? 'text-sidebar-foreground' : 'text-muted-foreground',
                      )}
                    />
                    <button
                      onClick={handlePinClick}
                      className={cn(
                        "absolute inset-0 flex items-center justify-center rounded-sm hover:bg-sidebar-border/50 hover:cursor-pointer z-10",
                        "hidden group-hover/ws:flex text-muted-foreground hover:text-foreground"
                      )}
                      title="Pin"
                    >
                      <Pin className="size-3.5 rotate-45" />
                    </button>
                  </>
                )}
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
              {rightContext ? (
                <div
                  className={cn(
                    "pointer-events-none absolute inset-y-0 -right-2 z-[9] flex items-center rounded-r-md px-2 pl-4 text-[11px] text-muted-foreground transition-opacity duration-200 group-hover/ws:opacity-0",
                  )}
                >
                  <span
                    className="absolute inset-y-0 -left-1 -right-1 rounded-r-md backdrop-blur-[2px] [mask-image:linear-gradient(to_right,transparent,black_18%,black_78%,transparent)]"
                  />
                  <span className="relative z-10">{rightContext}</span>
                </div>
              ) : null}
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
            onMouseEnter={cancelInfoPopoverClose}
            onMouseLeave={scheduleInfoPopoverClose}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <WorkspacePrioritySelect
                  value={workspace.priority}
                  onChange={onUpdatePriority ? (value) => onUpdatePriority(workspace.id, value) : undefined}
                  onOpenChange={setIsPriorityMenuOpen}
                  surface
                />
                <WorkspaceStatusSelect
                  value={workspace.workflowStatus}
                  onChange={onUpdateWorkflowStatus ? (value) => onUpdateWorkflowStatus(workspace.id, value) : undefined}
                  onOpenChange={setIsStatusMenuOpen}
                  surface
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {onUpdateLabels ? (
                  <WorkspaceLabelPicker
                    labels={workspace.labels}
                    availableLabels={availableLabels}
                    onChange={(nextLabels) => onUpdateLabels(workspace.id, nextLabels)}
                    onCreateLabel={onCreateLabel}
                    onUpdateLabel={onUpdateLabel}
                    onOpenChange={setIsLabelPopoverOpen}
                    surface
                  />
                ) : null}
                <WorkspaceLabelBadges labels={workspace.labels} className="contents" />
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
