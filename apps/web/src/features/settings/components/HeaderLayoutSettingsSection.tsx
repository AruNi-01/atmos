'use client';

import { useTranslations } from 'next-intl';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Switch,
} from '@workspace/ui';
import { ChevronDown, GitCommit, ListTodo, PanelTop, StickyNote } from 'lucide-react';

interface HeaderLayoutSettingsSectionProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  showHeaderSummary: boolean;
  showHeaderSummaryTask: boolean;
  showHeaderSummaryNote: boolean;
  showHeaderSummaryCommit: boolean;
  setHeaderShowSummary: (value: boolean) => Promise<void>;
  setHeaderShowSummaryTask: (value: boolean) => Promise<void>;
  setHeaderShowSummaryNote: (value: boolean) => Promise<void>;
  setHeaderShowSummaryCommit: (value: boolean) => Promise<void>;
}

export function HeaderLayoutSettingsSection({
  expanded,
  onExpandedChange,
  showHeaderSummary,
  showHeaderSummaryTask,
  showHeaderSummaryNote,
  showHeaderSummaryCommit,
  setHeaderShowSummary,
  setHeaderShowSummaryTask,
  setHeaderShowSummaryNote,
  setHeaderShowSummaryCommit,
}: HeaderLayoutSettingsSectionProps) {
  const t = useTranslations('settings.headerLayoutSection');
  const enabledCount =
    Number(showHeaderSummaryTask) +
    Number(showHeaderSummaryNote) +
    Number(showHeaderSummaryCommit);

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
          {showHeaderSummary ? t('enabledCount', { count: enabledCount }) : t('hidden')}
        </div>
      </div>

      <CollapsibleContent>
        <div className="border-t border-border px-4">
          <div className="border-b border-border px-2 py-4 last:border-b-0">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
              <div>
                <p className="text-sm font-medium text-foreground">{t('summaryButtonTitle')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('summaryButtonDescription')}
                </p>
              </div>
              <div className="flex items-center justify-end">
                <Switch
                  checked={showHeaderSummary}
                  onCheckedChange={(checked) => void setHeaderShowSummary(!!checked)}
                />
              </div>
            </div>
          </div>
          <div className="border-b border-border px-2 py-4 last:border-b-0">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
              <div className="flex gap-3">
                <ListTodo className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">{t('taskTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('taskDescription')}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end">
                <Switch
                  checked={showHeaderSummaryTask}
                  disabled={!showHeaderSummary}
                  onCheckedChange={(checked) => void setHeaderShowSummaryTask(!!checked)}
                />
              </div>
            </div>
          </div>
          <div className="border-b border-border px-2 py-4 last:border-b-0">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
              <div className="flex gap-3">
                <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">{t('noteTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('noteDescription')}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end">
                <Switch
                  checked={showHeaderSummaryNote}
                  disabled={!showHeaderSummary}
                  onCheckedChange={(checked) => void setHeaderShowSummaryNote(!!checked)}
                />
              </div>
            </div>
          </div>
          <div className="px-2 py-4">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
              <div className="flex gap-3">
                <GitCommit className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">{t('commitTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('commitDescription')}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end">
                <Switch
                  checked={showHeaderSummaryCommit}
                  disabled={!showHeaderSummary}
                  onCheckedChange={(checked) => void setHeaderShowSummaryCommit(!!checked)}
                />
              </div>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
