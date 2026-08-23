"use client";

import React, { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@workspace/ui";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import {
  Pin,
  Archive,
  Trash2,
  AlertTriangle,
  Pencil,
  Timer,
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
import type { Group, Workspace, WorkspaceLabel, WorkspacePriority } from "@/shared/types/domain";
import { formatRelativeTime } from "@atmos/shared";
import { getWorkspaceShortName } from "@/features/workspace/lib/workspace";
import { gitApi } from "@/api/ws-api";
import { WorkspaceAgentStatusMark } from "@/features/agent/components/WorkspaceAgentStatusMark";
import { WorkspacePrLifecycleIcon } from "@/features/github/components/WorkspacePrStatusIcon";
import { WorkspacePrSummary } from "@/features/github/components/WorkspacePrSummary";
import { WorkspaceLinearSummary } from "@/features/task/components/WorkspaceLinearSummary";
import { useWorkspacePrStatus } from "@/features/github/hooks/use-workspace-pr-status";
import { useOpenGithubCenterTab } from "@/features/github/hooks/use-open-github-center-tab";
import {
  buildActionRunFromChecks,
  pickGroupActionTarget,
} from "@/features/github/lib/pr-detail-parts";
import {
  WorkspaceGroupSelect,
  WorkspaceLabelBadges,
  WorkspaceLabelPicker,
  WorkspacePrioritySelect,
  WorkspaceStatusSelect,
} from "./workspace-metadata-controls";
import type { WorkspaceWorkflowStatus } from "@/shared/types/domain";
import { useWorkspaceSettingsStore } from "@/features/settings/store/workspace-settings-store";
import { findGroupIdForMember } from "@/app-shell/sidebar/user-groups";
import { GitBranch } from "lucide-react";

export interface WorkspaceContentProps {
  workspace: Workspace;
  projectId: string;
  projectPath?: string;
  projectName?: string;
  showProjectName?: boolean;
  rightContext?: React.ReactNode;
  /** Selected state from parent — avoid per-row URL subscriptions. */
  isActive?: boolean;
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
  /** APP-044: groups for workspace membership switcher in the info popover. */
  groups?: Group[];
  onSetWorkspaceGroup?: (workspaceId: string, groupId: string | null) => void;
  onCreateGroup?: (name: string) => Promise<{ id: string } | void> | { id: string } | void;
}

function workspaceContentPropsAreEqual(
  prev: WorkspaceContentProps,
  next: WorkspaceContentProps,
): boolean {
  // Ignore handler identity: parents recreate onPin/onArchive etc. per map().
  return (
    prev.workspace === next.workspace &&
    prev.projectId === next.projectId &&
    prev.projectPath === next.projectPath &&
    prev.projectName === next.projectName &&
    prev.showProjectName === next.showProjectName &&
    prev.rightContext === next.rightContext &&
    prev.isActive === next.isActive &&
    prev.isDragging === next.isDragging &&
    prev.isPlaceholder === next.isPlaceholder &&
    prev.suppressInfoPopover === next.suppressInfoPopover &&
    prev.attributes === next.attributes &&
    prev.listeners === next.listeners &&
    prev.availableLabels === next.availableLabels &&
    prev.groups === next.groups
  );
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
  projectPath,
  projectName,
  showProjectName,
  rightContext,
  isActive = false,
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
  groups = [],
  onSetWorkspaceGroup,
  onCreateGroup,
}) {
  const t = useTranslations("AppShell.chrome");
  const locale = useLocale();
  const router = useAppRouter();
  const { openPullRequestTab, openActionRunTab } = useOpenGithubCenterTab();
  const isAutomation = workspace.createSource === "automation";
  const confirmBeforeDelete = useWorkspaceSettingsStore((s) => s.confirmBeforeDelete);
  const confirmBeforeArchive = useWorkspaceSettingsStore((s) => s.confirmBeforeArchive);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showGitWarningDialog, setShowGitWarningDialog] = useState(false);
  const [gitWarningMessage, setGitWarningMessage] = useState('');
  const [pendingOperation, setPendingOperation] = useState<'archive' | 'delete' | null>(null);
  const [isCheckingGit, setIsCheckingGit] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editableName, setEditableName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [isInfoPopoverOpen, setIsInfoPopoverOpen] = useState(false);
  const [isRowHovered, setIsRowHovered] = useState(false);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isPriorityMenuOpen, setIsPriorityMenuOpen] = useState(false);
  const [isGroupMenuOpen, setIsGroupMenuOpen] = useState(false);
  const [isLabelPopoverOpen, setIsLabelPopoverOpen] = useState(false);
  const workspaceGroupId = findGroupIdForMember(groups, "workspace", workspace.id);
  const infoPopoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const infoPopoverTriggerRef = React.useRef<HTMLDivElement | null>(null);
  const ignoreNextClickRef = React.useRef(false);
  const prStatusInterested = isRowHovered || isInfoPopoverOpen;
  // Prefer worktree path so branch-linked PRs resolve like Header (git status + PR list).
  const prRepoPath = workspace.localPath?.trim() || projectPath?.trim() || null;
  const { presentation: managedPr } = useWorkspacePrStatus({
    githubPr: workspace.githubPr,
    branch: workspace.branch,
    repoPath: prRepoPath,
    interested: prStatusInterested,
  });
  const gitWarningListFormatter = React.useMemo(
    () => new Intl.ListFormat(locale, { style: "long", type: "conjunction" }),
    [locale],
  );
  

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
      setIsGroupMenuOpen(false);
      setIsLabelPopoverOpen(false);
    }
  }, [cancelInfoPopoverClose, suppressInfoPopover]);

  const scheduleInfoPopoverClose = React.useCallback(() => {
    cancelInfoPopoverClose();
    infoPopoverTimerRef.current = setTimeout(() => {
      if (
        isStatusMenuOpen ||
        isPriorityMenuOpen ||
        isGroupMenuOpen ||
        isLabelPopoverOpen ||
        isEditingName
      ) {
        infoPopoverTimerRef.current = null;
        return;
      }
      setIsInfoPopoverOpen(false);
      infoPopoverTimerRef.current = null;
    }, 150);
  }, [
    cancelInfoPopoverClose,
    isEditingName,
    isGroupMenuOpen,
    isLabelPopoverOpen,
    isPriorityMenuOpen,
    isStatusMenuOpen,
  ]);

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
      setIsGroupMenuOpen(false);
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
    // Click is a navigation intent — never open/expand info chrome mid-switch.
    cancelInfoPopoverClose();
    setIsInfoPopoverOpen(false);
    setIsStatusMenuOpen(false);
    setIsPriorityMenuOpen(false);
    setIsGroupMenuOpen(false);
    setIsLabelPopoverOpen(false);
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

  const confirmArchive = () => {
    setShowArchiveDialog(false);
    performArchive();
  };

  const requestArchive = () => {
    if (confirmBeforeArchive) {
      setShowArchiveDialog(true);
    } else {
      performArchive();
    }
  };

  const checkGitStatusAndProceed = async (operation: 'archive' | 'delete') => {
    const workspacePath = workspace.localPath;
    if (!workspacePath) {
      if (operation === 'archive') {
        requestArchive();
      } else {
        requestDelete();
      }
      return;
    }

    setIsCheckingGit(true);
    try {
      const status = await gitApi.getStatus(workspacePath);

      if (status.has_uncommitted_changes || status.has_unpushed_commits) {
        const issues: string[] = [];
        if (status.has_uncommitted_changes) {
          issues.push(
            t("workspaceContent.gitWarning.issue.uncommittedChanges", {
              count: status.uncommitted_count,
            }),
          );
        }
        if (status.has_unpushed_commits) {
          issues.push(
            t("workspaceContent.gitWarning.issue.unpushedCommits", {
              count: status.unpushed_count,
            }),
          );
        }
        setGitWarningMessage(gitWarningListFormatter.format(issues));
        setPendingOperation(operation);
        setShowGitWarningDialog(true);
      } else {
        if (operation === 'archive') {
          requestArchive();
        } else {
          requestDelete();
        }
      }
    } catch (error) {
      console.error('Failed to check git status:', error);
      if (operation === 'archive') {
        requestArchive();
      } else {
        requestDelete();
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
      requestArchive();
    } else if (pendingOperation === 'delete') {
      requestDelete();
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

  const requestDelete = () => {
    if (confirmBeforeDelete) {
      setShowDeleteDialog(true);
    } else {
      confirmDelete();
    }
  };

  const shortName = getWorkspaceShortName(workspace.name);
  const rawDisplayName = workspace.displayName?.trim() || "";
  const primaryLabel = rawDisplayName || shortName;
  const timeAgo = formatRelativeTime(workspace.lastVisitedAt ?? workspace.createdAt, locale);
  const leadingFallbackClass =
    isActive || isDragging ? "text-sidebar-foreground" : "text-muted-foreground";

  const openManagedPullRequest = React.useCallback(() => {
    if (!managedPr) return;
    openPullRequestTab({
      owner: managedPr.owner,
      repo: managedPr.repo,
      prNumber: managedPr.number,
      title: managedPr.title,
      branch: workspace.branch,
      contextId: workspace.id,
    });
    setIsInfoPopoverOpen(false);
  }, [managedPr, openPullRequestTab, workspace.branch, workspace.id]);

  const openManagedChecks = React.useCallback(() => {
    if (!managedPr) return;
    const target = pickGroupActionTarget(managedPr.checks);
    if (target.runId != null) {
      openActionRunTab({
        owner: managedPr.owner,
        repo: managedPr.repo,
        runId: target.runId,
        run: buildActionRunFromChecks(
          target.groupName,
          managedPr.checks,
          target.runId,
          managedPr.owner,
          managedPr.repo,
        ),
        contextId: workspace.id,
      });
    } else {
      // No Actions run id in rollup — fall back to the PR center tab.
      openPullRequestTab({
        owner: managedPr.owner,
        repo: managedPr.repo,
        prNumber: managedPr.number,
        title: managedPr.title,
        branch: workspace.branch,
        contextId: workspace.id,
      });
    }
    setIsInfoPopoverOpen(false);
  }, [
    managedPr,
    openActionRunTab,
    openPullRequestTab,
    workspace.branch,
    workspace.id,
  ]);

  React.useEffect(() => {
    setEditableName(rawDisplayName);
  }, [rawDisplayName]);

  const handleSaveName = React.useCallback(async () => {
    const nextName = editableName.trim();
    // An empty value is allowed: it clears the display name (i.e. "not set").
    // Only skip when nothing changed or there is no handler.
    if (nextName === rawDisplayName || !onUpdateName) {
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
            // Do NOT open the info popover on focus: a click focuses the row first,
            // which previously mounted popover chrome and competed with navigation.
            onMouseEnter={() => {
              setIsRowHovered(true);
              openInfoPopover();
            }}
            onMouseLeave={() => {
              setIsRowHovered(false);
              scheduleInfoPopoverClose();
            }}
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
            data-ws-row=""
            className={cn(
              // Instant hover fill — match settings SidebarMenuButton (no color fade).
              "relative flex items-center px-3 py-1.5 rounded-md cursor-pointer border border-transparent hover:bg-sidebar-accent group/ws",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:text-sidebar-accent-foreground",
              isPlaceholder && "opacity-20",
              isDragging && "bg-sidebar-accent shadow-xl scale-[1.02] border-sidebar-border text-sidebar-foreground"
            )}
          >
            <div className="relative flex min-w-0 w-full items-center gap-1">
              <div className="absolute -left-1 flex size-5 items-center justify-center rounded-sm">
                {workspace.isPinned ? (
                  <button
                    onClick={handlePinClick}
                    className={cn(
                      "absolute inset-0 z-10 flex items-center justify-center rounded-sm hover:cursor-pointer hover:bg-sidebar-border/50",
                      isActive || isDragging ? "text-sidebar-foreground" : "text-muted-foreground",
                      "hover:text-foreground",
                    )}
                    title={t("common.unpin")}
                  >
                    <Pin className="size-3.5" />
                  </button>
                ) : (
                  <>
                    {managedPr ? (
                      <WorkspacePrLifecycleIcon
                        state={managedPr.state}
                        checksTone={managedPr.checksTone}
                        className="block group-hover/ws:hidden"
                        fallbackClassName={leadingFallbackClass}
                      />
                    ) : (
                      <GitBranch
                        className={cn(
                          "block size-3.5 group-hover/ws:hidden",
                          leadingFallbackClass,
                        )}
                      />
                    )}
                    <button
                      onClick={handlePinClick}
                      className={cn(
                        "absolute inset-0 z-10 hidden items-center justify-center rounded-sm hover:cursor-pointer hover:bg-sidebar-border/50",
                        "group-hover/ws:flex text-muted-foreground hover:text-foreground",
                      )}
                      title={t("common.pin")}
                    >
                      <Pin className="size-3.5 rotate-45" />
                    </button>
                  </>
                )}
              </div>
              {/* Title takes remaining width and ellipsizes — no absolute overlays / frosted plates. */}
              <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-5">
                <span className="truncate text-[13px] font-medium">
                  {primaryLabel}
                  {showProjectName && projectName && (
                    <span className="ml-1 font-normal text-muted-foreground/50">/ {projectName}</span>
                  )}
                </span>
                {isAutomation && (
                  <TooltipProvider delayDuration={250}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="inline-flex shrink-0 cursor-default items-center text-muted-foreground"
                          aria-label={t("workspaceContent.automationWorkspace")}
                        >
                          <Timer className="size-3" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" align="center" sideOffset={8}>
                        {t("workspaceContent.automationWorkspace")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <WorkspaceAgentStatusMark contextId={workspace.id} />
              </div>
              {/* Trailing slot in normal flow: status/time/label, or archive on hover. */}
              <div className="flex shrink-0 items-center justify-end">
                {rightContext ? (
                  <div className="flex items-center text-[11px] text-muted-foreground group-hover/ws:hidden">
                    {rightContext}
                  </div>
                ) : null}
                <div className="hidden items-center gap-1 group-hover/ws:flex">
                  <span className="text-[11px] text-muted-foreground">{timeAgo}</span>
                  <button
                    onClick={handleArchiveClick}
                    className="flex size-4 items-center justify-center rounded text-muted-foreground hover:cursor-pointer hover:text-foreground"
                    title={t("common.archive")}
                    disabled={isCheckingGit}
                  >
                    <Archive className="size-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </PopoverTrigger>
        {/* Mount heavy popover body only while open — avoids per-row portal work on every switch. */}
        {!isDragging && isInfoPopoverOpen && (
          <PopoverContent
            data-workspace-popover-surface="true"
            side="right"
            align="start"
            sideOffset={10}
            className="w-72 space-y-3 p-3"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
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
                {onSetWorkspaceGroup || groups.length > 0 || onCreateGroup ? (
                  <WorkspaceGroupSelect
                    value={workspaceGroupId}
                    groups={groups}
                    onChange={
                      onSetWorkspaceGroup
                        ? (groupId) => onSetWorkspaceGroup(workspace.id, groupId)
                        : undefined
                    }
                    onCreateGroup={onCreateGroup}
                    onOpenChange={setIsGroupMenuOpen}
                    surface
                  />
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <WorkspaceLabelBadges labels={workspace.labels} className="contents" />
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
              </div>

              {managedPr ? (
                <WorkspacePrSummary
                  presentation={managedPr}
                  onOpenPr={openManagedPullRequest}
                  onOpenChecks={openManagedChecks}
                  className="-mx-1"
                />
              ) : null}

              {(workspace.linearLinks?.length ?? 0) > 0 ? (
                <WorkspaceLinearSummary
                  links={workspace.linearLinks!}
                  className="-mx-1"
                />
              ) : null}
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="shrink-0 whitespace-nowrap">{t("workspaceContent.displayName")}</span>
                <div className="group/display relative min-w-0 flex-1 text-right">
                  <TooltipProvider delayDuration={250}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block max-w-full truncate whitespace-nowrap align-top text-foreground">
                          {rawDisplayName || t("workspaceContent.notSet")}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" align="center" sideOffset={8} avoidCollisions={false} className="max-w-sm break-all">
                        {rawDisplayName || t("workspaceContent.notSet")}
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
                          className="absolute right-0 top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded border border-border/60 bg-background/85 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-[opacity,transform] hover:bg-muted hover:text-foreground group-hover/display:opacity-100"
                          title={t("workspaceContent.editDisplayName")}
                        >
                          <Pencil className="size-2.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        data-workspace-popover-surface="true"
                        side="right"
                        align="start"
                        className="w-56 p-2"
                        onMouseEnter={cancelInfoPopoverClose}
                        onMouseLeave={scheduleInfoPopoverClose}
                      >
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
                            disabled={isSavingName || editableName.trim() === rawDisplayName}
                            onClick={() => void handleSaveName()}
                          >
                            {t("common.save")}
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="shrink-0 whitespace-nowrap">{t("workspaceContent.workspaceName")}</span>
                <WorkspaceMetadataValue value={workspace.name} />
              </div>
              <div className="flex items-center gap-3">
                <span className="shrink-0 whitespace-nowrap">{t("workspaceContent.currentBranch")}</span>
                <WorkspaceMetadataValue value={workspace.branch} valueClassName="font-semibold text-foreground" />
              </div>
              <div className="flex items-center gap-3">
                <span className="shrink-0 whitespace-nowrap">{t("workspaceContent.baseBranch")}</span>
                <WorkspaceMetadataValue value={workspace.baseBranch} />
              </div>
              <div className="flex items-center gap-3">
                <span className="shrink-0 whitespace-nowrap">{t("workspaceContent.lastActive")}</span>
                <span className="min-w-0 flex-1 truncate whitespace-nowrap text-right text-foreground">{timeAgo}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="shrink-0 whitespace-nowrap">{t("workspaceContent.path")}</span>
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
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Archive className="size-3" />
                <span>{t("common.archive")}</span>
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  disabled={isCheckingGit}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-3" />
                  <span>{t("common.delete")}</span>
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
              {t("workspaceContent.gitWarning.title")}
            </DialogTitle>
            <DialogDescription>
              {t("workspaceContent.gitWarning.description", {
                issues: gitWarningMessage,
                operation: pendingOperation
                  ? t(`workspaceContent.operation.${pendingOperation}`)
                  : "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGitWarningDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleForceOperation}>
              {pendingOperation === 'archive'
                ? t("workspaceContent.gitWarning.archiveAnyway")
                : t("workspaceContent.gitWarning.continueToDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("workspaceContent.deleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("workspaceContent.deleteDialog.description", {
                name: workspace.displayName || workspace.name,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("workspaceContent.archiveDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("workspaceContent.archiveDialog.description", {
                name: workspace.displayName || workspace.name,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowArchiveDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="default" onClick={confirmArchive}>
              {t("common.archive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}, workspaceContentPropsAreEqual);
