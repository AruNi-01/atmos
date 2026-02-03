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
    { id: 'progress', label: 'In Progress', icon: <RotateCcw className="size-3.5" /> },
    { id: 'todo', label: 'To Do', icon: <CircleDashed className="size-3.5" /> },
    { id: 'done', label: 'Completed', icon: <CheckSquare className="size-3.5" /> },
    { id: 'cancelled', label: 'Cancelled', icon: <XOctagon className="size-3.5" /> },
  ];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto animate-in fade-in duration-300">
      {/* Header Section */}
      <div className="flex items-center justify-between pb-4 border-b border-border/10">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-primary/10 rounded-xl text-primary shadow-sm border border-primary/20">
            <LayoutDashboard className="size-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground font-semibold tracking-wide uppercase">
              {isProjectOnly ? 'Project Overview' : 'Workspace Overview'}
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {isProjectOnly ? projectName : workspaceName || projectName}
            </h1>
          </div>
        </div>
        <Button
          variant="outline"
          size="default"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="h-9 gap-2 bg-background border-border/60 hover:bg-muted font-semibold transition-all shadow-sm px-4"
        >
          <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Middle Section: Tasks & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_0.75fr] gap-6">
        {/* Tasks Column */}
        <Card className="bg-card shadow-sm border-border/60 flex flex-col h-[520px]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3 px-5 border-b border-border/30 bg-muted/5">
            <CardTitle className="text-xs font-bold flex items-center gap-2 text-foreground/80 uppercase tracking-widest">
              <CheckSquare className="size-4 text-primary" />
              Tasks
            </CardTitle>
            <span className="text-[11px] text-muted-foreground font-mono font-bold bg-muted/50 px-2 py-0.5 rounded-md border border-border/10">
              {tasks.filter(t => t.status === 'done').length} / {tasks.length}
            </span>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-0 p-0 overflow-hidden">
            <div className="p-4 flex gap-3 border-b border-border/10 bg-muted/5">
              <Input
                value={newTaskContent}
                onChange={(e) => setNewTaskContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTask();
                }}
                placeholder="What needs to be done?"
                className="h-9 text-sm bg-background border-border/40 focus-visible:ring-2 focus-visible:ring-primary/20"
              />
              <Button
                size="icon"
                className="h-9 w-9 shrink-0 shadow-sm"
                onClick={handleAddTask}
                disabled={!newTaskContent.trim()}
              >
                <Plus className="size-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-1.5 py-1.5 no-scrollbar">
              {tasksLoading ? (
                <div className="space-y-4 p-4 pr-6">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex gap-3 items-center">
                      <Skeleton className="size-4 rounded-sm" />
                      <Skeleton className="h-4 flex-1" />
                    </div>
                  ))}
                </div>
              ) : tasks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center py-12 text-muted-foreground/40">
                  <div className="p-4 bg-muted/20 rounded-full mb-3">
                    <CheckSquare className="size-8 opacity-20" />
                  </div>
                  <span className="text-sm font-medium">No tasks added yet.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
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
                        <CollapsibleTrigger className="flex items-center gap-2.5 w-full px-4 py-2 hover:bg-muted/30 transition-all text-[11px] font-bold text-muted-foreground uppercase tracking-wider group rounded-md">
                          <ChevronRight className={cn("size-3.5 transition-transform duration-200 opacity-60", expandedSections[section.id] && "rotate-90")} />
                          <div className="flex items-center gap-2">
                            {section.icon}
                            <span>{section.label}</span>
                          </div>
                          <span className="ml-auto font-mono opacity-40 bg-muted px-1.5 rounded">{sectionTasks.length}</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="flex flex-col gap-0.5 mt-0.5 pb-3 px-1.5">
                            {sectionTasks.length === 0 ? (
                              <div className="px-10 py-2 text-[11px] text-muted-foreground/30 italic">No items in this section.</div>
                            ) : (
                              sectionTasks.map((task) => (
                                <div
                                  key={task.index}
                                  onDoubleClick={() => handleTaskDoubleClick(task.index, task.content)}
                                  className={cn(
                                    'group flex items-center gap-3.5 px-3 py-2 rounded-lg hover:bg-muted/50 transition-all duration-200 border border-transparent shadow-sm hover:shadow-xs hover:border-border/20 cursor-default select-none',
                                    task.status === 'done' && 'opacity-60 grayscale'
                                  )}
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStatusClick(task.index, task.status);
                                    }}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                    className="shrink-0 transition-transform active:scale-90 hover:scale-110 focus:outline-none"
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
                                        className="w-full p-0 border-none bg-transparent outline-none ring-0 text-[13.5px] font-medium text-foreground leading-snug"
                                      />
                                    ) : (
                                      <span
                                        className={cn(
                                          "text-[13.5px] break-words cursor-default select-none font-medium leading-snug",
                                          task.status === 'done' && "line-through decoration-muted-foreground/50",
                                          task.status === 'cancelled' && "line-through decoration-muted-foreground/50 text-muted-foreground/60"
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
                                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity self-center hover:bg-muted rounded-full"
                                        >
                                          <MoreHorizontal className="size-4 text-muted-foreground" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-[160px] p-1.5 shadow-lg">
                                        <DropdownMenuItem onClick={() => handleSetStatus(task.index, 'todo')} className="text-xs py-2">
                                          <Circle className="size-4 mr-2.5 opacity-50" />
                                          To Do
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleSetStatus(task.index, 'progress')} className="text-xs py-2 text-primary font-medium">
                                          <RotateCcw className="size-4 mr-2.5" />
                                          In Progress
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleSetStatus(task.index, 'done')} className="text-xs py-2 text-emerald-500 font-medium whitespace-nowrap">
                                          <CheckSquare className="size-4 mr-2.5" />
                                          Completed
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleSetStatus(task.index, 'cancelled')} className="text-xs py-2 opacity-60">
                                          <XOctagon className="size-4 mr-2.5" />
                                          Cancelled
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator className="my-1" />
                                        <DropdownMenuItem onClick={() => handleTaskDoubleClick(task.index, task.content)} className="text-xs py-2">
                                          <Pencil className="size-4 mr-2.5 opacity-50" />
                                          Edit Task
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => handleDeleteTask(task.index)}
                                          className="text-xs py-2 text-destructive focus:bg-destructive/10 focus:text-destructive font-medium"
                                        >
                                          <Trash2 className="size-4 mr-2.5" />
                                          Delete
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>
                              ))
                            )}
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
        <Card className="bg-card shadow-sm border-border/60 flex flex-col h-[520px]">
          <CardHeader className="py-3 px-5 border-b border-border/30 bg-muted/5">
            <CardTitle className="text-xs font-bold flex items-center gap-2 text-foreground/80 uppercase tracking-widest">
              <History className="size-4 text-primary" />
              Environment
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-5 space-y-7 no-scrollbar">
            {/* Git Status Section */}
            <div className="space-y-3.5">
              <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pl-1 opacity-70">Source Control</h3>
              <div className="grid gap-2.5">
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/20 border border-border/10 group hover:border-primary/20 transition-all hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-primary/10 rounded-lg text-primary border border-primary/20">
                      <GitBranch className="size-4" />
                    </div>
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">Current Branch</span>
                  </div>
                  <span className="text-[12px] font-mono font-black text-foreground bg-primary/10 px-2.5 py-1 rounded-md border border-primary/20 tracking-tight">
                    {propGitBranch || 'main'}
                  </span>
                </div>

                {gitStatus && (
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/20 border border-border/10 group hover:border-primary/20 transition-all hover:bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-muted/50 rounded-lg text-muted-foreground border border-border/20 group-hover:border-primary/20">
                        <GitCommit className="size-4" />
                      </div>
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">Workspace Status</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {stagedFiles.length > 0 && (
                        <span className="text-[10px] font-black bg-emerald-500/10 text-emerald-600 px-2 py-1 rounded-md border border-emerald-500/20 whitespace-nowrap">
                          {stagedFiles.length} STAGED
                        </span>
                      )}
                      {(unstagedFiles.length + untrackedFiles.length) > 0 && (
                        <span className="text-[10px] font-black bg-amber-500/10 text-amber-600 px-2 py-1 rounded-md border border-amber-500/20 whitespace-nowrap">
                          {unstagedFiles.length + untrackedFiles.length} LOCAL
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Info Section */}
            <div className="space-y-3.5">
              <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pl-1 opacity-70">File System Trace</h3>
              <div className="grid gap-2.5">
                <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-muted/20 border border-border/10 group hover:border-primary/20 transition-all">
                  <div className="flex items-center gap-2 text-muted-foreground/50">
                    <MapPin className="size-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Root Directory</span>
                  </div>
                  <span className="text-[11px] font-mono break-all text-muted-foreground leading-relaxed bg-background/50 p-3 rounded-lg border border-border/10 shadow-inner">
                    {effectivePath}
                  </span>
                </div>

                {!isProjectOnly && createdAt && (
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/20 border border-border/10 group hover:border-primary/20 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-muted/50 rounded-lg text-muted-foreground border border-border/20">
                        <Clock className="size-4" />
                      </div>
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">Registry Time</span>
                    </div>
                    <span className="text-[10px] text-foreground font-black tabular-nums tracking-tighter bg-background/50 px-2.5 py-1 rounded-md border border-border/10">
                      {formatDate(createdAt).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4">
              <div className="flex gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10 text-[11px] text-muted-foreground/70 leading-relaxed font-medium">
                <Info className="size-4 mt-0.5 shrink-0 text-primary opacity-50" />
                <span>Live context synchronization activated. Double-click any entry to modify behavioral alignment directly.</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Requirement Bottom Section (Full Width) */}
      <Card className="bg-card shadow-sm border-border/60">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3 px-5 border-b border-border/30 bg-muted/5">
          <CardTitle className="text-[11px] font-bold flex items-center gap-2 text-foreground/80 uppercase tracking-widest">
            <Pencil className="size-4 text-primary" />
            Requirement Specification
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 hover:text-primary hover:bg-primary/5 px-4 transition-all rounded-lg"
            onClick={handleEditRequirement}
          >
            Modify File
          </Button>
        </CardHeader>
        <CardContent className="p-6">
          {requirementLoading ? (
            <div className="space-y-4">
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
                  className="mt-6 h-9 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 hover:text-primary hover:bg-primary/5 w-full border border-dashed border-border/30 rounded-xl transition-all"
                  onClick={() => setRequirementExpanded(!requirementExpanded)}
                >
                  {requirementExpanded ? 'Collapse View' : 'Expand full specification'}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border/40 rounded-2xl bg-muted/5">
              <div className="p-4 bg-muted/10 rounded-full mb-4 border border-border/5">
                <Pencil className="size-8 text-muted-foreground/10" />
              </div>
              <h3 className="text-sm font-black text-foreground/60 mb-1 uppercase tracking-widest">Null Specification</h3>
              <p className="text-[11px] text-muted-foreground/40 mb-6 max-w-[240px] leading-relaxed font-medium italic">
                Initialize the requirement document to establish project behavioral alignment.
              </p>
              <Button variant="default" size="sm" onClick={handleEditRequirement} className="h-10 gap-2 text-[10px] font-black uppercase tracking-[0.2em] hover:scale-105 transition-all rounded-lg px-8 shadow-md">
                Initialize Record
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
