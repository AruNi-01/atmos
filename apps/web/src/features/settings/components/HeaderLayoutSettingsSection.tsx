'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Command,
  GitBranch,
  GitCommit,
  Globe,
  ListTodo,
  PanelTop,
  Search,
  SquareDashedMousePointer,
  StickyNote,
} from 'lucide-react';
import { isDesktopRuntime } from '@/shared/lib/desktop-runtime';
import { useLayoutSettingsStore } from '@/features/settings/store/layout-settings-store';
import { SettingsGroupCard } from '@/features/settings/components/settings/SettingsGroupCard';
import { SettingsToggleRow } from '@/features/settings/components/settings/SettingsToggleRow';

interface HeaderLayoutSettingsSectionProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export function HeaderLayoutSettingsSection({
  expanded,
  onExpandedChange,
}: HeaderLayoutSettingsSectionProps) {
  const t = useTranslations('settings.headerLayoutSection');
  // Live detect — do not freeze on first paint (Electron preload race).
  const isDesktop = isDesktopRuntime();

  const {
    showHeaderQuickOpen,
    showHeaderGitToolbar,
    showHeaderGlobalSearch,
    showHeaderSummary,
    showHeaderSummaryTask,
    showHeaderSummaryNote,
    showHeaderSummaryCommit,
    showHeaderRemoteAccess,
    showHeaderAppshot,
    setHeaderShowQuickOpen,
    setHeaderShowGitToolbar,
    setHeaderShowGlobalSearch,
    setHeaderShowSummary,
    setHeaderShowSummaryTask,
    setHeaderShowSummaryNote,
    setHeaderShowSummaryCommit,
    setHeaderShowRemoteAccess,
    setHeaderShowAppshot,
  } = useLayoutSettingsStore();

  const enabledCount =
    Number(showHeaderQuickOpen) +
    Number(showHeaderGitToolbar) +
    Number(showHeaderGlobalSearch) +
    Number(showHeaderSummary) +
    (isDesktop ? Number(showHeaderRemoteAccess) + Number(showHeaderAppshot) : 0);

  return (
    <SettingsGroupCard
      id="header"
      open={expanded}
      onOpenChange={onExpandedChange}
      title={t('title')}
      description={t('description')}
      headerEnd={
        <span className="text-xs text-muted-foreground">
          {enabledCount > 0 ? t('enabledCount', { count: enabledCount }) : t('hidden')}
        </span>
      }
    >
          <SettingsToggleRow
            icon={<Command className="size-4" />}
            title={t('quickOpenTitle')}
            description={t('quickOpenDescription')}
            checked={showHeaderQuickOpen}
            onCheckedChange={(value) => void setHeaderShowQuickOpen(value)}
          />
          <SettingsToggleRow
            icon={<GitBranch className="size-4" />}
            title={t('gitToolbarTitle')}
            description={t('gitToolbarDescription')}
            checked={showHeaderGitToolbar}
            onCheckedChange={(value) => void setHeaderShowGitToolbar(value)}
          />
          <SettingsToggleRow
            icon={<Search className="size-4" />}
            title={t('globalSearchTitle')}
            description={t('globalSearchDescription')}
            checked={showHeaderGlobalSearch}
            onCheckedChange={(value) => void setHeaderShowGlobalSearch(value)}
          />
          <SettingsToggleRow
            icon={<PanelTop className="size-4" />}
            title={t('summaryButtonTitle')}
            description={t('summaryButtonDescription')}
            checked={showHeaderSummary}
            onCheckedChange={(value) => void setHeaderShowSummary(value)}
          />
          <SettingsToggleRow
            icon={<ListTodo className="size-4" />}
            title={t('taskTitle')}
            description={t('taskDescription')}
            checked={showHeaderSummaryTask}
            disabled={!showHeaderSummary}
            onCheckedChange={(value) => void setHeaderShowSummaryTask(value)}
          />
          <SettingsToggleRow
            icon={<StickyNote className="size-4" />}
            title={t('noteTitle')}
            description={t('noteDescription')}
            checked={showHeaderSummaryNote}
            disabled={!showHeaderSummary}
            onCheckedChange={(value) => void setHeaderShowSummaryNote(value)}
          />
          <SettingsToggleRow
            icon={<GitCommit className="size-4" />}
            title={t('commitTitle')}
            description={t('commitDescription')}
            checked={showHeaderSummaryCommit}
            disabled={!showHeaderSummary}
            onCheckedChange={(value) => void setHeaderShowSummaryCommit(value)}
          />
          {isDesktop ? (
            <>
              <SettingsToggleRow
                icon={<Globe className="size-4" />}
                title={t('remoteAccessTitle')}
                description={t('remoteAccessDescription')}
                checked={showHeaderRemoteAccess}
                onCheckedChange={(value) => void setHeaderShowRemoteAccess(value)}
              />
              <SettingsToggleRow
                icon={<SquareDashedMousePointer className="size-4" />}
                title={t('appshotTitle')}
                description={t('appshotDescription')}
                checked={showHeaderAppshot}
                onCheckedChange={(value) => void setHeaderShowAppshot(value)}
              />
            </>
          ) : null}
    </SettingsGroupCard>
  );
}
