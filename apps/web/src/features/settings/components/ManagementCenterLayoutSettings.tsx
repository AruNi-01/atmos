'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@workspace/ui';
import { ChevronDown, Layers } from 'lucide-react';
import {
  MANAGEMENT_CENTER_ITEM_IDS,
  type ManagementCenterItemId,
  type ManagementCenterPlacement,
  useExperimentSettingsStore,
} from '@/features/settings/store/experiment-settings-store';

/** Items that remain experimental feature flags — shown with a badge in layout settings. */
export const EXPERIMENTAL_MANAGEMENT_CENTER_ITEM_IDS = new Set<ManagementCenterItemId>([
  'terminals',
  'agents',
  'automations',
]);

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

export function ManagementCenterLayoutSettings({
  expanded,
  onExpandedChange,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const t = useTranslations('settings.layoutSection.managementCenter');
  const {
    managementCenterItems,
    loadSettings,
    setManagementCenterItemEnabled,
  } = useExperimentSettingsStore();

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const enabledCount = MANAGEMENT_CENTER_ITEM_IDS.filter(
    (id) => managementCenterItems[id].enabled,
  ).length;

  const renderItemRows = (placement: ManagementCenterPlacement) => (
    <div className="overflow-hidden rounded-2xl border border-border">
      {MANAGEMENT_CENTER_ITEM_IDS.map((id, index) => {
        const config = managementCenterItems[id];
        const checked = config.enabled && config.placement === placement;
        const isLast = index === MANAGEMENT_CENTER_ITEM_IDS.length - 1;
        const experimental = EXPERIMENTAL_MANAGEMENT_CENTER_ITEM_IDS.has(id);
        return (
          <div
            key={`${placement}-${id}`}
            className={cn(
              'grid grid-cols-[minmax(0,1fr)_100px] gap-8 px-6 py-4',
              !isLast && 'border-b border-border',
            )}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p
                  id={`mgmt-item-${placement}-${id}`}
                  className="text-sm font-medium text-foreground"
                >
                  {t(`${ITEM_I18N_KEYS[id]}.title`)}
                </p>
                {experimental ? (
                  <Badge variant="secondary" className="text-[10px] font-medium uppercase tracking-wide">
                    {t('experimentalBadge')}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`${ITEM_I18N_KEYS[id]}.description`)}
              </p>
            </div>
            <div className="flex items-center justify-end">
              <Switch
                aria-labelledby={`mgmt-item-${placement}-${id}`}
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
    <Collapsible
      open={expanded}
      onOpenChange={onExpandedChange}
      className="overflow-hidden rounded-2xl border border-border"
    >
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 size-5 shrink-0">
              <Layers className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
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
          {enabledCount > 0
            ? t('enabledCount', { count: enabledCount })
            : t('allHidden')}
        </div>
      </div>

      <CollapsibleContent>
        <div className="space-y-4 border-t border-border px-6 py-5">
          <Tabs defaultValue="inside" className="flex flex-col space-y-4">
            <TabsList className="grid h-12 w-full shrink-0 grid-cols-2 rounded-lg border border-border/70 bg-muted/30 p-1">
              <TabsTrigger value="outside" className="rounded-md text-sm">
                {t('tabs.outside')}
              </TabsTrigger>
              <TabsTrigger value="inside" className="rounded-md text-sm">
                {t('tabs.inside')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="outside" className="mt-0">
              <p className="mb-3 text-xs text-muted-foreground">{t('outsideHint')}</p>
              {renderItemRows('outside')}
            </TabsContent>

            <TabsContent value="inside" className="mt-0">
              <p className="mb-3 text-xs text-muted-foreground">{t('insideHint')}</p>
              {renderItemRows('inside')}
            </TabsContent>
          </Tabs>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
