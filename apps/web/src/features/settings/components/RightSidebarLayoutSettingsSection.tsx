'use client';

import { useTranslations } from 'next-intl';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui';
import {
  ChevronDown,
  FileDiff,
  GitBranch,
  Github,
  Globe,
  PanelRight,
  Play,
} from 'lucide-react';
import { useLayoutSettingsStore } from '@/features/settings/store/layout-settings-store';
import { SettingsToggleRow } from '@/features/settings/components/settings/SettingsToggleRow';

interface RightSidebarLayoutSettingsSectionProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
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
    rsShowGithub,
    setRightSidebarShowChanges,
    setRightSidebarShowReview,
    setRightSidebarShowBrowser,
    setRightSidebarShowRun,
    setRightSidebarShowGithub,
  } = useLayoutSettingsStore();

  const enabledCount =
    Number(rsShowChanges) +
    Number(rsShowReview) +
    Number(rsShowBrowser) +
    Number(rsShowRun) +
    Number(rsShowGithub);

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
          <SettingsToggleRow
            icon={<GitBranch className="size-4" />}
            title={t('changesTitle')}
            description={t('changesDescription')}
            checked={rsShowChanges}
            onCheckedChange={(value) => void setRightSidebarShowChanges(value)}
          />
          <SettingsToggleRow
            icon={<FileDiff className="size-4" />}
            title={t('reviewTitle')}
            description={t('reviewDescription')}
            checked={rsShowReview}
            onCheckedChange={(value) => void setRightSidebarShowReview(value)}
          />
          <SettingsToggleRow
            icon={<Globe className="size-4" />}
            title={t('browserTitle')}
            description={t('browserDescription')}
            checked={rsShowBrowser}
            onCheckedChange={(value) => void setRightSidebarShowBrowser(value)}
          />
          <SettingsToggleRow
            icon={<Play className="size-4" />}
            title={t('runTitle')}
            description={t('runDescription')}
            checked={rsShowRun}
            onCheckedChange={(value) => void setRightSidebarShowRun(value)}
          />
          <SettingsToggleRow
            icon={<Github className="size-4" />}
            title={t('githubTitle')}
            description={t('githubDescription')}
            checked={rsShowGithub}
            onCheckedChange={(value) => void setRightSidebarShowGithub(value)}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
