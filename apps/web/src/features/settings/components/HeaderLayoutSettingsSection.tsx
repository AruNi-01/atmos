'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Switch,
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
} from 'lucide-react';
import { isTauriRuntime } from '@/shared/lib/desktop-runtime';
import { useLayoutSettingsStore } from '@/features/settings/store/layout-settings-store';

interface HeaderLayoutSettingsSectionProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

interface ToggleRowProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function ToggleRow({ icon, title, description, checked, disabled, onCheckedChange }: ToggleRowProps) {
  return (
    <div className="border-b border-border px-2 py-4 last:border-b-0">
      <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
        <div className={icon ? 'flex gap-3' : undefined}>
          {icon ? <span className="mt-0.5 size-4 shrink-0 text-muted-foreground">{icon}</span> : null}
          <div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center justify-end">
          <Switch
            checked={checked}
            disabled={disabled}
            onCheckedChange={(value) => onCheckedChange(!!value)}
          />
        </div>
      </div>
    </div>
  );
}

export function HeaderLayoutSettingsSection({
  expanded,
  onExpandedChange,
}: HeaderLayoutSettingsSectionProps) {
  const t = useTranslations('settings.headerLayoutSection');
  const isDesktop = React.useMemo(() => isTauriRuntime(), []);

  const {
    showHeaderQuickOpen,
    showHeaderGitToolbar,
    showHeaderGlobalSearch,
    showHeaderSummary,
    showHeaderSummaryTask,
    showHeaderSummaryCommit,
    showHeaderRemoteAccess,
    showHeaderAppshot,
    setHeaderShowQuickOpen,
    setHeaderShowGitToolbar,
    setHeaderShowGlobalSearch,
    setHeaderShowSummary,
    setHeaderShowSummaryTask,
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
          <ToggleRow
            icon={<Command className="size-4" />}
            title={t('quickOpenTitle')}
            description={t('quickOpenDescription')}
            checked={showHeaderQuickOpen}
            onCheckedChange={(value) => void setHeaderShowQuickOpen(value)}
          />
          <ToggleRow
            icon={<GitBranch className="size-4" />}
            title={t('gitToolbarTitle')}
            description={t('gitToolbarDescription')}
            checked={showHeaderGitToolbar}
            onCheckedChange={(value) => void setHeaderShowGitToolbar(value)}
          />
          <ToggleRow
            icon={<Search className="size-4" />}
            title={t('globalSearchTitle')}
            description={t('globalSearchDescription')}
            checked={showHeaderGlobalSearch}
            onCheckedChange={(value) => void setHeaderShowGlobalSearch(value)}
          />
          <ToggleRow
            icon={<PanelTop className="size-4" />}
            title={t('summaryButtonTitle')}
            description={t('summaryButtonDescription')}
            checked={showHeaderSummary}
            onCheckedChange={(value) => void setHeaderShowSummary(value)}
          />
          <ToggleRow
            icon={<ListTodo className="size-4" />}
            title={t('taskTitle')}
            description={t('taskDescription')}
            checked={showHeaderSummaryTask}
            disabled={!showHeaderSummary}
            onCheckedChange={(value) => void setHeaderShowSummaryTask(value)}
          />
          <ToggleRow
            icon={<GitCommit className="size-4" />}
            title={t('commitTitle')}
            description={t('commitDescription')}
            checked={showHeaderSummaryCommit}
            disabled={!showHeaderSummary}
            onCheckedChange={(value) => void setHeaderShowSummaryCommit(value)}
          />
          {isDesktop ? (
            <>
              <ToggleRow
                icon={<Globe className="size-4" />}
                title={t('remoteAccessTitle')}
                description={t('remoteAccessDescription')}
                checked={showHeaderRemoteAccess}
                onCheckedChange={(value) => void setHeaderShowRemoteAccess(value)}
              />
              <ToggleRow
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
