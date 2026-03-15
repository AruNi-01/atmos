'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  Button,
  Input,
  cn,
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
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  CheckSquare,
  Circle,
  XOctagon,
  RotateCcw,
  CircleDashed,
  ChevronRight,
} from 'lucide-react';
import type { TaskStatus } from '@/hooks/use-workspace-context';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getToggleStatus(current: TaskStatus): TaskStatus {
  if (current === 'todo' || current === 'progress') return 'done';
  return 'todo';
}

function renderStatusIcon(status: TaskStatus) {
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
}

const TASK_SECTIONS: { id: TaskStatus; label: string; icon: React.ReactNode }[] = [
  { id: 'progress', label: 'In Progress', icon: <RotateCcw className="size-4" /> },
  { id: 'todo', label: 'To Do', icon: <CircleDashed className="size-4" /> },
  { id: 'done', label: 'Completed', icon: <CheckSquare className="size-4" /> },
  { id: 'cancelled', label: 'Cancelled', icon: <XOctagon className="size-4" /> },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskListPanelTask {
  content: string;
  status: TaskStatus;
  rawLine: string;
}

export interface TaskListPanelProps {
  tasks: TaskListPanelTask[];
  tasksLoading: boolean;
  effectivePath: string;
  addTask: (path: string, content: string) => Promise<void>;
  updateTaskStatus: (path: string, idx: number, status: TaskStatus) => Promise<void>;
  updateTaskContent: (path: string, idx: number, content: string) => Promise<void>;
  deleteTask: (path: string, idx: number) => Promise<void>;
  /** Optional wrapper around each task row (e.g. DnD draggable). Receives task index and children. */
  taskRowWrapper?: (index: number, children: React.ReactNode) => React.ReactNode;
  /** Optional wrapper around each section (e.g. DnD droppable). Receives section id and children. */
  sectionWrapper?: (sectionId: string, children: React.ReactNode) => React.ReactNode;
  /** Placeholder text for the add-task input */
  placeholder?: string;
  /** Extra className applied to the scrollable task list body */
  listClassName?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TaskListPanel: React.FC<TaskListPanelProps> = ({
  tasks,
  tasksLoading,
  effectivePath,
  addTask,
  updateTaskStatus,
  updateTaskContent,
  deleteTask,
  taskRowWrapper,
  sectionWrapper,
  placeholder = 'What needs to be done? (Double-click task to edit)',
  listClassName,
}) => {
  const [newTaskContent, setNewTaskContent] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    progress: true,
    todo: true,
    done: false,
    cancelled: false,
  });

  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, { index: number; content: string; status: TaskStatus }[]> = {
      todo: [], progress: [], done: [], cancelled: [],
    };
    tasks.forEach((task, index) => {
      groups[task.status]?.push({ ...task, index });
    });
    return groups;
  }, [tasks]);

  const handleAdd = useCallback(async () => {
    if (!newTaskContent.trim() || !effectivePath) return;
    await addTask(effectivePath, newTaskContent.trim());
    setNewTaskContent('');
  }, [addTask, newTaskContent, effectivePath]);

  const handleStatusClick = useCallback(
    async (index: number, currentStatus: TaskStatus) => {
      if (!effectivePath) return;
      await updateTaskStatus(effectivePath, index, getToggleStatus(currentStatus));
    },
    [updateTaskStatus, effectivePath],
  );

  const handleSetStatus = useCallback(
    async (index: number, status: TaskStatus) => {
      if (!effectivePath) return;
      await updateTaskStatus(effectivePath, index, status);
    },
    [updateTaskStatus, effectivePath],
  );

  const handleEditSubmit = useCallback(async () => {
    if (editingIndex === null || !effectivePath) return;
    await updateTaskContent(effectivePath, editingIndex, editingContent);
    setEditingIndex(null);
    setEditingContent('');
  }, [editingIndex, editingContent, updateTaskContent, effectivePath]);

  const handleEditCancel = useCallback(() => {
    setEditingIndex(null);
    setEditingContent('');
  }, []);

  const handleDelete = useCallback(
    async (index: number) => {
      if (!effectivePath) return;
      await deleteTask(effectivePath, index);
    },
    [deleteTask, effectivePath],
  );

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const wrapSection = sectionWrapper ?? ((_id: string, children: React.ReactNode) => children);
  const wrapRow = taskRowWrapper ?? ((_idx: number, children: React.ReactNode) => children);

  // ---- Task row renderer (shared between DnD and plain) ----
  const renderTaskRow = (task: { index: number; content: string; status: TaskStatus }) => (
    <div
      onDoubleClick={() => { setEditingIndex(task.index); setEditingContent(task.content); }}
      className={cn(
        'group flex items-center gap-3 px-3 py-2 rounded-sm hover:bg-muted/50 transition-colors select-none',
        task.status === 'done' && 'opacity-50'
      )}
    >
      <button
        onClick={(e) => { e.stopPropagation(); handleStatusClick(task.index, task.status); }}
        onDoubleClick={(e) => e.stopPropagation()}
        className="shrink-0 transition-transform active:scale-90 hover:scale-110 focus:outline-none cursor-pointer"
      >
        {renderStatusIcon(task.status)}
      </button>

      <div className="flex-1 min-w-0 flex items-center min-h-6">
        {editingIndex === task.index ? (
          <input
            value={editingContent}
            onChange={(e) => setEditingContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleEditSubmit();
              if (e.key === 'Escape') handleEditCancel();
            }}
            onBlur={handleEditSubmit}
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
            <DropdownMenuItem onClick={() => { setEditingIndex(task.index); setEditingContent(task.content); }} className="text-xs cursor-pointer">
              <Pencil className="size-3.5 mr-2 opacity-50" />
              Edit Task
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDelete(task.index)}
              className="text-xs text-destructive focus:text-destructive cursor-pointer"
            >
              <Trash2 className="size-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <>
      {/* Add task input */}
      <div className="p-3.5 flex gap-2.5 border-b border-border">
        <Input
          value={newTaskContent}
          onChange={(e) => setNewTaskContent(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder={placeholder}
          className="h-9 text-sm bg-background border-border focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button
          size="icon"
          variant="ghost"
          className="size-9 shrink-0 hover:bg-muted cursor-pointer"
          onClick={handleAdd}
          disabled={!newTaskContent.trim()}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Task list body */}
      <div className={cn("flex-1 overflow-y-auto px-1 py-1 scrollbar-on-hover", listClassName)}>
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
            {TASK_SECTIONS.map((section) => {
              const sectionTasks = groupedTasks[section.id];
              if (sectionTasks.length === 0 && section.id !== 'todo' && section.id !== 'progress') return null;

              const sectionContent = (
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
                      <div className="absolute left-0 top-0 bottom-2.5 w-px bg-border" />
                      <div className="flex flex-col gap-0.5 pl-4">
                        {sectionTasks.length === 0 ? (
                          <div className="py-2 text-xs text-muted-foreground/40 italic">No items in this section.</div>
                        ) : (
                          sectionTasks.map((task) => (
                            <React.Fragment key={task.index}>
                              {wrapRow(task.index, renderTaskRow(task))}
                            </React.Fragment>
                          ))
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );

              return (
                <React.Fragment key={section.id}>
                  {wrapSection(section.id, sectionContent)}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

// Re-export helpers for consumers that need them (e.g. DnD overlay in OverviewTab)
export { renderStatusIcon, getToggleStatus, TASK_SECTIONS };
