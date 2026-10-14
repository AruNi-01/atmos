"use client";

import React, { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
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
} from "@workspace/ui";
import { Plus, MoreHorizontal, Pencil, Trash2, CheckSquare, ChevronRight } from "lucide-react";
import type { WorkspaceWorkflowStatus } from "@/shared/types/domain";
import { getWorkspaceWorkflowStatusMeta } from "@/app-shell/sidebar/workspace-status";
import type { TaskStatus } from "@/features/workspace/hooks/use-workspace-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getToggleStatus(current: TaskStatus): TaskStatus {
  if (current === "todo" || current === "progress") return "done";
  return "todo";
}

/** Overview checklist statuses map onto the Atmos kanban workflow icons. */
function taskStatusToWorkflowStatus(status: TaskStatus): WorkspaceWorkflowStatus {
  switch (status) {
    case "progress":
      return "in_progress";
    case "done":
      return "completed";
    case "cancelled":
      return "canceled";
    default:
      return "todo";
  }
}

function renderStatusIcon(status: TaskStatus, className = "size-4") {
  const meta = getWorkspaceWorkflowStatusMeta(taskStatusToWorkflowStatus(status));
  const Icon = meta.icon;
  return <Icon className={cn(className, meta.className)} />;
}

const TASK_SECTIONS: {
  id: TaskStatus;
  labelKey: "inProgress" | "toDo" | "completed" | "cancelled";
  icon: React.ReactNode;
}[] = [
  { id: "progress", labelKey: "inProgress", icon: renderStatusIcon("progress") },
  { id: "todo", labelKey: "toDo", icon: renderStatusIcon("todo") },
  { id: "done", labelKey: "completed", icon: renderStatusIcon("done") },
  { id: "cancelled", labelKey: "cancelled", icon: renderStatusIcon("cancelled") },
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
  placeholder,
  listClassName,
}) => {
  const t = useTranslations("Workspace.components.taskListPanel");
  const [newTaskContent, setNewTaskContent] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    progress: true,
    todo: true,
    done: false,
    cancelled: false,
  });

  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, { index: number; content: string; status: TaskStatus }[]> = {
      todo: [],
      progress: [],
      done: [],
      cancelled: [],
    };
    tasks.forEach((task, index) => {
      groups[task.status]?.push({ ...task, index });
    });
    return groups;
  }, [tasks]);

  const handleAdd = useCallback(async () => {
    if (!newTaskContent.trim() || !effectivePath) return;
    await addTask(effectivePath, newTaskContent.trim());
    setNewTaskContent("");
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
    setEditingContent("");
  }, [editingIndex, editingContent, updateTaskContent, effectivePath]);

  const handleEditCancel = useCallback(() => {
    setEditingIndex(null);
    setEditingContent("");
  }, []);

  const handleDelete = useCallback(
    async (index: number) => {
      if (!effectivePath) return;
      await deleteTask(effectivePath, index);
    },
    [deleteTask, effectivePath],
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const wrapSection = sectionWrapper ?? ((_id: string, children: React.ReactNode) => children);
  const wrapRow = taskRowWrapper ?? ((_idx: number, children: React.ReactNode) => children);
  const resolvedPlaceholder = placeholder ?? t("placeholder");

  // ---- Task row renderer (shared between DnD and plain) ----
  const renderTaskRow = (task: { index: number; content: string; status: TaskStatus }) => (
    <div
      onDoubleClick={() => {
        setEditingIndex(task.index);
        setEditingContent(task.content);
      }}
      className={cn(
        "group flex items-center gap-3 rounded-sm px-3 py-2 select-none hover:bg-muted/50",
        task.status === "done" && "opacity-50",
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleStatusClick(task.index, task.status);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className="shrink-0 cursor-pointer transition-transform hover:scale-110 focus:outline-none active:scale-90"
      >
        {renderStatusIcon(task.status)}
      </button>

      <div className="flex min-h-6 min-w-0 flex-1 items-center">
        {editingIndex === task.index ? (
          <input
            value={editingContent}
            onChange={(e) => setEditingContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleEditSubmit();
              if (e.key === "Escape") handleEditCancel();
            }}
            onBlur={handleEditSubmit}
            autoFocus
            onDoubleClick={(e) => e.stopPropagation()}
            className="w-full border-none bg-transparent p-0 text-sm text-foreground ring-0 outline-none"
          />
        ) : (
          <span
            className={cn(
              "cursor-default text-sm wrap-break-word text-sidebar-foreground select-none",
              task.status === "done" && "text-muted-foreground line-through",
              task.status === "cancelled" && "text-muted-foreground/60 line-through",
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
              className="size-6 cursor-pointer rounded-sm p-0 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
            >
              <MoreHorizontal className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[150px]">
            <DropdownMenuItem
              onClick={() => handleSetStatus(task.index, "todo")}
              className="cursor-pointer text-xs"
            >
              {renderStatusIcon("todo", "size-3.5 mr-2")}
              {t("sections.toDo")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleSetStatus(task.index, "progress")}
              className="cursor-pointer text-xs"
            >
              {renderStatusIcon("progress", "size-3.5 mr-2")}
              {t("sections.inProgress")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleSetStatus(task.index, "done")}
              className="cursor-pointer text-xs"
            >
              {renderStatusIcon("done", "size-3.5 mr-2")}
              {t("sections.completed")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleSetStatus(task.index, "cancelled")}
              className="cursor-pointer text-xs"
            >
              {renderStatusIcon("cancelled", "size-3.5 mr-2")}
              {t("sections.cancelled")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setEditingIndex(task.index);
                setEditingContent(task.content);
              }}
              className="cursor-pointer text-xs"
            >
              <Pencil className="mr-2 size-3.5 opacity-50" />
              {t("menu.editTask")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDelete(task.index)}
              className="cursor-pointer text-xs text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-3.5" />
              {t("menu.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <>
      {/* Add task input */}
      <div className="flex gap-2.5 border-b border-border p-3.5">
        <Input
          value={newTaskContent}
          onChange={(e) => setNewTaskContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder={resolvedPlaceholder}
          className="h-9 border-border bg-background text-sm focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button
          size="icon"
          variant="ghost"
          className="size-9 shrink-0 cursor-pointer hover:bg-muted"
          onClick={handleAdd}
          disabled={!newTaskContent.trim()}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Task list body */}
      <div className={cn("scrollbar-on-hover flex-1 overflow-y-auto px-1 py-1", listClassName)}>
        {tasksLoading ? (
          <div className="space-y-3 p-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Skeleton className="size-4 rounded-sm" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-10 text-muted-foreground/50">
            <CheckSquare className="mb-2 size-7 opacity-30" />
            <span className="text-sm">{t("empty.noTasks")}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {TASK_SECTIONS.map((section) => {
              const sectionTasks = groupedTasks[section.id];
              if (sectionTasks.length === 0 && section.id !== "todo" && section.id !== "progress")
                return null;

              const sectionContent = (
                <Collapsible
                  key={section.id}
                  open={expandedSections[section.id]}
                  onOpenChange={() => toggleSection(section.id)}
                  className="w-full"
                >
                  <CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-3.5 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase hover:bg-muted/50">
                    <ChevronRight
                      className={cn(
                        "size-3.5 opacity-50 transition-transform duration-200",
                        expandedSections[section.id] && "rotate-90",
                      )}
                    />
                    <div className="flex items-center gap-2">
                      {section.icon}
                      <span>{t(`sections.${section.labelKey}`)}</span>
                    </div>
                    <span className="ml-auto font-mono text-[11px] opacity-50">
                      {sectionTasks.length}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="relative mt-0.5 ml-[20px] pb-2.5">
                      <div className="absolute top-0 bottom-2.5 left-0 w-px bg-border" />
                      <div className="flex flex-col gap-0.5 pl-4">
                        {sectionTasks.length === 0 ? (
                          <div className="py-2 text-xs text-muted-foreground/40 italic">
                            {t("empty.noItemsInSection")}
                          </div>
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
