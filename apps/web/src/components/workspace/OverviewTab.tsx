'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Input,
  cn,
  GitBranch,
  Square,
  CheckSquare,
  Loader2,
  XSquare,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  ChevronDown,
  MoreHorizontal,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Circle,
  Clock,
  Ban,
} from '@workspace/ui';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTheme } from 'next-themes';
import { useWorkspaceContext, type TaskStatus } from '@/hooks/use-workspace-context';
import { useEditorStore } from '@/hooks/use-editor-store';
import { fsApi } from '@/api/ws-api';

interface OverviewTabProps {
  contextId: string; // workspaceId 或 projectId
  projectName?: string;
  projectPath?: string; // Project 的 mainFilePath
  workspaceName?: string; // 如果有 workspace 则传入
  workspacePath?: string; // 如果有 workspace 则传入
  gitBranch?: string;
  createdAt?: string;
  isProjectOnly?: boolean; // true 表示直接在 Project 下开发（无 Workspace）
}

// 点击 icon 只在 TODO <-> DONE 之间切换
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
  return format(date, 'yyyy-MM-dd HH:mm');
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  contextId,
  projectName,
  projectPath,
  workspaceName,
  workspacePath,
  gitBranch,
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

  const [requirementExpanded, setRequirementExpanded] = useState(false);
  const [newTaskContent, setNewTaskContent] = useState('');
  const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null);
  const [editingTaskContent, setEditingTaskContent] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { resolvedTheme } = useTheme();

  // 获取 requirement 的前 8 行用于预览
  const requirementPreview = React.useMemo(() => {
    if (!requirement) return null;
    const lines = requirement.split('\n');
    if (lines.length <= 8) return null; // 不需要折叠
    return lines.slice(0, 8).join('\n');
  }, [requirement]);

  const needsExpansion = requirementPreview !== null;

  // 根据是否有 workspace 决定使用哪个路径
  const effectivePath = workspacePath || projectPath;

  // Load data on mount - 只在 effectivePath 变化时加载
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
    
    // 检查文件是否存在，不存在则创建
    const response = await fsApi.readFile(filePath);
    if (!response.exists) {
      // 创建空文件（带默认模板）
      const defaultContent = `# Requirement\n\n<!-- 在此描述您的需求 -->\n`;
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
        return <Square className="size-4 text-muted-foreground" />;
      case 'progress':
        return <Loader2 className="size-4 text-blue-500 animate-spin" />;
      case 'done':
        return <CheckSquare className="size-4 text-green-500" />;
      case 'cancelled':
        return <XSquare className="size-4 text-muted-foreground" />;
      default:
        return <Square className="size-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Section 1: Context Info */}
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 flex-wrap">
          <span>
            <span className="text-muted-foreground">Project: </span>
            <span className="font-medium">{projectName || '-'}</span>
          </span>
          {isProjectOnly ? (
            // 仅有 Project，显示 main 分支信息
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Branch: </span>
              <span className="flex items-center gap-1">
                <GitBranch className="size-3.5" />
                <span className="font-medium">{gitBranch || 'main'}</span>
              </span>
            </span>
          ) : (
            // 有 Workspace
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Workspace: </span>
              <span className="font-medium">{workspaceName || '-'}</span>
              {gitBranch && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  (<GitBranch className="size-3.5" />
                  <span>{gitBranch}</span>)
                </span>
              )}
            </span>
          )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh"
          >
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
          </Button>
        </div>
        <div className="flex items-center gap-6 flex-wrap text-muted-foreground">
          <span>
            <span>Path: </span>
            <span className="font-mono text-xs">{effectivePath || '-'}</span>
          </span>
          {!isProjectOnly && createdAt && (
            <span>
              <span>Created: </span>
              <span>{formatDate(createdAt)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Separator */}
      <div className="border-t border-border" />

      {/* Section 2: Requirement */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between group">
          <span className="text-sm font-medium">📝 Requirement</span>
          <Button
            variant="ghost"
            size="sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity h-7 text-xs"
            onClick={handleEditRequirement}
          >
            <Pencil className="size-3 mr-1" />
            Edit
          </Button>
        </div>
        {requirementLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
            <Loader2 className="size-4 animate-spin" />
            Loading...
          </div>
        ) : requirement ? (
          <div className="flex flex-col gap-2">
            <div className={cn(
              "prose prose-sm max-w-none text-sm",
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
                className="h-6 text-xs text-muted-foreground hover:text-foreground self-start"
                onClick={() => setRequirementExpanded(!requirementExpanded)}
              >
                <ChevronDown className={cn("size-3 mr-1 transition-transform", requirementExpanded && "rotate-180")} />
                {requirementExpanded ? 'Show less' : 'Show more'}
              </Button>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-2">
            尚未定义需求。在创建 Workspace 时可填写，或点击 Edit 创建。
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="border-t border-border" />

      {/* Section 3: Tasks */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">✅ Tasks</span>
          <div className="flex items-center gap-2">
            <Input
              value={newTaskContent}
              onChange={(e) => setNewTaskContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTask();
              }}
              placeholder="New task..."
              className="h-7 text-xs w-48"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleAddTask}
              disabled={!newTaskContent.trim()}
            >
              <Plus className="size-3 mr-1" />
              Add Task
            </Button>
          </div>
        </div>

        {tasksLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
            <Loader2 className="size-4 animate-spin" />
            Loading tasks...
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">
            暂无任务。使用上方输入框添加新任务。
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {tasks.map((task, index) => (
              <div
                key={index}
                className={cn(
                  'group flex items-center gap-2 py-1.5 px-2 rounded-sm hover:bg-muted/50 transition-colors',
                  task.status === 'done' && 'text-muted-foreground',
                  task.status === 'cancelled' && 'text-muted-foreground'
                )}
              >
                {/* Status Icon - clickable */}
                <button
                  onClick={() => handleStatusClick(index, task.status)}
                  className="shrink-0 hover:opacity-70 transition-opacity"
                  title="Click to change status"
                >
                  {renderStatusIcon(task.status)}
                </button>

                {/* Content - double click to edit */}
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
                    className="flex-1 h-6 text-sm"
                  />
                ) : (
                  <span
                    onDoubleClick={() => handleTaskDoubleClick(index, task.content)}
                    className={cn(
                      'flex-1 text-sm cursor-default select-none',
                      task.status === 'cancelled' && 'line-through'
                    )}
                  >
                    {task.content}
                  </span>
                )}

                {/* Action buttons - show on hover */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* More actions dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      >
                        <MoreHorizontal className="size-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem 
                        onClick={() => handleSetStatus(index, 'todo')}
                        disabled={task.status === 'todo'}
                      >
                        <Circle className="size-3 mr-2" />
                        Set as TODO
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleSetStatus(index, 'progress')}
                        disabled={task.status === 'progress'}
                      >
                        <Clock className="size-3 mr-2 text-blue-500" />
                        Set as In Progress
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleSetStatus(index, 'done')}
                        disabled={task.status === 'done'}
                      >
                        <CheckSquare className="size-3 mr-2 text-green-500" />
                        Set as Done
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleSetStatus(index, 'cancelled')}
                        disabled={task.status === 'cancelled'}
                      >
                        <Ban className="size-3 mr-2" />
                        Set as Cancelled
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleTaskDoubleClick(index, task.content)}>
                        <Pencil className="size-3 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Delete button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteTask(index)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OverviewTab;
