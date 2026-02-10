'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  History,
  ChevronRight,
  CircleDashed,
  RotateCcw
} from 'lucide-react';
import { format } from 'date-fns';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
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

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    progress: true,
    todo: true,
    done: false,
    cancelled: false,
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

  useEffect(() => {
    if (effectivePath) {
      loadRequirement(effectivePath);
      loadTasks(effectivePath);
    }
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
                <div className="flex flex-col gap-0.5">
                  {taskSections.map((section) => {
                    const sectionTasks = groupedTasks[section.id];
                    if (sectionTasks.length === 0 && section.id !== 'todo' && section.id !== 'progress') return null;

                    return (
                      <Collapsible
                        key={section.id}
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
                                <div
                                  key={task.index}
                                  onDoubleClick={() => handleTaskDoubleClick(task.index, task.content)}
                                  className={cn(
                                    'group flex items-center gap-3 px-3 py-2 rounded-sm hover:bg-muted/50 transition-colors cursor-default select-none',
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

                                  <div className="flex-1 min-w-0 flex items-center min-h-[1.5rem]">
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
                                          "text-sm break-words cursor-default select-none text-sidebar-foreground",
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
                              ))
                            )}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Status/Metadata Column */}
        <Card className="bg-background border border-border flex flex-col h-[520px]">
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-xs font-medium flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
              <History className="size-4" />
              Environment
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-on-hover">
            {/* Git Status Section */}
            <div className="space-y-3">
              <h3 className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">Source Control</h3>
              <div className="grid gap-2.5">
                <div className="flex items-center justify-between p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <GitBranch className="size-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Branch</span>
                  </div>
                  <span className="text-xs font-mono text-foreground">
                    {propGitBranch || 'main'}
                  </span>
                </div>

                {gitStatus && (
                  <div className="flex items-center justify-between p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <GitCommit className="size-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Status</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {stagedFiles.length > 0 && (
                        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          {stagedFiles.length} staged
                        </span>
                      )}
                      {(unstagedFiles.length + untrackedFiles.length) > 0 && (
                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          {unstagedFiles.length + untrackedFiles.length} modified
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Info Section */}
            <div className="space-y-3">
              <h3 className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">File System</h3>
              <div className="grid gap-2.5">
                <div className="flex flex-col gap-2 p-3 rounded-md bg-muted/30">
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <MapPin className="size-4" />
                    <span className="text-[11px] uppercase tracking-wide">Root Directory</span>
                  </div>
                  <span className="text-xs font-mono break-all text-muted-foreground pl-6">
                    {effectivePath}
                  </span>
                </div>

                {!isProjectOnly && createdAt && (
                  <div className="flex items-center justify-between p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Clock className="size-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Created</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
                      {formatDate(createdAt)}
                    </span>
                  </div>
                )}
              </div>
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
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default OverviewTab;
