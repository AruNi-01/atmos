'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Switch } from '@workspace/ui';
import { useExperimentSettingsStore } from '@/features/settings/store/experiment-settings-store';
import {
  SettingsGroup,
  SettingsSection,
} from '@/features/settings/components/settings/SettingsGroupCard';
import { SettingsToggleRow } from '@/features/settings/components/settings/SettingsToggleRow';

export function ExperimentSettingsSection() {
  const t = useTranslations('settings.experimentSection');
  const pageT = useTranslations('settings.modal');
  const {
    centerWikiTabEnabled,
    loadSettings,
    setCenterWikiTabEnabled,
  } = useExperimentSettingsStore();

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <SettingsSection
      id="experiments"
      title={pageT('sections.experiments.label')}
      description={pageT('sections.experiments.description')}
    >
      <SettingsGroup>
        <SettingsToggleRow
          title={t('centerWikiTab.title')}
          description={t('centerWikiTab.description')}
          checked={centerWikiTabEnabled}
          onCheckedChange={(checked) => void setCenterWikiTabEnabled(checked)}
        />
      </SettingsGroup>
    </SettingsSection>
  );
}
