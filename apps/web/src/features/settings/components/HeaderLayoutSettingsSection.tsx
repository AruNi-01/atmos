'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui';
import {
  ChevronDown,
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
    <Collapsible
      open={expanded}
      onOpenChange={onExpandedChange}
      className="overflow-hidden rounded-2xl border border-border"
    >
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 size-5 shrink-0">
              <PanelTop className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
              <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">{t('title')}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('description')}
              </p>
            </div>
          </div>
        </CollapsibleTrigger>
        <div className="pt-1 text-xs text-muted-foreground">
          {enabledCount > 0 ? t('enabledCount', { count: enabledCount }) : t('hidden')}
        </div>
      </div>

      <CollapsibleContent>
        <div className="border-t border-border px-4">
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
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
