'use client';

import React from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@workspace/ui';
import { ChevronRight, GitCommit, ListTodo, PanelTop, StickyNote } from 'lucide-react';
import {
  TaskListPanel,
  type TaskListPanelTask,
} from '@/features/workspace/components/TaskListPanel';
import { NotePanel } from '@/features/workspace/components/NotePanel';
import { useWorkspaceContextStore } from '@/features/workspace/hooks/use-workspace-context';
import { useLayoutSettingsStore } from '@/features/settings/store/layout-settings-store';
import { useGitStatusQuery } from '@/features/git/hooks/use-git-status-query';
import { CommitActionsContainer } from '@/app-shell/sidebar/CommitActionsContainer';
import { useTranslations } from "next-intl";

const EMPTY_TASKS: TaskListPanelTask[] = [];

interface HeaderWorkspaceSummaryButtonProps {
  contextId: string | null;
  currentProjectName?: string | null;
  currentWorkspaceDisplayName?: string | null;
  currentWorkspaceName?: string | null;
  effectivePath?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
}

function formatWorkspaceLabel(displayName?: string | null, name?: string | null) {
  if (displayName && name && displayName !== name) return `${displayName} / ${name}`;
  return displayName || name || null;
}

function useHeaderTasks(contextId: string | null, effectivePath?: string | null, enabled = true) {
  const tasks = useWorkspaceContextStore((state) =>
    contextId ? state.workspaceStates[contextId]?.tasks ?? EMPTY_TASKS : EMPTY_TASKS,
  );
  const tasksLoading = useWorkspaceContextStore((state) => state.tasksLoading);
  const loadTasks = useWorkspaceContextStore((state) => state.loadTasks);
  const addTask = useWorkspaceContextStore((state) => state.addTask);
  const updateTaskStatus = useWorkspaceContextStore((state) => state.updateTaskStatus);
  const updateTaskContent = useWorkspaceContextStore((state) => state.updateTaskContent);
  const deleteTask = useWorkspaceContextStore((state) => state.deleteTask);

  React.useEffect(() => {
    if (!enabled) return;
    if (!contextId || !effectivePath) return;
    void loadTasks(contextId, effectivePath);
  }, [contextId, effectivePath, enabled, loadTasks]);

  return {
    tasks,
    tasksLoading,
    addTask: React.useCallback((path: string, content: string) => (
      contextId ? addTask(contextId, path, content) : Promise.resolve()
    ), [addTask, contextId]),
    updateTaskStatus: React.useCallback((path: string, idx: number, status: Parameters<typeof updateTaskStatus>[3]) => (
      contextId ? updateTaskStatus(contextId, path, idx, status) : Promise.resolve()
    ), [contextId, updateTaskStatus]),
    updateTaskContent: React.useCallback((path: string, idx: number, content: string) => (
      contextId ? updateTaskContent(contextId, path, idx, content) : Promise.resolve()
    ), [contextId, updateTaskContent]),
    deleteTask: React.useCallback((path: string, idx: number) => (
      contextId ? deleteTask(contextId, path, idx) : Promise.resolve()
    ), [contextId, deleteTask]),
  };
}

function useHeaderNote(contextId: string | null, effectivePath?: string | null, enabled = true) {
  const note = useWorkspaceContextStore((state) =>
    contextId ? state.workspaceStates[contextId]?.note ?? null : null,
  );
  const noteLoading = useWorkspaceContextStore((state) => state.noteLoading);
  const loadNote = useWorkspaceContextStore((state) => state.loadNote);
  const saveNote = useWorkspaceContextStore((state) => state.saveNote);

  React.useEffect(() => {
    if (!enabled) return;
    if (!contextId || !effectivePath) return;
    void loadNote(contextId, effectivePath);
  }, [contextId, effectivePath, enabled, loadNote]);

  return {
    note,
    noteLoading,
    saveNote: React.useCallback((path: string, content: string, expectedContent?: string) => (
      contextId ? saveNote(contextId, path, content, expectedContent) : Promise.resolve(false)
    ), [contextId, saveNote]),
  };
}

function formatNoteMeta(
  note: string | null,
  noteLoading: boolean,
  labels: { loading: string; empty: string },
) {
  if (noteLoading && note == null) return labels.loading;
  const trimmed = note?.trim() ?? '';
  if (!trimmed) return labels.empty;
  const firstLine = trimmed.split('\n').find((line) => line.trim())?.trim() ?? trimmed;
  return firstLine.length > 64 ? `${firstLine.slice(0, 64)}…` : firstLine;
}

type SummaryRowProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  meta?: string;
  title: string;
};

const SummaryRow = React.forwardRef<HTMLButtonElement, SummaryRowProps>(function SummaryRow(
  {
    className,
    disabled,
    icon,
    label,
    meta,
    onClick,
    title,
    ...buttonProps
  },
  ref,
) {
  const content = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/30 text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-popover-foreground">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta || label}</span>
      </span>
      {onClick ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" /> : null}
    </>
  );

  if (!onClick) {
    return (
      <div className="flex items-center gap-3 rounded-md px-2 py-2">
        {content}
      </div>
    );
  }

  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {content}
    </button>
  );
});

function NestedSummaryPopover({
  children,
  row,
  widthClassName,
}: {
  children: React.ReactNode;
  row: React.ReactElement;
  widthClassName: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {row}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="left"
        sideOffset={10}
        className={cn('max-w-[calc(100vw-24px)] p-0', widthClassName)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function HeaderWorkspaceSummaryButton({
  contextId,
  currentProjectName,
  currentWorkspaceDisplayName,
  currentWorkspaceName,
  effectivePath,
  projectId,
  workspaceId,
}: HeaderWorkspaceSummaryButtonProps) {
  const t = useTranslations("header");
  const showTask = useLayoutSettingsStore((state) => state.showHeaderSummaryTask);
  const showNote = useLayoutSettingsStore((state) => state.showHeaderSummaryNote);
  const showCommit = useLayoutSettingsStore((state) => state.showHeaderSummaryCommit);
  const statusQuery = useGitStatusQuery(effectivePath ?? null);
  const hasMergeConflicts = statusQuery.data?.has_merge_conflicts ?? false;
  const hasUncommittedChanges = statusQuery.data?.has_uncommitted_changes ?? false;
  const hasUnpushedCommits = statusQuery.data?.has_unpushed_commits ?? false;
  const uncommittedCount = statusQuery.data?.uncommitted_count ?? 0;
  const unpushedCount = statusQuery.data?.unpushed_count ?? 0;
  const {
    tasks,
    tasksLoading,
    addTask,
    updateTaskStatus,
    updateTaskContent,
    deleteTask,
  } = useHeaderTasks(contextId, effectivePath, showTask);
  const {
    note,
    noteLoading,
    saveNote,
  } = useHeaderNote(contextId, effectivePath, showNote);

  if (!contextId || !effectivePath) return null;

  const workspaceLabel = formatWorkspaceLabel(currentWorkspaceDisplayName, currentWorkspaceName);
  const contextTitle = workspaceLabel && currentProjectName
    ? `${currentProjectName} - ${workspaceLabel}`
    : currentProjectName || workspaceLabel || t("summary.fallbackWorkspace");
  const contextMeta = workspaceLabel ? workspaceLabel : effectivePath;

  const progressCount = tasks.filter((task) => task.status === 'progress').length;
  const todoCount = tasks.filter((task) => task.status === 'todo').length;
  const doneCount = tasks.filter((task) => task.status === 'done').length;
  const activeTaskCount = progressCount + todoCount;
  const taskMeta = tasksLoading && tasks.length === 0
    ? t("summary.loadingTasks")
    : t("summary.taskMeta", { activeCount: activeTaskCount, doneCount, totalCount: tasks.length });
  const noteMeta = formatNoteMeta(note, noteLoading, {
    loading: t("summary.loadingNote"),
    empty: t("summary.emptyNote"),
  });
  const commitMeta = hasMergeConflicts
    ? t("summary.mergeConflictsNeedAttention")
    : [
      hasUncommittedChanges ? t("summary.changed", { count: uncommittedCount }) : null,
      hasUnpushedCommits ? t("summary.unpushed", { count: unpushedCount }) : null,
    ].filter(Boolean).join(' · ') || t("summary.clean");

  const currentProject = projectId && currentProjectName
    ? { id: projectId, name: currentProjectName }
    : undefined;
  const currentWorkspace = workspaceId
    ? {
        id: workspaceId,
        name: currentWorkspaceName || currentWorkspaceDisplayName || undefined,
        localPath: effectivePath,
      }
    : undefined;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("summary.openWorkspaceSummary")}
              className="desktop-no-drag flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PanelTop className="size-4" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <span>{t("summary.workspaceSummary")}</span>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[360px] max-w-[calc(100vw-24px)] p-2"
      >
        <div className="space-y-1">
          <SummaryRow
            icon={<PanelTop className="size-4" />}
            label={contextMeta}
            meta={contextMeta}
            title={contextTitle}
          />

          {showTask ? (
            <NestedSummaryPopover
              widthClassName="w-[430px]"
              row={(
                <SummaryRow
                  icon={<ListTodo className="size-4" />}
                  label={taskMeta}
                  meta={taskMeta}
                  title={t("summary.task")}
                />
              )}
            >
              <div className="flex h-[min(560px,76vh)] flex-col overflow-hidden rounded-md bg-popover">
                <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <ListTodo className="size-4" />
                    {t("summary.task")}
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {doneCount}/{tasks.length}
                  </span>
                </div>
                <TaskListPanel
                  tasks={tasks}
                  tasksLoading={tasksLoading}
                  effectivePath={effectivePath}
                  addTask={addTask}
                  updateTaskStatus={updateTaskStatus}
                  updateTaskContent={updateTaskContent}
                  deleteTask={deleteTask}
                />
              </div>
            </NestedSummaryPopover>
          ) : null}

          {showNote ? (
            <NestedSummaryPopover
              widthClassName="w-[430px]"
              row={(
                <SummaryRow
                  icon={<StickyNote className="size-4" />}
                  label={noteMeta}
                  meta={noteMeta}
                  title={t("summary.note")}
                />
              )}
            >
              <div className="flex h-[min(560px,76vh)] flex-col overflow-hidden rounded-md bg-popover">
                <NotePanel
                  key={effectivePath}
                  note={note}
                  noteLoading={noteLoading}
                  effectivePath={effectivePath}
                  saveNote={saveNote}
                  className="h-full"
                />
              </div>
            </NestedSummaryPopover>
          ) : null}

          {showCommit ? (
            <NestedSummaryPopover
              widthClassName="w-[420px]"
              row={(
                <SummaryRow
                  icon={<GitCommit className="size-4" />}
                  label={commitMeta}
                  meta={commitMeta}
                  title={t("summary.commitPush")}
                />
              )}
            >
              <CommitActionsContainer
                currentProjectPath={effectivePath}
                currentProject={currentProject}
                currentWorkspace={currentWorkspace}
                workspaceId={workspaceId}
                projectId={projectId}
                className="border-t-0 bg-popover"
              />
            </NestedSummaryPopover>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
