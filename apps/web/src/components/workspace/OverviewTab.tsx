'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryState, useQueryStates } from 'nuqs';
import { overviewParams, rightSidebarModalParams } from '@/lib/nuqs/searchParams';
import {
  Button,
  Input,
  cn,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
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
} from '@workspace/ui';
import { formatDistanceToNow } from 'date-fns';
import type { DragEndEvent, DragStartEvent } from '@workspace/ui';
import {
  GitBranch,
  MapPin,
  Clock,
  RefreshCw,
  Pencil,
  Plus,
  MoreHorizontal,
  Trash2,
  CheckSquare,
  Circle,
  XOctagon,
  PlayCircle,
  LayoutDashboard,
  Info,
  GitCommit,
  History,
  ChevronRight,
  CircleDashed,
  RotateCcw,
  FileText,
  Rocket,
  GitPullRequest,
  CheckCircle2,
  XCircle,
  Loader2,
  FolderOpen,
  Settings,
  FileCheck,
  GitMerge,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Github
} from 'lucide-react';
import { formatLocalDateTime } from '@atmos/shared';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { useTheme } from 'next-themes';
import { useWorkspaceContext, type TaskStatus } from '@/hooks/use-workspace-context';
import { useEditorStore } from '@/hooks/use-editor-store';
import { useDialogStore } from "@/hooks/use-dialog-store";
import { useProjectStore } from '@/hooks/use-project-store';
import { useGitStore } from '@/hooks/use-git-store';
import { useGitInfoStore } from '@/hooks/use-git-info-store';
import { useGithubPRList, useGithubActionsList } from '@/hooks/use-github';
import { PRDetailModal } from '@/components/github/PRDetailModal';
import { ActionsDetailModal } from '@/components/github/ActionsDetailModal';
import { type ActionRun, useProcessedActions, ActionsSummaryHeader } from '@/components/github/ActionsPanel';
import { fsApi } from '@/api/ws-api';

interface OverviewTabProps {
  contextId: string;
  projectName?: string;
  projectPath?: string;
  workspaceName?: string;
  workspacePath?: string;
  gitBranch?: string;
  createdAt?: string;
  isProjectOnly?: boolean;
}

function getToggleStatus(current: TaskStatus): TaskStatus {
  if (current === 'todo' || current === 'progress') {
    return 'done';
  }
  return 'todo';
}

function formatDate(isoString?: string): string {
  if (!isoString) return '-';
  try {
    return formatLocalDateTime(isoString);
  } catch {
    return '-';
  }
}

// ---------------------------------------------------------------------------
// DnD helper components
// ---------------------------------------------------------------------------

function DroppableSection({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("w-full rounded-sm transition-colors", isOver && "bg-primary/10")}>
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

export const OverviewTab: React.FC<OverviewTabProps> = ({
  contextId,
  projectName,
  projectPath,
  workspaceName,
  workspacePath,
  gitBranch: propGitBranch,
  createdAt,
  isProjectOnly = false,
}) => {
  const { openFile } = useEditorStore();
  const {
    requirement,
    requirementLoading,
    tasks,
    tasksLoading,
    loadRequirement,
    loadTasks,
    addTask,
    updateTaskStatus,
    updateTaskContent,
    deleteTask,
  } = useWorkspaceContext(contextId);

  const { stagedFiles, unstagedFiles, untrackedFiles, gitStatus } = useGitStore();
  const { githubOwner, githubRepo, currentBranch } = useGitInfoStore();

  const effectiveGitBranch = propGitBranch || currentBranch || 'main';
  const { data: prs, loading: prsLoading, refresh: refreshPRs } = useGithubPRList({
    owner: githubOwner || '',
    repo: githubRepo || '',
    branch: effectiveGitBranch
  });
  const { data: actionRuns, loading: actionsLoading, refresh: refreshActions } = useGithubActionsList({
    owner: githubOwner || '',
    repo: githubRepo || '',
    branch: effectiveGitBranch
  });
  const { latestRuns, stats } = useProcessedActions(actionRuns);

  const [{ rsPr: selectedPrNumber, rsRunId: activeRunId }, setModalParams] = useQueryStates(rightSidebarModalParams);
  const { activeActionRun, setActiveActionRun, activePr, setActivePr } = useDialogStore();
  const isPrModalOpen = selectedPrNumber !== null;
  const [requirementExpanded, setRequirementExpanded] = useState(false);
  const [newTaskContent, setNewTaskContent] = useState('');
  const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null);
  const [editingTaskContent, setEditingTaskContent] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { resolvedTheme } = useTheme();

  const [reviewFiles, setReviewFiles] = useState<{ name: string, path: string }[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [activeDragTask, setActiveDragTask] = useState<{ index: number; content: string; status: TaskStatus } | null>(null);

  const loadReviews = useCallback(async () => {
    if (!projectPath || !contextId) return;
    const reviewPath = `${projectPath}/.atmos/reviews/${contextId}`;
    setReviewsLoading(true);
    try {
      const res = await fsApi.listDir(reviewPath, { dirsOnly: false, showHidden: false, ignoreNotFound: true });
      if (res && res.entries) {
        const files = res.entries
          .filter(e => !e.is_dir && e.name.endsWith('.md'))
          .map(e => ({ name: e.name, path: e.path }))
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
  }, [projectPath, contextId]);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    progress: true,
    todo: true,
    done: false,
    cancelled: false,
    sourceControl: false,
    fileSystem: false,
    pullRequests: true,
    actionsStatus: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const requirementPreview = useMemo(() => {
    if (!requirement) return null;
    const lines = requirement.split('\n');
    if (lines.length <= 8) return null;
    return lines.slice(0, 8).join('\n');
  }, [requirement]);

  const needsExpansion = requirementPreview !== null;
  const effectivePath = workspacePath || projectPath;

  // DnD: drag tasks between status sections
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    const idx = parseInt(id.replace('task-', ''), 10);
    const task = tasks[idx];
    if (task) setActiveDragTask({ index: idx, content: task.content, status: task.status });
  }, [tasks]);
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { over } = event;
    if (over && activeDragTask && effectivePath) {
      const targetStatus = String(over.id).replace('section-', '') as TaskStatus;
      if (targetStatus !== activeDragTask.status) {
        await updateTaskStatus(effectivePath, activeDragTask.index, targetStatus);
      }
    }
    setActiveDragTask(null);
  }, [activeDragTask, effectivePath, updateTaskStatus]);

  useEffect(() => {
    if (effectivePath) {
      loadRequirement(effectivePath);
      loadTasks(effectivePath);
    }
    if (projectPath) {
      loadReviews();
    }
  }, [effectivePath, projectPath]);

  const handleRefresh = useCallback(async () => {
    if (!effectivePath) return;
    setIsRefreshing(true);
    await Promise.all([
      loadRequirement(effectivePath),
      loadTasks(effectivePath),
      loadReviews(),
      refreshPRs?.(),
      refreshActions?.(),
    ]);
    setIsRefreshing(false);
  }, [effectivePath, loadRequirement, loadTasks, loadReviews]);

  const handleEditRequirement = useCallback(async () => {
    if (!effectivePath) return;
    const filePath = `${effectivePath}/.atmos/context/requirement.md`;
    const response = await fsApi.readFile(filePath);
    if (!response.exists) {
      const defaultContent = `# Requirement\n\n<!-- Describe your requirement here -->\n`;
      await fsApi.writeFile(filePath, defaultContent);
    }
    // Opening requirement file should be pinned since it's an explicit user action
    openFile(filePath, contextId, { preview: false });
  }, [openFile, effectivePath, contextId]);

  const handleAddTask = useCallback(async () => {
    if (!newTaskContent.trim() || !effectivePath) return;
    await addTask(effectivePath, newTaskContent.trim());
    setNewTaskContent('');
  }, [addTask, newTaskContent, effectivePath]);

  const handleStatusClick = useCallback(
    async (index: number, currentStatus: TaskStatus) => {
      if (!effectivePath) return;
      const nextStatus = getToggleStatus(currentStatus);
      await updateTaskStatus(effectivePath, index, nextStatus);
    },
    [updateTaskStatus, effectivePath]
  );

  const handleSetStatus = useCallback(
    async (index: number, status: TaskStatus) => {
      if (!effectivePath) return;
      await updateTaskStatus(effectivePath, index, status);
    },
    [updateTaskStatus, effectivePath]
  );

  const handleTaskDoubleClick = useCallback((index: number, content: string) => {
    setEditingTaskIndex(index);
    setEditingTaskContent(content);
  }, []);

  const handleTaskEditSubmit = useCallback(async () => {
    if (editingTaskIndex === null || !effectivePath) return;
    await updateTaskContent(effectivePath, editingTaskIndex, editingTaskContent);
    setEditingTaskIndex(null);
    setEditingTaskContent('');
  }, [editingTaskIndex, editingTaskContent, updateTaskContent, effectivePath]);

  const handleTaskEditCancel = useCallback(() => {
    setEditingTaskIndex(null);
    setEditingTaskContent('');
  }, []);

  const handleDeleteTask = useCallback(
    async (index: number) => {
      if (!effectivePath) return;
      await deleteTask(effectivePath, index);
    },
    [deleteTask, effectivePath]
  );

  const renderStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'todo':
        return <Circle className="size-4 text-muted-foreground/60" />;
      case 'progress':
        return <RotateCcw className="size-4 text-primary animate-spin-slow" />;
      case 'done':
        return <CheckSquare className="size-4 text-emerald-500 fill-emerald-500/10" />;
      case 'cancelled':
        return <XOctagon className="size-4 text-muted-foreground/60" />;
      default:
        return <Circle className="size-4 text-muted-foreground/60" />;
    }
  };

  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, { index: number; content: string; status: TaskStatus }[]> = {
      todo: [],
      progress: [],
      done: [],
      cancelled: [],
    };
    tasks.forEach((task, index) => {
      if (groups[task.status]) {
        groups[task.status].push({ ...task, index });
      }
    });
    return groups;
  }, [tasks]);

  const taskSections: { id: TaskStatus; label: string; icon: React.ReactNode }[] = [
    { id: 'progress', label: 'In Progress', icon: <RotateCcw className="size-4" /> },
    { id: 'todo', label: 'To Do', icon: <CircleDashed className="size-4" /> },
    { id: 'done', label: 'Completed', icon: <CheckSquare className="size-4" /> },
    { id: 'cancelled', label: 'Cancelled', icon: <XOctagon className="size-4" /> },
  ];

  return (
    <>
      <div className="flex flex-col gap-5 p-6 max-w-6xl mx-auto animate-in fade-in duration-300">
        {/* Header Section */}
        <div className="flex items-center justify-between pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="size-8 flex items-center justify-center bg-sidebar rounded-md border border-sidebar-border text-muted-foreground">
              <LayoutDashboard className="size-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-medium tracking-wide uppercase">
                {isProjectOnly ? 'Project Overview' : 'Workspace Overview'}
              </span>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {isProjectOnly ? projectName : workspaceName || projectName}
              </h1>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-8 gap-2 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
            <span className="text-xs">Refresh</span>
          </Button>
        </div>

        {/* Middle Section: Tasks & Status */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_0.75fr] gap-5">
          {/* Tasks Column */}
          <Card className="bg-background border border-border flex flex-col h-[520px]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3 px-4 border-b border-border">
              <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
                <CheckSquare className="size-4" />
                Tasks
              </CardTitle>
              <div className="flex items-center gap-2.5">
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-foreground rounded-full transition-all duration-300"
                    style={{ width: tasks.length > 0 ? `${(tasks.filter(t => t.status === 'done').length / tasks.length) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {tasks.filter(t => t.status === 'done').length}/{tasks.length}
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-0 p-0 overflow-hidden">
              <div className="p-3.5 flex gap-2.5 border-b border-border">
                <Input
                  value={newTaskContent}
                  onChange={(e) => setNewTaskContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTask();
                  }}
                  placeholder="What needs to be done? (Double-click task to edit)"
                  className="h-9 text-sm bg-background border-border focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0 hover:bg-muted cursor-pointer"
                  onClick={handleAddTask}
                  disabled={!newTaskContent.trim()}
                >
                  <Plus className="size-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto px-1 py-1 scrollbar-on-hover">
                {tasksLoading ? (
                  <div className="space-y-3 p-3">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="flex gap-2.5 items-center">
                        <Skeleton className="size-4 rounded-sm" />
                        <Skeleton className="h-4 flex-1" />
                      </div>
                    ))}
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-10 text-muted-foreground/50">
                    <CheckSquare className="size-7 mb-2 opacity-30" />
                    <span className="text-sm">No tasks added yet.</span>
                  </div>
                ) : (
                  <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                    <div className="flex flex-col gap-0.5">
                      {taskSections.map((section) => {
                        const sectionTasks = groupedTasks[section.id];
                        if (sectionTasks.length === 0 && section.id !== 'todo' && section.id !== 'progress') return null;

                        return (
                          <DroppableSection key={section.id} id={`section-${section.id}`}>
                            <Collapsible
                              open={expandedSections[section.id]}
                              onOpenChange={() => toggleSection(section.id)}
                              className="w-full"
                            >
                              <CollapsibleTrigger className="flex items-center gap-2.5 w-full px-3.5 py-2 hover:bg-muted/50 transition-colors text-xs font-medium text-muted-foreground uppercase tracking-wide group rounded-sm cursor-pointer">
                                <ChevronRight className={cn("size-3.5 transition-transform duration-200 opacity-50", expandedSections[section.id] && "rotate-90")} />
                                <div className="flex items-center gap-2">
                                  {section.icon}
                                  <span>{section.label}</span>
                                </div>
                                <span className="ml-auto text-[11px] font-mono opacity-50">{sectionTasks.length}</span>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="relative mt-0.5 pb-2.5 ml-[20px]">
                                  {/* Vertical connecting line - aligned with chevron center */}
                                  <div className="absolute left-0 top-0 bottom-2.5 w-px bg-border" />
                                  <div className="flex flex-col gap-0.5 pl-4">
                                    {sectionTasks.length === 0 ? (
                                      <div className="py-2 text-xs text-muted-foreground/40 italic">No items in this section.</div>
                                    ) : (
                                      sectionTasks.map((task) => (
                                        <DraggableTask key={task.index} id={`task-${task.index}`}>
                                          <div
                                            onDoubleClick={() => handleTaskDoubleClick(task.index, task.content)}
                                            className={cn(
                                              'group flex items-center gap-3 px-3 py-2 rounded-sm hover:bg-muted/50 transition-colors select-none',
                                              task.status === 'done' && 'opacity-50'
                                            )}
                                          >
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleStatusClick(task.index, task.status);
                                              }}
                                              onDoubleClick={(e) => e.stopPropagation()}
                                              className="shrink-0 transition-transform active:scale-90 hover:scale-110 focus:outline-none cursor-pointer"
                                            >
                                              {renderStatusIcon(task.status)}
                                            </button>

                                            <div className="flex-1 min-w-0 flex items-center min-h-6">
                                              {editingTaskIndex === task.index ? (
                                                <input
                                                  value={editingTaskContent}
                                                  onChange={(e) => setEditingTaskContent(e.target.value)}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleTaskEditSubmit();
                                                    if (e.key === 'Escape') handleTaskEditCancel();
                                                  }}
                                                  onBlur={handleTaskEditSubmit}
                                                  autoFocus
                                                  onDoubleClick={(e) => e.stopPropagation()}
                                                  className="w-full p-0 border-none bg-transparent outline-none ring-0 text-sm text-foreground"
                                                />
                                              ) : (
                                                <span
                                                  className={cn(
                                                    "text-sm wrap-break-word cursor-default select-none text-sidebar-foreground",
                                                    task.status === 'done' && "line-through text-muted-foreground",
                                                    task.status === 'cancelled' && "line-through text-muted-foreground/60"
                                                  )}
                                                >
                                                  {task.content}
                                                </span>
                                              )}
                                            </div>

                                            <div onDoubleClick={(e) => e.stopPropagation()}>
                                              <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="size-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted rounded-sm cursor-pointer"
                                                  >
                                                    <MoreHorizontal className="size-3.5 text-muted-foreground" />
                                                  </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-[150px]">
                                                  <DropdownMenuItem onClick={() => handleSetStatus(task.index, 'todo')} className="text-xs cursor-pointer">
                                                    <Circle className="size-3.5 mr-2 opacity-50" />
                                                    To Do
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem onClick={() => handleSetStatus(task.index, 'progress')} className="text-xs cursor-pointer">
                                                    <RotateCcw className="size-3.5 mr-2" />
                                                    In Progress
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem onClick={() => handleSetStatus(task.index, 'done')} className="text-xs cursor-pointer">
                                                    <CheckSquare className="size-3.5 mr-2" />
                                                    Completed
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem onClick={() => handleSetStatus(task.index, 'cancelled')} className="text-xs opacity-60 cursor-pointer">
                                                    <XOctagon className="size-3.5 mr-2" />
                                                    Cancelled
                                                  </DropdownMenuItem>
                                                  <DropdownMenuSeparator />
                                                  <DropdownMenuItem onClick={() => handleTaskDoubleClick(task.index, task.content)} className="text-xs cursor-pointer">
                                                    <Pencil className="size-3.5 mr-2 opacity-50" />
                                                    Edit Task
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                    onClick={() => handleDeleteTask(task.index)}
                                                    className="text-xs text-destructive focus:text-destructive cursor-pointer"
                                                  >
                                                    <Trash2 className="size-3.5 mr-2" />
                                                    Delete
                                                  </DropdownMenuItem>
                                                </DropdownMenuContent>
                                              </DropdownMenu>
                                            </div>
                                          </div>
                                        </DraggableTask>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          </DroppableSection>
                        );
                      })}
                    </div>

                    <DragOverlay dropAnimation={null}>
                      {activeDragTask ? (
                        <div className="flex items-center gap-3 px-3 py-2 rounded-sm bg-background border border-border shadow-md text-sm">
                          {renderStatusIcon(activeDragTask.status)}
                          <span className="text-sidebar-foreground">{activeDragTask.content}</span>
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Status/Metadata Column */}
          <Card className="bg-background border border-border flex flex-col h-[520px] min-w-0">
            <CardHeader className="py-3 px-4 border-b border-border">
              <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
                <History className="size-4" />
                Environment
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-on-hover">
              {/* Git Status Section */}
              <div className="space-y-1">
                <Collapsible
                  open={expandedSections.sourceControl}
                  onOpenChange={() => toggleSection('sourceControl')}
                  className="w-full"
                >
                  <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide hover:text-foreground transition-colors group">
                    <ChevronRight className={cn("size-3 transition-transform duration-200", expandedSections.sourceControl && "rotate-90")} />
                    <Settings className="size-3.5" />
                    <span>Source Control</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="grid gap-2 pl-5">
                      <div className="flex items-center justify-between p-2.5 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2.5 shrink-0">
                          <GitBranch className="size-3.5 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground">Branch</span>
                        </div>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[11px] font-mono text-foreground truncate ml-4 max-w-[180px] text-right">
                                {effectiveGitBranch}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-[10px] font-mono">
                              {effectiveGitBranch}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>

                      {gitStatus && (
                        <div className="flex items-center justify-between p-2.5 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <GitCommit className="size-3.5 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground">Status</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {stagedFiles.length > 0 && (
                              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                {stagedFiles.length} staged
                              </span>
                            )}
                            {(unstagedFiles.length + untrackedFiles.length) > 0 && (
                              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                {unstagedFiles.length + untrackedFiles.length} modified
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Info Section */}
              <div className="space-y-1">
                <Collapsible
                  open={expandedSections.fileSystem}
                  onOpenChange={() => toggleSection('fileSystem')}
                  className="w-full"
                >
                  <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide hover:text-foreground transition-colors group">
                    <ChevronRight className={cn("size-3 transition-transform duration-200", expandedSections.fileSystem && "rotate-90")} />
                    <FolderOpen className="size-3.5" />
                    <span>File System</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="grid gap-2 pl-5">
                      <div className="flex flex-col gap-1.5 p-2.5 rounded-md bg-muted/30">
                        <div className="flex items-center gap-2.5 text-muted-foreground">
                          <MapPin className="size-3.5" />
                          <span className="text-[10px] uppercase tracking-wide">Root Directory</span>
                        </div>
                        <span className="text-[11px] font-mono break-all text-muted-foreground pl-6">
                          {effectivePath}
                        </span>
                      </div>

                      {!isProjectOnly && createdAt && (
                        <div className="flex items-center justify-between p-2.5 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <Clock className="size-3.5 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground">Created</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                            {formatDate(createdAt)}
                          </span>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="space-y-2">
                <h3 className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">Code Reviews</h3>
                <div className="grid gap-2">
                  {reviewsLoading ? (
                    <div className="space-y-1.5">
                      {[1, 2].map(i => (
                        <Skeleton key={i} className="h-8 w-full rounded-md" />
                      ))}
                    </div>
                  ) : reviewFiles.length > 0 ? (
                    reviewFiles.map((file, i) => (
                      <TooltipProvider key={i} delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              onClick={() => openFile(file.path, contextId, { preview: true })}
                              className="flex items-center gap-2.5 p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group min-w-0"
                            >
                              <FileCheck className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                              <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors truncate">
                                {file.name}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-[10px] font-mono max-w-[400px] break-all">
                            {file.name}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4 text-center border border-dashed border-border/60 rounded-md">
                      <FileCheck className="size-3.5 text-muted-foreground/30 mb-1.5" />
                      <h3 className="text-[11px] text-muted-foreground mb-0.5">No code reviews yet</h3>
                      <p className="text-[10px] text-muted-foreground/50 max-w-[200px]">
                        Reports will appear here after reviews.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                <h3 className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">Pull Requests</h3>
                <div className="grid gap-2">
                  {prsLoading ? (
                    <div className="space-y-1.5">
                      <Skeleton className="h-20 w-full rounded-md" />
                      <Skeleton className="h-20 w-full rounded-md" />
                    </div>
                  ) : prs && prs.length > 0 ? (
                    prs.map((pr: any) => (
                      <div
                        key={pr.number}
                        onClick={() => {
                          setActivePr(pr);
                          setModalParams({ rsPr: pr.number });
                        }}
                        className="flex flex-col p-3 rounded-md bg-muted/20 border border-sidebar-border/50 hover:bg-muted/40 hover:border-sidebar-border transition-all cursor-pointer group"
                      >
                        <div className="flex justify-between items-start gap-4 mb-2">
                          <span className="text-[13px] font-medium text-foreground group-hover:text-primary transition-colors leading-snug line-clamp-2">
                            {pr.title}
                          </span>
                          <div className="flex gap-1.5 shrink-0 pt-0.5">
                            <TooltipProvider delayDuration={400}>
                              {pr.isDraft && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="size-5 rounded-md bg-muted/30 border border-muted-foreground/20 flex items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors">
                                      <GitPullRequestDraft className="size-3" />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-[10px] py-1 px-2">Draft</TooltipContent>
                                </Tooltip>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className={cn(
                                    "size-5 rounded-md border flex items-center justify-center transition-all cursor-default",
                                    pr.state === 'OPEN' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20' :
                                      pr.state === 'MERGED' ? 'bg-purple-500/15 border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/25' :
                                        'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/20'
                                  )}>
                                    {pr.state === 'OPEN' ? <GitPullRequest className="size-3" /> :
                                      pr.state === 'MERGED' ? <GitMerge className="size-3" /> :
                                        <GitPullRequestClosed className="size-3" />}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-[10px] py-1 px-2 capitalize font-medium">
                                  {pr.state.toLowerCase()}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Avatar className="size-4 shrink-0 border border-border/40">
                            <AvatarImage src={pr.author?.avatar_url || pr.author?.avatarUrl || `https://github.com/${pr.author?.login?.replace('[bot]', '')}.png?size=32`} />
                            <AvatarFallback className="text-[6px]">{pr.author?.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-foreground/80 truncate max-w-[80px]">
                            {pr.author?.login || 'unknown'}
                          </span>
                          {(pr.author?.is_bot || pr.author?.login?.endsWith('[bot]')) && (
                            <span className="text-[8px] px-1 rounded-sm border border-border bg-muted/40 text-muted-foreground font-bold py-0 leading-none h-3.5 flex items-center shrink-0 uppercase tracking-tighter">
                              bot
                            </span>
                          )}
                          <span className="opacity-30">•</span>
                          <span className="font-mono text-[10px]">#{pr.number}</span>
                          <span className="opacity-30 ml-auto flex items-center gap-1 shrink-0">
                            <Clock className="size-2.5" />
                            {formatDistanceToNow(new Date(pr.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4 text-center bg-muted/10 rounded-md border border-dashed border-border/40">
                      <GitPullRequest className="size-3.5 text-muted-foreground/20 mb-1" />
                      <span className="text-[10px] text-muted-foreground/50">No open PRs found</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between pr-1">
                  <h3 className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">Actions</h3>
                  {actionRuns && actionRuns.length > 0 && <ActionsSummaryHeader stats={stats} />}
                </div>
                <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1 no-scrollbar shrink-0">
                  {actionsLoading && (!actionRuns || actionRuns.length === 0) ? (
                    <div className="flex flex-col items-center justify-center p-4 text-muted-foreground/50 border rounded-md border-dashed border-border/40">
                      <Loader2 className="size-4 animate-spin opacity-50 mb-2" />
                      <span className="text-[10px]">Loading workflows...</span>
                    </div>
                  ) : latestRuns && latestRuns.length > 0 ? (
                    latestRuns.map((run: ActionRun) => {
                      const isSuccess = run.conclusion === 'success';
                      const isFailure = run.conclusion === 'failure';
                      const isCompleted = run.status === 'completed';

                      return (
                        <div
                          key={run.databaseId}
                          onClick={() => {
                            setActiveActionRun(run);
                            setModalParams({ rsRunId: run.databaseId });
                          }}
                          className={cn(
                            "flex flex-col gap-1.5 p-2.5 rounded-md transition-all border cursor-pointer hover:shadow-sm",
                            isCompleted ? (
                              isSuccess ? "bg-emerald-500/5 border-emerald-500/10 hover:border-emerald-500/30" : "bg-red-500/5 border-red-500/10 hover:border-red-500/30"
                            ) : "bg-blue-500/5 border-blue-500/10 hover:border-blue-500/30"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isCompleted ? (
                                isSuccess ? <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" /> : <XCircle className="size-3.5 text-red-500 shrink-0" />
                              ) : (
                                <Loader2 className="size-3.5 text-blue-500 animate-spin shrink-0" />
                              )}
                              <span className="text-[11px] font-bold text-foreground tracking-tight line-clamp-1">
                                {run.displayTitle || run.workflowName}
                              </span>
                            </div>
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase shrink-0",
                              isCompleted ? (
                                isSuccess ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                              ) : "bg-blue-500/10 text-blue-500"
                            )}>
                              {isCompleted ? run.conclusion : run.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground pl-5 overflow-hidden">
                            <Rocket className="size-3 shrink-0" />
                            <span className="truncate">{run.workflowName}</span>
                            <span className="shrink-0">•</span>
                            <span className="shrink-0">{formatDate(run.createdAt)}</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4 text-center bg-muted/10 rounded-md border border-dashed border-border/40">
                      <span className="text-[10px] text-muted-foreground/50">No workflow runs detected</span>
                    </div>
                  )}
                </div>

                {latestRuns.length > 0 && (
                  <div className="pt-2 flex flex-col gap-2">
                    <p className="text-[10px] text-muted-foreground leading-normal italic px-1">
                      Only the latest run per workflow is shown. Check full history on GitHub.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-[10px] font-medium gap-2 justify-center border border-dashed border-border hover:bg-muted"
                      onClick={() => window.open(`https://github.com/${githubOwner}/${githubRepo}/actions?query=branch:${effectiveGitBranch}`, '_blank')}
                    >
                      <Github className="size-3" />
                      View All Runs
                    </Button>
                  </div>
                )}
              </div>

            </CardContent>
          </Card>
        </div>

        {/* Requirement Bottom Section (Full Width) */}
        <Card className="bg-background border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-2.5 px-4 border-b border-border">
            <CardTitle className="text-[11px] font-medium flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
              <Pencil className="size-3.5" />
              Requirement Specification
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted px-3 transition-colors cursor-pointer"
              onClick={handleEditRequirement}
            >
              Edit
            </Button>
          </CardHeader>
          <CardContent className="p-4">
            {requirementLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ) : requirement ? (
              <div className="relative">
                <MarkdownRenderer className="text-[13px] text-muted-foreground leading-relaxed">
                  {requirementExpanded || !needsExpansion ? requirement : requirementPreview!}
                </MarkdownRenderer>
                {needsExpansion && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-4 h-8 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted w-full border border-dashed border-border rounded-sm transition-colors cursor-pointer"
                    onClick={() => setRequirementExpanded(!requirementExpanded)}
                  >
                    {requirementExpanded ? 'Show less' : 'Show more'}
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-border rounded-md">
                <Pencil className="size-5 text-muted-foreground/30 mb-2" />
                <h3 className="text-[13px] text-muted-foreground mb-1">No requirement yet</h3>
                <p className="text-[11px] text-muted-foreground/50 mb-4 max-w-[240px]">
                  Add a requirement document for this workspace.
                </p>
                <Button variant="ghost" size="sm" onClick={handleEditRequirement} className="h-8 gap-1.5 text-[11px] hover:bg-muted cursor-pointer">
                  <Plus className="size-3.5" />
                  Add Requirement
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <style jsx global>{`
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
      `}</style>
      </div>
    </>
  );
};

export default OverviewTab;
