'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
} from '@workspace/ui';
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
  History
} from 'lucide-react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTheme } from 'next-themes';
import { useWorkspaceContext, type TaskStatus } from '@/hooks/use-workspace-context';
import { useEditorStore } from '@/hooks/use-editor-store';
import { useGitStore } from '@/hooks/use-git-store';
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
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '-';
  return format(date, 'MMM d, yyyy • HH:mm');
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

  const [requirementExpanded, setRequirementExpanded] = useState(false);
  const [newTaskContent, setNewTaskContent] = useState('');
  const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null);
  const [editingTaskContent, setEditingTaskContent] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { resolvedTheme } = useTheme();

  const requirementPreview = React.useMemo(() => {
    if (!requirement) return null;
    const lines = requirement.split('\n');
    if (lines.length <= 8) return null;
    return lines.slice(0, 8).join('\n');
  }, [requirement]);

  const needsExpansion = requirementPreview !== null;
  const effectivePath = workspacePath || projectPath;

  useEffect(() => {
    if (effectivePath) {
      loadRequirement(effectivePath);
      loadTasks(effectivePath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePath]);

  const handleRefresh = useCallback(async () => {
    if (!effectivePath) return;
    setIsRefreshing(true);
    await Promise.all([
      loadRequirement(effectivePath),
      loadTasks(effectivePath),
    ]);
    setIsRefreshing(false);
  }, [effectivePath, loadRequirement, loadTasks]);

  const handleEditRequirement = useCallback(async () => {
    if (!effectivePath) return;
    const filePath = `${effectivePath}/.atmos/context/requirement.md`;
    const response = await fsApi.readFile(filePath);
    if (!response.exists) {
      const defaultContent = `# Requirement\n\n<!-- Describe your requirement here -->\n`;
      await fsApi.writeFile(filePath, defaultContent);
    }
    openFile(filePath, contextId);
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
        return <Circle className="size-4 text-muted-foreground/50" />;
      case 'progress':
        return <PlayCircle className="size-4 text-blue-500 animate-pulse fill-blue-500/10" />;
      case 'done':
        return <CheckSquare className="size-4 text-emerald-500 fill-emerald-500/10" />;
      case 'cancelled':
        return <XOctagon className="size-4 text-muted-foreground" />;
      default:
        return <Circle className="size-4 text-muted-foreground/50" />;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto animate-in fade-in duration-300">
      {/* Header Section */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl text-primary shadow-sm border border-primary/20">
            <LayoutDashboard className="size-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground font-semibold tracking-wider uppercase">
              {isProjectOnly ? 'Project Overview' : 'Workspace Overview'}
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {isProjectOnly ? projectName : workspaceName || projectName}
            </h1>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="h-9 gap-2 bg-background/50 backdrop-blur-sm border-border/60 hover:bg-muted/50 transition-all font-medium"
        >
          <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Middle Section: Tasks & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks Column */}
        <Card className="bg-card/40 backdrop-blur-md shadow-sm border-border/50 flex flex-col h-[480px]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4 px-5 border-b border-border/30">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground/90">
              <CheckSquare className="size-4 text-primary" />
              Tasks
            </CardTitle>
            <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full font-mono font-bold border border-border/10">
              {tasks.filter(t => t.status === 'done').length} / {tasks.length}
            </span>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4 p-0 overflow-hidden">
            <div className="p-4 flex gap-2 border-b border-border/20 bg-muted/5">
              <Input
                value={newTaskContent}
                onChange={(e) => setNewTaskContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTask();
                }}
                placeholder="What needs to be done?"
                className="h-9 text-sm border-border/40 focus:border-primary/50"
              />
              <Button
                size="icon"
                className="h-9 w-9 shrink-0 shadow-sm"
                onClick={handleAddTask}
                disabled={!newTaskContent.trim()}
              >
                <Plus className="size-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-2 no-scrollbar">
              {tasksLoading ? (
                <div className="space-y-4 pt-2">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex gap-3 items-center">
                      <Skeleton className="size-4 rounded-sm" />
                      <Skeleton className="h-4 flex-1" />
                    </div>
                  ))}
                </div>
              ) : tasks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center py-8 text-muted-foreground/60">
                  <div className="p-3 bg-muted/20 rounded-full mb-3">
                    <CheckSquare className="size-6 opacity-20" />
                  </div>
                  <span className="text-sm italic">No tasks yet.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {tasks.map((task, index) => (
                    <div
                      key={index}
                      className={cn(
                        'group flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-all duration-200 border border-transparent hover:border-border/20',
                        task.status === 'done' && 'opacity-60'
                      )}
                    >
                      <button
                        onClick={() => handleStatusClick(index, task.status)}
                        className="mt-0.5 shrink-0 hover:scale-110 transition-transform focus:outline-none"
                      >
                        {renderStatusIcon(task.status)}
                      </button>

                      <div className="flex-1 min-w-0">
                        {editingTaskIndex === index ? (
                          <Input
                            value={editingTaskContent}
                            onChange={(e) => setEditingTaskContent(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleTaskEditSubmit();
                              if (e.key === 'Escape') handleTaskEditCancel();
                            }}
                            onBlur={handleTaskEditSubmit}
                            autoFocus
                            className="h-auto p-0 border-none bg-transparent focus-visible:ring-0 text-sm leading-tight font-normal"
                          />
                        ) : (
                          <div
                            onDoubleClick={() => handleTaskDoubleClick(index, task.content)}
                            className={cn(
                              "text-sm break-words leading-tight cursor-default select-none",
                              task.status === 'done' && "line-through decoration-muted-foreground/50",
                              task.status === 'cancelled' && "line-through decoration-muted-foreground/50 text-muted-foreground"
                            )}
                          >
                            {task.content}
                          </div>
                        )}
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity self-start hover:bg-muted"
                          >
                            <MoreHorizontal className="size-3.5 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[160px]">
                          <DropdownMenuItem onClick={() => handleSetStatus(index, 'todo')}>
                            <Circle className="size-3.5 mr-2" />
                            To Do
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSetStatus(index, 'progress')}>
                            <PlayCircle className="size-3.5 mr-2 text-blue-500" />
                            In Progress
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSetStatus(index, 'done')}>
                            <CheckSquare className="size-3.5 mr-2 text-emerald-500" />
                            Done
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSetStatus(index, 'cancelled')}>
                            <XOctagon className="size-3.5 mr-2" />
                            Cancelled
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleTaskDoubleClick(index, task.content)}>
                            <Pencil className="size-3.5 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteTask(index)}
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          >
                            <Trash2 className="size-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Status/Metadata Column */}
        <Card className="bg-card/40 backdrop-blur-md shadow-sm border-border/50 flex flex-col h-[480px]">
          <CardHeader className="py-4 px-5 border-b border-border/30">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground/90">
              <History className="size-4 text-primary" />
              Project Status
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-5 space-y-6 no-scrollbar">
            {/* Git Status Section */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Git Environment</h3>
              <div className="grid gap-2">
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/30">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-500">
                      <GitBranch className="size-4" />
                    </div>
                    <span className="text-xs font-medium">Current Branch</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-foreground/80 bg-background/50 px-2 py-0.5 rounded border border-border/20">
                    {propGitBranch || 'main'}
                  </span>
                </div>

                {gitStatus && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/30">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-500">
                        <GitCommit className="size-4" />
                      </div>
                      <span className="text-xs font-medium">Working Changes</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {stagedFiles.length > 0 && (
                        <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          S:{stagedFiles.length}
                        </span>
                      )}
                      <span className="text-[10px] font-bold bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded border border-amber-500/20">
                        M:{unstagedFiles.length + untrackedFiles.length}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Info Section */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Location & Details</h3>
              <div className="grid gap-2">
                <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-muted/20 border border-border/30">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="size-3.5" />
                    <span className="text-[11px] font-semibold">Repository Path</span>
                  </div>
                  <span className="text-xs font-mono break-all text-foreground/70 leading-relaxed bg-background/30 p-2 rounded border border-border/10">
                    {effectivePath}
                  </span>
                </div>

                {!isProjectOnly && createdAt && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/30">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-purple-500/10 rounded-lg text-purple-500">
                        <Clock className="size-4" />
                      </div>
                      <span className="text-xs font-medium">Initialized</span>
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">
                      {formatDate(createdAt)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-border/20">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10 text-[11px] text-primary/80 leading-snug">
                <Info className="size-4 shrink-0" />
                Double click tasks to edit them directly. Changes are automatically synced to workspace context.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Requirement Bottom Section (Full Width) */}
      <Card className="bg-card/40 backdrop-blur-md shadow-sm border-border/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 py-4 px-6 border-b border-border/30">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground/90">
            <Pencil className="size-4 text-primary" />
            Requirement
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5 hover:bg-muted"
            onClick={handleEditRequirement}
          >
            <Pencil className="size-3" />
            Edit Requirement
          </Button>
        </CardHeader>
        <CardContent className="p-6">
          {requirementLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : requirement ? (
            <div className="relative">
              <div className={cn(
                "prose prose-sm max-w-none text-[13.5px] text-muted-foreground leading-relaxed",
                resolvedTheme === 'dark' && "prose-invert"
              )}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {requirementExpanded || !needsExpansion ? requirement : requirementPreview!}
                </ReactMarkdown>
              </div>
              {needsExpansion && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4 h-8 text-xs text-muted-foreground/80 hover:text-foreground hover:bg-muted/50 w-full border border-border/20"
                  onClick={() => setRequirementExpanded(!requirementExpanded)}
                >
                  {requirementExpanded ? 'Show less' : 'View full requirement document'}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-muted/50 rounded-2xl bg-muted/5">
              <div className="p-4 bg-muted/20 rounded-full mb-4">
                <Pencil className="size-8 text-muted-foreground/30" />
              </div>
              <h3 className="text-sm font-semibold text-foreground/80 mb-1">No Requirement Document</h3>
              <p className="text-xs text-muted-foreground mb-4 max-w-[240px]">
                Define clear goals and features for this workspace to help agents understand your needs.
              </p>
              <Button variant="outline" size="sm" onClick={handleEditRequirement} className="h-9 gap-2 shadow-sm border-primary/20 text-primary hover:bg-primary/5">
                <Plus className="size-3.5" />
                Initialize Requirement
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OverviewTab;
