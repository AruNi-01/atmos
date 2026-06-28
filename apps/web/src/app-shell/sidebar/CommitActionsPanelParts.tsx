'use client';

import { useTranslations } from 'next-intl';
import { FileText, GitBranch } from 'lucide-react';
import type { GitChangedFile, GitStatusResponse } from '@/api/ws-api';
import { cn } from '@/shared/lib/utils';
import { ChangeSection } from '@/app-shell/sidebar/ChangeSection';
import { basenameFromPath } from '@/app-shell/sidebar/commit-actions-paths';

interface CommitActionsPanelHeaderProps {
  currentProjectName?: string;
  currentProjectPath: string | null;
  currentWorkspaceName?: string;
  gitStatus: GitStatusResponse | null;
  stagedFiles: GitChangedFile[];
  unstagedFiles: GitChangedFile[];
  untrackedFiles: GitChangedFile[];
}

interface CommitActionsPanelChangesProps {
  stagedFiles: GitChangedFile[];
  unstagedFiles: GitChangedFile[];
  untrackedFiles: GitChangedFile[];
  workspaceId: string | null | undefined;
}

export function CommitActionsPanelHeader({
  currentProjectName,
  currentProjectPath,
  currentWorkspaceName,
  gitStatus,
  stagedFiles,
  unstagedFiles,
  untrackedFiles,
}: CommitActionsPanelHeaderProps) {
  const t = useTranslations('AppShell.chrome');
  const repositoryLabel =
    currentWorkspaceName?.trim() ||
    currentProjectName?.trim() ||
    basenameFromPath(currentProjectPath) ||
    t('commitActionsPanel.repository');
  const branchLabel = gitStatus?.current_branch || t('commitActionsPanel.noBranch');
  const changedFiles = [
    ...stagedFiles,
    ...unstagedFiles,
    ...untrackedFiles,
  ];
  const panelStats = [
    {
      label: t('commitActionsPanel.changed'),
      value: gitStatus?.uncommitted_count ?? changedFiles.length,
      className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      valueClassName: 'text-amber-800 dark:text-amber-200',
    },
    {
      label: t('commitActionsPanel.staged'),
      value: stagedFiles.length,
      className: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
      valueClassName: 'text-sky-800 dark:text-sky-200',
    },
    {
      label: t('commitActionsPanel.new'),
      value: untrackedFiles.length,
      className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      valueClassName: 'text-emerald-800 dark:text-emerald-200',
    },
    {
      label: t('commitActionsPanel.unpushed'),
      value: gitStatus?.unpushed_count ?? 0,
      className: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
      valueClassName: 'text-violet-800 dark:text-violet-200',
    },
  ];

  return (
    <div className="flex shrink-0 items-center justify-between gap-4 px-4 pb-3 pt-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{repositoryLabel}</p>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <GitBranch className="size-3.5 shrink-0" />
          <span className="truncate">{branchLabel}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
        {panelStats.map((item) => (
          <span
            key={item.label}
            className={cn(
              'rounded-md border px-2 py-1 text-[11px]',
              item.className,
            )}
          >
            <span className={cn('font-mono', item.valueClassName)}>{item.value}</span> {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CommitActionsPanelChanges({
  stagedFiles,
  unstagedFiles,
  untrackedFiles,
  workspaceId,
}: CommitActionsPanelChangesProps) {
  const t = useTranslations('AppShell.chrome');
  const changedFiles = [
    ...stagedFiles,
    ...unstagedFiles,
    ...untrackedFiles,
  ];
  const totalAdditions = changedFiles.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = changedFiles.reduce((sum, file) => sum + file.deletions, 0);

  return (
    <aside
      className="order-1 flex min-h-0 flex-none flex-col overflow-hidden rounded-lg border border-border/70 bg-muted/25"
      style={{ width: 'calc(60% - 0.5rem)' }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <FileText className="size-3.5" />
          {t('commitActionsPanel.changes')}
        </div>
        <span className="font-mono text-[11px]">
          <span className="text-emerald-600 dark:text-emerald-400">+{totalAdditions}</span>
          <span className="ml-2 text-red-600 dark:text-red-400">-{totalDeletions}</span>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {changedFiles.length > 0 ? (
          <div className="space-y-1">
            <ChangeSection
              kind="staged"
              title={t('commitActionsPanel.stagedChanges')}
              files={stagedFiles}
              workspaceId={workspaceId ?? null}
              readOnly
            />
            <ChangeSection
              kind="unstaged"
              title={t('commitActionsPanel.unstagedChanges')}
              files={unstagedFiles}
              workspaceId={workspaceId ?? null}
              readOnly
            />
            <ChangeSection
              kind="untracked"
              title={t('commitActionsPanel.untrackedChanges')}
              files={untrackedFiles}
              workspaceId={workspaceId ?? null}
              readOnly
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
            {t('commitActionsPanel.noChangedFiles')}
          </div>
        )}
      </div>
    </aside>
  );
}
