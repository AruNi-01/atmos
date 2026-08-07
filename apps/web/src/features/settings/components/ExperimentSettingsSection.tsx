'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Switch } from '@workspace/ui';
import { useExperimentSettingsStore } from '@/features/settings/store/experiment-settings-store';

export function ExperimentSettingsSection() {
  const t = useTranslations('settings.experimentSection');
  const {
    centerWikiTabEnabled,
    loadSettings,
    setCenterWikiTabEnabled,
  } = useExperimentSettingsStore();

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8 px-6 py-4">
          <div>
            <p className="text-sm font-medium text-foreground">{t('centerWikiTab.title')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('centerWikiTab.description')}
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Switch
              checked={centerWikiTabEnabled}
              onCheckedChange={(checked) => void setCenterWikiTabEnabled(checked)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
