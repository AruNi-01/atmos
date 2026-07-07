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
  FileDiff,
  GitBranch,
  GitPullRequest,
  Globe,
  PanelRight,
  Play,
  Workflow,
} from 'lucide-react';
import { useLayoutSettingsStore } from '@/features/settings/store/layout-settings-store';

interface RightSidebarLayoutSettingsSectionProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

interface ToggleRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function ToggleRow({ icon, title, description, checked, onCheckedChange }: ToggleRowProps) {
  return (
    <div className="border-b border-border px-2 py-4 last:border-b-0">
      <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
        <div className="flex gap-3">
          <span className="mt-0.5 size-4 shrink-0 text-muted-foreground">{icon}</span>
          <div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center justify-end">
          <Switch checked={checked} onCheckedChange={(value) => onCheckedChange(!!value)} />
        </div>
      </div>
    </div>
  );
}

export function RightSidebarLayoutSettingsSection({
  expanded,
  onExpandedChange,
}: RightSidebarLayoutSettingsSectionProps) {
  const t = useTranslations('settings.rightSidebarLayoutSection');

  const {
    rsShowChanges,
    rsShowReview,
    rsShowBrowser,
    rsShowRun,
    rsShowPr,
    rsShowActions,
    setRightSidebarShowChanges,
    setRightSidebarShowReview,
    setRightSidebarShowBrowser,
    setRightSidebarShowRun,
    setRightSidebarShowPr,
    setRightSidebarShowActions,
  } = useLayoutSettingsStore();

  const enabledCount =
    Number(rsShowChanges) +
    Number(rsShowReview) +
    Number(rsShowBrowser) +
    Number(rsShowRun) +
    Number(rsShowPr) +
    Number(rsShowActions);

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
              <PanelRight className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
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
            icon={<GitBranch className="size-4" />}
            title={t('changesTitle')}
            description={t('changesDescription')}
            checked={rsShowChanges}
            onCheckedChange={(value) => void setRightSidebarShowChanges(value)}
          />
          <ToggleRow
            icon={<FileDiff className="size-4" />}
            title={t('reviewTitle')}
            description={t('reviewDescription')}
            checked={rsShowReview}
            onCheckedChange={(value) => void setRightSidebarShowReview(value)}
          />
          <ToggleRow
            icon={<Globe className="size-4" />}
            title={t('browserTitle')}
            description={t('browserDescription')}
            checked={rsShowBrowser}
            onCheckedChange={(value) => void setRightSidebarShowBrowser(value)}
          />
          <ToggleRow
            icon={<Play className="size-4" />}
            title={t('runTitle')}
            description={t('runDescription')}
            checked={rsShowRun}
            onCheckedChange={(value) => void setRightSidebarShowRun(value)}
          />
          <ToggleRow
            icon={<GitPullRequest className="size-4" />}
            title={t('prTitle')}
            description={t('prDescription')}
            checked={rsShowPr}
            onCheckedChange={(value) => void setRightSidebarShowPr(value)}
          />
          <ToggleRow
            icon={<Workflow className="size-4" />}
            title={t('actionsTitle')}
            description={t('actionsDescription')}
            checked={rsShowActions}
            onCheckedChange={(value) => void setRightSidebarShowActions(value)}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
