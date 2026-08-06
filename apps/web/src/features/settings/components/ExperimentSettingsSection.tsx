'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@workspace/ui';
import {
  MANAGEMENT_CENTER_ITEM_IDS,
  type ManagementCenterItemId,
  type ManagementCenterPlacement,
  useExperimentSettingsStore,
} from '@/features/settings/store/experiment-settings-store';

const ITEM_I18N_KEYS: Record<ManagementCenterItemId, string> = {
  workspaces: 'items.workspaces',
  skills: 'items.skills',
  terminals: 'items.terminals',
  agents: 'items.agents',
  automations: 'items.automations',
  'disk-analyzer': 'items.diskAnalyzer',
  canvas: 'items.canvas',
  kanban: 'items.kanban',
  'new-workspace': 'items.newWorkspace',
};

export function ExperimentSettingsSection() {
  const t = useTranslations('settings.experimentSection');
  const {
    managementCenterItems,
    centerWikiTabEnabled,
    loadSettings,
    setManagementCenterItemEnabled,
    setCenterWikiTabEnabled,
  } = useExperimentSettingsStore();

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const renderItemRows = (placement: ManagementCenterPlacement) => (
    <div className="overflow-hidden rounded-2xl border border-border">
      {MANAGEMENT_CENTER_ITEM_IDS.map((id, index) => {
        const config = managementCenterItems[id];
        const checked = config.enabled && config.placement === placement;
        const isLast = index === MANAGEMENT_CENTER_ITEM_IDS.length - 1;
        return (
          <div
            key={`${placement}-${id}`}
            className={`grid grid-cols-[minmax(0,1fr)_100px] gap-8 px-6 py-4 ${
              isLast ? '' : 'border-b border-border'
            }`}
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                {t(`${ITEM_I18N_KEYS[id]}.title`)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`${ITEM_I18N_KEYS[id]}.description`)}
              </p>
            </div>
            <div className="flex items-center justify-end">
              <Switch
                checked={checked}
                onCheckedChange={(next) =>
                  void setManagementCenterItemEnabled(id, placement, next)
                }
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{t('managementCenter.title')}</p>
        <p className="text-xs text-muted-foreground">{t('managementCenter.description')}</p>
      </div>

      <Tabs defaultValue="inside" className="flex flex-col space-y-4">
        <TabsList className="grid h-12 w-full shrink-0 grid-cols-2 rounded-lg border border-border/70 bg-muted/30 p-1">
          <TabsTrigger value="outside" className="rounded-md text-sm">
            {t('managementCenter.tabs.outside')}
          </TabsTrigger>
          <TabsTrigger value="inside" className="rounded-md text-sm">
            {t('managementCenter.tabs.inside')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outside" className="mt-0">
          <p className="mb-3 text-xs text-muted-foreground">
            {t('managementCenter.outsideHint')}
          </p>
          {renderItemRows('outside')}
        </TabsContent>

        <TabsContent value="inside" className="mt-0">
          <p className="mb-3 text-xs text-muted-foreground">
            {t('managementCenter.insideHint')}
          </p>
          {renderItemRows('inside')}
        </TabsContent>
      </Tabs>

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
