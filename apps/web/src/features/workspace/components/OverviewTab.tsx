"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  cn,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  PointerSensor,
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
  Avatar,
  AvatarImage,
  AvatarFallback,
  Badge,
  Textarea,
} from "@workspace/ui";
import { formatDistanceToNow } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import type { DragEndEvent, DragStartEvent } from "@workspace/ui";
import {
  GitBranch,
  Clock,
  LoaderCircle,
  RotateCcw,
  Pencil,
  Plus,
  CheckSquare,
  LayoutDashboard,
  Info,
  Rocket,
  GitPullRequest,
  CheckCircle2,
  XCircle,
  Loader2,
  FolderOpen,
  FileCheck,
  GitMerge,
  GitPullRequestClosed,
  GitPullRequestDraft,
} from "lucide-react";
import { Github } from "@workspace/ui/components/icons/lucide-brand-icons";
import { formatLocalDateTime } from "@atmos/shared";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import {
  useWorkspaceContext,
  type TaskStatus,
} from "@/features/workspace/hooks/use-workspace-context";
import { activateCenterChromeTab } from "@/app-shell/center-stage-activate";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useProjectStore } from "@/features/project/store/use-project-store";
import { useWorkspaceLabels } from "@/features/project/hooks/use-project-bootstrap-query";
import { useGitStatusQuery } from "@/features/git/hooks/use-git-status-query";
import { useGithubPRList, useGithubActionsList } from "@/features/github/hooks/use-github";
import {
  type ActionRun,
  useProcessedActions,
  ActionsSummaryHeader,
} from "@/features/github/components/ActionsPanel";
import { useOpenGithubCenterTab } from "@/features/github/hooks/use-open-github-center-tab";
import { fsApi, type GithubIssuePayload } from "@/api/ws-api";
import { TaskListPanel, renderStatusIcon } from "@/features/workspace/components/TaskListPanel";
import { NotePanel } from "@/features/workspace/components/NotePanel";
import type {
  WorkspacePriority,
  WorkspaceWorkflowStatus,
  WorkspaceLabel,
} from "@/shared/types/domain";
import {
  WorkspaceLabelBadges,
  WorkspaceLabelPicker,
  WorkspacePrioritySelect,
  WorkspaceStatusSelect,
} from "@/app-shell/sidebar/workspace-metadata-controls";
import { shouldShowOverviewGitWidgets } from "@/features/automations/lib/automation-run-landing";

type OverviewPullRequest = {
  number: number;
} & Record<string, unknown>;

interface OverviewTabProps {
  contextId: string;
  /** Center paint id for opening files/tabs. Defaults to `contextId`. */
  editorContextId?: string;
  projectId?: string;
  projectName?: string;
  projectPath?: string;
  workspaceName?: string;
  workspacePath?: string;
  gitBranch?: string;
  createdAt?: string;
  isProjectOnly?: boolean;
  githubIssue?: GithubIssuePayload | null;
  priority?: WorkspacePriority;
  workflowStatus?: WorkspaceWorkflowStatus;
  labels?: WorkspaceLabel[];
  active?: boolean;
  showRefreshAction?: boolean;
  dragOverlayContainer?: HTMLElement | null;
  onOpenPullRequest?: (pr: OverviewPullRequest) => void;
  onOpenActionRun?: (run: ActionRun) => void;
}

function formatDate(isoString: string | undefined, locale: string): string {
  if (!isoString) return "-";
  try {
    return formatLocalDateTime(isoString, undefined, locale);
  } catch {
    return "-";
  }
}

// ---------------------------------------------------------------------------
// DnD helper components
// ---------------------------------------------------------------------------

function DroppableSection({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("w-full rounded-sm", isOver && "bg-primary/10")}>
      {children}
    </div>
  );
}

function DraggableTask({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("cursor-grab active:cursor-grabbing", isDragging && "opacity-30")}
    >
      {children}
    </div>
  );
}

interface MetadataControlGroupProps {
  projectId: string;
  workspaceId: string;
  priority?: WorkspacePriority;
  workflowStatus?: WorkspaceWorkflowStatus;
  labels?: WorkspaceLabel[];
  workspaceLabels: WorkspaceLabel[];
  statusLabel: string;
  priorityLabel: string;
  labelsLabel: string;
  onUpdatePriority: (
    projectId: string,
    workspaceId: string,
    priority: WorkspacePriority,
  ) => Promise<void>;
  onUpdateWorkflowStatus: (
    projectId: string,
    workspaceId: string,
    workflowStatus: WorkspaceWorkflowStatus,
  ) => Promise<void>;
  onUpdateLabels: (
    projectId: string,
    workspaceId: string,
    labels: WorkspaceLabel[],
  ) => Promise<void>;
  onCreateLabel: (data: { name: string; color: string }) => Promise<WorkspaceLabel>;
  onUpdateLabel: (
    labelId: string,
    data: { name: string; color: string },
  ) => Promise<WorkspaceLabel>;
}

function MetadataControlGroup({
  projectId,
  workspaceId,
  priority = "no_priority",
  workflowStatus = "in_progress",
  labels = [],
  workspaceLabels,
  statusLabel,
  priorityLabel,
  labelsLabel,
  onUpdatePriority,
  onUpdateWorkflowStatus,
  onUpdateLabels,
  onCreateLabel,
  onUpdateLabel,
}: MetadataControlGroupProps) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/30 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{statusLabel}</span>
        <WorkspaceStatusSelect
          value={workflowStatus}
          onChange={(value) => void onUpdateWorkflowStatus(projectId, workspaceId, value)}
          contentSide="bottom"
          contentAlign="end"
          triggerClassName="h-auto px-2 py-1 bg-background"
          labelClassName="text-xs"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{priorityLabel}</span>
        <WorkspacePrioritySelect
          value={priority}
          onChange={(value) => void onUpdatePriority(projectId, workspaceId, value)}
          contentSide="bottom"
          contentAlign="end"
          triggerClassName="h-auto px-2 py-1 bg-background"
          labelClassName="text-xs"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{labelsLabel}</span>
        <WorkspaceLabelPicker
          labels={labels}
          availableLabels={workspaceLabels}
          onChange={(nextLabels) => onUpdateLabels(projectId, workspaceId, nextLabels)}
          onCreateLabel={onCreateLabel}
          onUpdateLabel={onUpdateLabel}
          triggerVariant="summary"
          contentSide="bottom"
          contentAlign="end"
          contentClassName="w-64"
        />
      </div>

      <WorkspaceLabelBadges labels={labels} className="pt-1" />
    </div>
  );
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  contextId,
  editorContextId,
  projectId,
  projectName,
  projectPath,
  workspaceName,
  workspacePath,
  gitBranch: propGitBranch,
  createdAt,
  isProjectOnly = false,
  githubIssue = null,
  priority,
  workflowStatus,
  labels,
  active = true,
  showRefreshAction = true,
  dragOverlayContainer,
  onOpenPullRequest,
  onOpenActionRun,
}) => {
  const locale = useLocale();
  const t = useTranslations("Workspace.components.overviewTab");
  const hideGitChrome = !shouldShowOverviewGitWidgets(contextId);
  const relativeTimeLocale = locale.startsWith("zh") ? zhCN : enUS;
  const openFile = useEditorStore((s) => s.openFile);
  const fileOpenContextId = editorContextId || contextId;
  const updateWorkspacePriority = useProjectStore((s) => s.updateWorkspacePriority);
  const updateWorkspaceWorkflowStatus = useProjectStore((s) => s.updateWorkspaceWorkflowStatus);
  const updateWorkspaceLabels = useProjectStore((s) => s.updateWorkspaceLabels);
  const workspaceLabels = useWorkspaceLabels();
  const createWorkspaceLabel = useProjectStore((s) => s.createWorkspaceLabel);
  const updateWorkspaceLabel = useProjectStore((s) => s.updateWorkspaceLabel);
  const {
    requirement,
    requirementLoading,
    note,
    noteLoading,
    tasks,
    tasksLoading,
    loadRequirement,
    saveRequirement,
    loadTasks,
    addTask,
    updateTaskStatus,
    updateTaskContent,
    deleteTask,
    loadNote,
    saveNote,
  } = useWorkspaceContext(contextId);

  const statusQuery = useGitStatusQuery(hideGitChrome ? null : (projectPath ?? null));
  const githubOwner = statusQuery.data?.github_owner ?? null;
  const githubRepo = statusQuery.data?.github_repo ?? null;
  const currentBranch = statusQuery.data?.current_branch ?? null;

  const effectiveGitBranch = propGitBranch || currentBranch || "main";
  const {
    data: prs,
    loading: prsLoading,
    refresh: refreshPRs,
  } = useGithubPRList({
    owner: githubOwner || "",
    repo: githubRepo || "",
    branch: effectiveGitBranch,
    enabled: active && !hideGitChrome,
  });
  const {
    data: actionRuns,
    loading: actionsLoading,
    refresh: refreshActions,
  } = useGithubActionsList({
    owner: githubOwner || "",
    repo: githubRepo || "",
    branch: effectiveGitBranch,
    enabled: active && !hideGitChrome,
  });
  const { latestRuns, stats } = useProcessedActions(actionRuns);

  const { openActionRunTab, openPullRequestTab } = useOpenGithubCenterTab();
  const [requirementExpanded, setRequirementExpanded] = useState(false);
  const [isEditingRequirement, setIsEditingRequirement] = useState(false);
  const [draftRequirement, setDraftRequirement] = useState(requirement ?? "");
  const [isSavingRequirement, setIsSavingRequirement] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const requirementSaveRef = React.useRef(false);

  const [reviewFiles, setReviewFiles] = useState<{ name: string; path: string }[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [activeDragTask, setActiveDragTask] = useState<{
    index: number;
    content: string;
    status: TaskStatus;
  } | null>(null);

  const loadReviews = useCallback(async () => {
    if (hideGitChrome || !projectPath || !contextId) return;
    const reviewPath = `${projectPath}/.atmos/reviews/${contextId}`;
    setReviewsLoading(true);
    try {
      const res = await fsApi.listDir(reviewPath, {
        dirsOnly: false,
        showHidden: false,
        ignoreNotFound: true,
      });
      if (res && res.entries) {
        const files = res.entries
          .filter((e) => !e.is_dir && e.name.endsWith(".md"))
          .map((e) => ({ name: e.name, path: e.path }))
          .sort((a, b) => b.name.localeCompare(a.name));
        setReviewFiles(files);
      } else {
        setReviewFiles([]);
      }
    } catch {
      setReviewFiles([]);
    } finally {
      setReviewsLoading(false);
    }
  }, [hideGitChrome, projectPath, contextId]);

  const requirementPreview = useMemo(() => {
    if (!requirement) return null;
    const lines = requirement.split("\n");
    if (lines.length <= 8) return null;
    return lines.slice(0, 8).join("\n");
  }, [requirement]);

  const needsExpansion = requirementPreview !== null;
  const effectivePath = workspacePath || projectPath;

  const displayRootDirectory = useMemo(() => {
    if (!effectivePath) return "-";
    const segments = effectivePath.split("/").filter(Boolean);
    if (segments.length <= 3) return effectivePath;
    return `.../${segments.slice(-3).join("/")}`;
  }, [effectivePath]);

  useEffect(() => {
    if (!isEditingRequirement) {
      setDraftRequirement(requirement ?? "");
    }
  }, [isEditingRequirement, requirement]);

  // DnD: drag tasks between status sections
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      const idx = parseInt(id.replace("task-", ""), 10);
      const task = tasks[idx];
      if (task) setActiveDragTask({ index: idx, content: task.content, status: task.status });
    },
    [tasks],
  );
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { over } = event;
      if (over && activeDragTask && effectivePath) {
        const targetStatus = String(over.id).replace("section-", "") as TaskStatus;
        if (targetStatus !== activeDragTask.status) {
          await updateTaskStatus(effectivePath, activeDragTask.index, targetStatus);
        }
      }
      setActiveDragTask(null);
    },
    [activeDragTask, effectivePath, updateTaskStatus],
  );

  useEffect(() => {
    if (effectivePath) {
      loadRequirement(effectivePath);
      loadTasks(effectivePath);
      loadNote(effectivePath);
    }
    if (projectPath && !hideGitChrome) {
      loadReviews();
    }
  }, [
    effectivePath,
    hideGitChrome,
    projectPath,
    loadRequirement,
    loadTasks,
    loadNote,
    loadReviews,
  ]);

  const handleRefresh = useCallback(async () => {
    if (!effectivePath) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        loadRequirement(effectivePath),
        loadTasks(effectivePath),
        loadNote(effectivePath),
        ...(hideGitChrome ? [] : [loadReviews(), refreshPRs?.(), refreshActions?.()]),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    effectivePath,
    hideGitChrome,
    loadRequirement,
    loadTasks,
    loadNote,
    loadReviews,
    refreshPRs,
    refreshActions,
  ]);

  const handleStartRequirementEdit = useCallback(() => {
    if (!effectivePath) return;
    setDraftRequirement(requirement ?? t("requirement.defaultTemplate"));
    setIsEditingRequirement(true);
  }, [effectivePath, requirement, t]);

  const handleSaveRequirement = useCallback(async () => {
    if (!effectivePath || requirementSaveRef.current) return;
    const nextRequirement = draftRequirement;
    if (nextRequirement === (requirement ?? "")) {
      setIsEditingRequirement(false);
      return;
    }
    requirementSaveRef.current = true;
    setIsSavingRequirement(true);
    try {
      await saveRequirement(effectivePath, nextRequirement);
      setRequirementExpanded(false);
      setIsEditingRequirement(false);
    } catch (error) {
      console.error("Failed to save requirement", error);
    } finally {
      requirementSaveRef.current = false;
      setIsSavingRequirement(false);
    }
  }, [draftRequirement, effectivePath, requirement, saveRequirement]);

  const handleOpenPullRequest = useCallback(
    (pr: OverviewPullRequest) => {
      if (onOpenPullRequest) {
        onOpenPullRequest(pr);
        return;
      }
      if (!githubOwner || !githubRepo) return;
      openPullRequestTab({
        branch: effectiveGitBranch,
        label: `#${pr.number} ${pr.title}`,
        owner: githubOwner,
        prNumber: pr.number,
        repo: githubRepo,
        title: pr.title as string | undefined,
        contextId: fileOpenContextId,
      });
    },
    [
      effectiveGitBranch,
      fileOpenContextId,
      githubOwner,
      githubRepo,
      onOpenPullRequest,
      openPullRequestTab,
    ],
  );

  const handleOpenActionRun = useCallback(
    (run: ActionRun) => {
      if (onOpenActionRun) {
        onOpenActionRun(run);
        return;
      }
      if (!githubOwner || !githubRepo) return;
      openActionRunTab({
        owner: githubOwner,
        repo: githubRepo,
        run,
        contextId: fileOpenContextId,
      });
    },
    [fileOpenContextId, githubOwner, githubRepo, onOpenActionRun, openActionRunTab],
  );

  const taskDragOverlay = (
    <DragOverlay dropAnimation={null} zIndex={1600}>
      {activeDragTask ? (
        <div className="flex items-center gap-3 rounded-sm border border-border bg-background px-3 py-2 text-sm shadow-md">
          {renderStatusIcon(activeDragTask.status)}
          <span className="text-sidebar-foreground">{activeDragTask.content}</span>
        </div>
      ) : null}
    </DragOverlay>
  );

  const getIssueStateLabel = useCallback(
    (state?: string) => {
      switch (state?.toLowerCase()) {
        case "open":
          return t("githubIssue.states.open");
        case "closed":
          return t("githubIssue.states.closed");
        default:
          return state ?? "";
      }
    },
    [t],
  );

  const getPullRequestStateLabel = useCallback(
    (state?: string) => {
      switch (state?.toUpperCase()) {
        case "OPEN":
          return t("pullRequests.states.open");
        case "MERGED":
          return t("pullRequests.states.merged");
        case "CLOSED":
          return t("pullRequests.states.closed");
        default:
          return state?.toLowerCase() ?? "";
      }
    },
    [t],
  );

  return (
    <>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 animate-in flex-col gap-5 overflow-y-auto overscroll-contain p-6 duration-300 fade-in">
        {/* Header Section */}
        <div className="flex items-center justify-between border-b border-border/50 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-md border border-sidebar-border bg-sidebar text-muted-foreground">
              <LayoutDashboard className="size-4" />
            </div>
            <div className="flex flex-col">
              <div className="flex min-w-0 items-center gap-3">
                <div className="inline-flex min-w-0 items-center gap-3 text-[11px] text-muted-foreground">
                  {hideGitChrome ? null : (
                    <div className="inline-flex min-w-0 shrink-0 items-center gap-1.5">
                      <GitBranch className="size-3.5" />
                      <span className="font-medium">{effectiveGitBranch}</span>
                    </div>
                  )}
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger className="inline-flex min-w-0 items-center gap-1.5">
                        <FolderOpen className="size-3.5 shrink-0" />
                        <span className="max-w-[280px] truncate font-mono">
                          {displayRootDirectory}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-[520px] font-mono text-[10px] break-all"
                      >
                        {effectivePath || "-"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {isProjectOnly ? projectName : workspaceName || projectName}
              </h1>
            </div>
          </div>
          {showRefreshAction ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 cursor-pointer gap-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {isRefreshing ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              <span className="text-xs">{t("actions.refresh")}</span>
            </Button>
          ) : null}
        </div>

        {/* Middle Section: Tasks & Status */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          {/* Tasks Column */}
          <Card className="flex h-[520px] flex-col border border-border bg-background">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <CheckSquare className="size-4" />
                {t("tasks.title")}
              </CardTitle>
              <div className="flex items-center gap-2.5">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground transition-all duration-300"
                    style={{
                      width:
                        tasks.length > 0
                          ? `${(tasks.filter((t) => t.status === "done").length / tasks.length) * 100}%`
                          : "0%",
                    }}
                  />
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {tasks.filter((t) => t.status === "done").length}/{tasks.length}
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-0 overflow-hidden p-0">
              <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <TaskListPanel
                  tasks={tasks}
                  tasksLoading={tasksLoading}
                  effectivePath={effectivePath || ""}
                  addTask={addTask}
                  updateTaskStatus={updateTaskStatus}
                  updateTaskContent={updateTaskContent}
                  deleteTask={deleteTask}
                  sectionWrapper={(sectionId, children) => (
                    <DroppableSection id={`section-${sectionId}`}>{children}</DroppableSection>
                  )}
                  taskRowWrapper={(index, children) => (
                    <DraggableTask id={`task-${index}`}>{children}</DraggableTask>
                  )}
                />
                {dragOverlayContainer
                  ? createPortal(taskDragOverlay, dragOverlayContainer)
                  : taskDragOverlay}
              </DndContext>
            </CardContent>
          </Card>

          {/* Status/Metadata Column */}
          <Card className="flex h-[520px] min-w-0 flex-col border border-border bg-background">
            <CardHeader className="border-b border-border px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Info className="size-4" />
                {t("details.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="scrollbar-on-hover flex-1 space-y-4 overflow-y-auto p-4">
              {!isProjectOnly && projectId && contextId && (
                <MetadataControlGroup
                  projectId={projectId}
                  workspaceId={contextId}
                  priority={priority}
                  workflowStatus={workflowStatus}
                  labels={labels}
                  workspaceLabels={workspaceLabels}
                  statusLabel={t("metadata.status")}
                  priorityLabel={t("metadata.priority")}
                  labelsLabel={t("metadata.labels")}
                  onUpdatePriority={updateWorkspacePriority}
                  onUpdateWorkflowStatus={updateWorkspaceWorkflowStatus}
                  onUpdateLabels={updateWorkspaceLabels}
                  onCreateLabel={createWorkspaceLabel}
                  onUpdateLabel={updateWorkspaceLabel}
                />
              )}

              {!isProjectOnly && createdAt && (
                <div className="flex items-center justify-between rounded-md bg-muted/30 p-2.5">
                  <div className="flex items-center gap-2.5">
                    <Clock className="size-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">
                      {t("details.created")}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                    {formatDate(createdAt, locale)}
                  </span>
                </div>
              )}

              {!hideGitChrome && githubIssue && (
                <div
                  onClick={() => window.open(githubIssue.url, "_blank", "noopener,noreferrer")}
                  className="cursor-pointer rounded-md border border-border bg-muted/20 p-3 hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Github className="size-3.5" />
                        <span>
                          {githubIssue.owner}/{githubIssue.repo}#{githubIssue.number}
                        </span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[13px] font-medium text-foreground">
                        {githubIssue.title}
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 capitalize">
                      {getIssueStateLabel(githubIssue.state)}
                    </Badge>
                  </div>

                  {githubIssue.labels.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {githubIssue.labels.map((label) => (
                        <Badge key={label.name} variant="outline" className="text-[10px]">
                          {label.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {hideGitChrome ? null : (
                <div className="space-y-2">
                  <h3 className="text-[11px] font-medium text-muted-foreground/70">
                    {t("codeReviews.title")}
                  </h3>
                  <div className="grid gap-2">
                    {reviewsLoading ? (
                      <div className="space-y-1.5">
                        {[1, 2].map((i) => (
                          <Skeleton key={i} className="h-8 w-full rounded-md" />
                        ))}
                      </div>
                    ) : reviewFiles.length > 0 ? (
                      reviewFiles.map((file, i) => (
                        <TooltipProvider key={i} delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                onClick={() => {
                                  void openFile(file.path, fileOpenContextId, { preview: true });
                                  activateCenterChromeTab(fileOpenContextId, file.path, {
                                    placement: "focused",
                                  });
                                }}
                                className="group flex min-w-0 cursor-pointer items-center gap-2.5 rounded-md bg-muted/20 p-2 hover:bg-muted/40"
                              >
                                <FileCheck className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                                <span className="truncate text-[11px] text-muted-foreground group-hover:text-foreground">
                                  {file.name}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-[400px] font-mono text-[10px] break-all"
                            >
                              {file.name}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border/60 py-4 text-center">
                        <FileCheck className="mb-1.5 size-3.5 text-muted-foreground/30" />
                        <h3 className="mb-0.5 text-[11px] text-muted-foreground">
                          {t("codeReviews.emptyTitle")}
                        </h3>
                        <p className="max-w-[200px] text-[10px] text-muted-foreground/50">
                          {t("codeReviews.emptyDescription")}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {hideGitChrome ? null : (
                <div className="space-y-2.5 pt-1">
                  <h3 className="text-[11px] font-medium text-muted-foreground/70">
                    {t("pullRequests.title")}
                  </h3>
                  <div className="grid gap-2">
                    {prsLoading ? (
                      <div className="space-y-1.5">
                        <Skeleton className="h-20 w-full rounded-md" />
                        <Skeleton className="h-20 w-full rounded-md" />
                      </div>
                    ) : prs && prs.length > 0 ? (
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      prs.map((pr: any) => (
                        <div
                          key={pr.number}
                          onClick={() => handleOpenPullRequest(pr)}
                          className="group flex cursor-pointer flex-col rounded-md border border-sidebar-border/50 bg-muted/20 p-3 hover:border-sidebar-border hover:bg-muted/40"
                        >
                          <div className="mb-2 flex items-start justify-between gap-4">
                            <span className="line-clamp-2 text-[13px] leading-snug font-medium text-foreground group-hover:text-primary">
                              {pr.title}
                            </span>
                            <div className="flex shrink-0 gap-1.5 pt-0.5">
                              <TooltipProvider delayDuration={400}>
                                {pr.isDraft && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex size-5 items-center justify-center rounded-md border border-muted-foreground/20 bg-muted/30 text-muted-foreground hover:bg-muted/50">
                                        <GitPullRequestDraft className="size-3" />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="px-2 py-1 text-[10px]">
                                      {t("pullRequests.draft")}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      className={cn(
                                        "flex size-5 cursor-default items-center justify-center rounded-md border transition-all",
                                        pr.state === "OPEN"
                                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                                          : pr.state === "MERGED"
                                            ? "border-purple-500/30 bg-purple-500/15 text-purple-600 hover:bg-purple-500/25 dark:text-purple-400"
                                            : "border-red-500/20 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400",
                                      )}
                                    >
                                      {pr.state === "OPEN" ? (
                                        <GitPullRequest className="size-3" />
                                      ) : pr.state === "MERGED" ? (
                                        <GitMerge className="size-3" />
                                      ) : (
                                        <GitPullRequestClosed className="size-3" />
                                      )}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    className="px-2 py-1 text-[10px] font-medium capitalize"
                                  >
                                    {getPullRequestStateLabel(pr.state)}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <Avatar className="size-4 shrink-0 border border-border/40">
                              <AvatarImage
                                src={
                                  pr.author?.avatar_url ||
                                  pr.author?.avatarUrl ||
                                  `https://github.com/${pr.author?.login?.replace("[bot]", "")}.png?size=32`
                                }
                              />
                              <AvatarFallback className="text-[6px]">
                                {pr.author?.login?.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="max-w-[80px] truncate font-medium text-foreground/80">
                              {pr.author?.login || t("pullRequests.authorUnknown")}
                            </span>
                            {(pr.author?.is_bot || pr.author?.login?.endsWith("[bot]")) && (
                              <span className="flex h-3.5 shrink-0 items-center rounded-sm border border-border bg-muted/40 px-1 py-0 text-[8px] leading-none font-bold tracking-tighter text-muted-foreground uppercase">
                                {t("pullRequests.authorBot")}
                              </span>
                            )}
                            <span className="opacity-30">•</span>
                            <span className="font-mono text-[10px]">#{pr.number}</span>
                            <span className="ml-auto flex shrink-0 items-center gap-1 opacity-30">
                              <Clock className="size-2.5" />
                              {formatDistanceToNow(new Date(pr.createdAt), {
                                addSuffix: true,
                                locale: relativeTimeLocale,
                              })}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border/40 bg-muted/10 py-4 text-center">
                        <GitPullRequest className="mb-1 size-3.5 text-muted-foreground/20" />
                        <span className="text-[10px] text-muted-foreground/50">
                          {t("pullRequests.empty")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {hideGitChrome ? null : (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between pr-1">
                    <h3 className="text-[11px] font-medium text-muted-foreground/70">
                      {t("actionsSection.title")}
                    </h3>
                    {actionRuns && actionRuns.length > 0 && <ActionsSummaryHeader stats={stats} />}
                  </div>
                  <div className="no-scrollbar flex max-h-[300px] shrink-0 flex-col gap-2 overflow-y-auto pr-1">
                    {actionsLoading && (!actionRuns || actionRuns.length === 0) ? (
                      <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border/40 p-4 text-muted-foreground/50">
                        <Loader2 className="mb-2 size-4 animate-spin opacity-50" />
                        <span className="text-[10px]">{t("actionsSection.loading")}</span>
                      </div>
                    ) : latestRuns && latestRuns.length > 0 ? (
                      latestRuns.map((run: ActionRun) => {
                        const isSuccess = run.conclusion === "success";
                        const isCompleted = run.status === "completed";

                        return (
                          <div
                            key={run.databaseId}
                            onClick={() => handleOpenActionRun(run)}
                            className={cn(
                              "flex cursor-pointer flex-col gap-1.5 rounded-md border p-2.5 transition-all hover:shadow-sm",
                              isCompleted
                                ? isSuccess
                                  ? "border-emerald-500/10 bg-emerald-500/5 hover:border-emerald-500/30"
                                  : "border-red-500/10 bg-red-500/5 hover:border-red-500/30"
                                : "border-blue-500/10 bg-blue-500/5 hover:border-blue-500/30",
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {isCompleted ? (
                                  isSuccess ? (
                                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                                  ) : (
                                    <XCircle className="size-3.5 shrink-0 text-red-500" />
                                  )
                                ) : (
                                  <Loader2 className="size-3.5 shrink-0 animate-spin text-blue-500" />
                                )}
                                <span className="line-clamp-1 text-[11px] font-bold tracking-tight text-foreground">
                                  {run.displayTitle || run.workflowName}
                                </span>
                              </div>
                              <span
                                className={cn(
                                  "shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase",
                                  isCompleted
                                    ? isSuccess
                                      ? "bg-emerald-500/10 text-emerald-500"
                                      : "bg-red-500/10 text-red-500"
                                    : "bg-blue-500/10 text-blue-500",
                                )}
                              >
                                {isCompleted ? run.conclusion : run.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 overflow-hidden pl-5 text-[10px] text-muted-foreground">
                              <Rocket className="size-3 shrink-0" />
                              <span className="truncate">{run.workflowName}</span>
                              <span className="shrink-0">•</span>
                              <span className="shrink-0">{formatDate(run.createdAt, locale)}</span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border/40 bg-muted/10 py-4 text-center">
                        <span className="text-[10px] text-muted-foreground/50">
                          {t("actionsSection.empty")}
                        </span>
                      </div>
                    )}
                  </div>

                  {latestRuns.length > 0 && (
                    <div className="flex flex-col gap-2 pt-2">
                      <p className="px-1 text-[10px] leading-normal text-muted-foreground italic">
                        {t("actionsSection.latestRunHint")}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 justify-center gap-2 border border-dashed border-border text-[10px] font-medium hover:bg-muted"
                        onClick={() =>
                          window.open(
                            `https://github.com/${githubOwner}/${githubRepo}/actions?query=branch:${effectiveGitBranch}`,
                            "_blank",
                          )
                        }
                      >
                        <Github className="size-3" />
                        {t("actionsSection.viewAllRuns")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <Card className="flex h-[420px] min-w-0 flex-col border border-border bg-background">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border px-4 py-2.5">
              <CardTitle className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <Pencil className="size-3.5" />
                {t("requirement.title")}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 cursor-pointer gap-1.5 px-3 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={isEditingRequirement ? handleSaveRequirement : handleStartRequirementEdit}
                disabled={!effectivePath || isSavingRequirement}
              >
                {isSavingRequirement ? <Loader2 className="size-3 animate-spin" /> : null}
                {isEditingRequirement ? t("actions.save") : t("actions.edit")}
              </Button>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
              {requirementLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ) : isEditingRequirement ? (
                <Textarea
                  value={draftRequirement}
                  onChange={(event) => setDraftRequirement(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      void handleSaveRequirement();
                    }
                  }}
                  autoFocus
                  placeholder={t("requirement.placeholder")}
                  className="!field-sizing-fixed h-full max-h-full min-h-0 flex-1 resize-none overflow-y-auto rounded-md border-border bg-muted/30 font-mono text-[13px] leading-relaxed"
                />
              ) : requirement ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="scrollbar-on-hover min-h-0 flex-1 overflow-y-auto pr-2">
                    <MarkdownRenderer className="text-[13px] leading-relaxed text-muted-foreground">
                      {requirementExpanded || !needsExpansion ? requirement : requirementPreview!}
                    </MarkdownRenderer>
                  </div>
                  {needsExpansion && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-4 h-8 w-full shrink-0 cursor-pointer rounded-sm border border-dashed border-border text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => setRequirementExpanded(!requirementExpanded)}
                    >
                      {requirementExpanded ? t("requirement.showLess") : t("requirement.showMore")}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-md border border-dashed border-border py-10 text-center">
                  <Pencil className="mb-2 size-5 text-muted-foreground/30" />
                  <h3 className="mb-1 text-[13px] text-muted-foreground">
                    {t("requirement.emptyTitle")}
                  </h3>
                  <p className="mb-4 max-w-[240px] text-[11px] text-muted-foreground/50">
                    {t("requirement.emptyDescription")}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleStartRequirementEdit}
                    disabled={!effectivePath}
                    className="h-8 cursor-pointer gap-1.5 text-[11px] hover:bg-muted"
                  >
                    <Plus className="size-3.5" />
                    {t("requirement.add")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex h-[420px] min-w-0 flex-col overflow-hidden border border-border bg-background">
            <NotePanel
              key={effectivePath}
              note={note}
              noteLoading={noteLoading}
              effectivePath={effectivePath}
              saveNote={saveNote}
              className="h-full"
            />
          </Card>
        </div>

        <style jsx global>{`
          .animate-spin-slow {
            animation: spin 3s linear infinite;
          }
          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(-360deg);
            }
          }
        `}</style>
      </div>
    </>
  );
};

export default OverviewTab;
