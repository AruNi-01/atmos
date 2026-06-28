'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Switch } from '@workspace/ui';
import { useExperimentSettingsStore } from '@/features/settings/store/experiment-settings-store';

export function ExperimentSettingsSection() {
  const t = useTranslations('settings.experimentSection');
  const {
    managementTerminalsEnabled,
    managementAgentsEnabled,
    automationsEnabled,
    centerWikiTabEnabled,
    loadSettings,
    setManagementTerminalsEnabled,
    setManagementAgentsEnabled,
    setAutomationsEnabled,
    setCenterWikiTabEnabled,
  } = useExperimentSettingsStore();

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8 border-b border-border px-6 py-4">
          <div>
            <p className="text-sm font-medium text-foreground">{t('managementTerminals.title')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('managementTerminals.description')}
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Switch
              checked={managementTerminalsEnabled}
              onCheckedChange={(checked) => void setManagementTerminalsEnabled(checked)}
            />
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8 border-b border-border px-6 py-4">
          <div>
            <p className="text-sm font-medium text-foreground">{t('managementAgents.title')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('managementAgents.description')}
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Switch
              checked={managementAgentsEnabled}
              onCheckedChange={(checked) => void setManagementAgentsEnabled(checked)}
            />
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8 border-b border-border px-6 py-4">
          <div>
            <p className="text-sm font-medium text-foreground">{t('automations.title')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('automations.description')}
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Switch
              checked={automationsEnabled}
              onCheckedChange={(checked) => void setAutomationsEnabled(checked)}
            />
          </div>
        </div>
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
