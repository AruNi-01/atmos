'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Switch,
  TabsSubtle,
  TabsSubtleItem,
  cn,
} from '@workspace/ui';
import { ChevronDown, Layers, LayoutGrid, List } from 'lucide-react';
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

/** Tab order: Outside (list below MC) → Inside (grid cards). */
const PLACEMENT_ORDER: ManagementCenterPlacement[] = ['outside', 'inside'];

function placementIndex(placement: ManagementCenterPlacement): number {
  return PLACEMENT_ORDER.indexOf(placement);
}

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
        <div className="border-t border-border px-6 py-5">
          <div className="overflow-hidden rounded-2xl border border-border">
            {MANAGEMENT_CENTER_ITEM_IDS.map((id, index) => {
              const config = managementCenterItems[id];
              const isLast = index === MANAGEMENT_CENTER_ITEM_IDS.length - 1;
              const experimental = EXPERIMENTAL_MANAGEMENT_CENTER_ITEM_IDS.has(id);
              const labelId = `mgmt-item-${id}`;

              return (
                <div
                  key={id}
                  className={cn(
                    'flex items-center gap-4 px-6 py-4',
                    !isLast && 'border-b border-border',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        id={labelId}
                        className="text-sm font-medium text-foreground"
                      >
                        {t(`${ITEM_I18N_KEYS[id]}.title`)}
                      </p>
                      {experimental ? (
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-medium tracking-wide"
                        >
                          {t('experimentalBadge')}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(`${ITEM_I18N_KEYS[id]}.description`)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {/* Placement chooser only when the entry is enabled */}
                    {config.enabled ? (
                      <TabsSubtle
                        idPrefix={`mgmt-placement-${id}`}
                        activeLabel
                        selectedIndex={placementIndex(config.placement)}
                        onSelect={(nextIndex) => {
                          const nextPlacement = PLACEMENT_ORDER[nextIndex];
                          if (!nextPlacement || nextPlacement === config.placement) return;
                          void setManagementCenterItemEnabled(id, nextPlacement, true);
                        }}
                        className="justify-end"
                      >
                        <TabsSubtleItem
                          index={0}
                          icon={List}
                          label={t('tabs.outside')}
                        />
                        <TabsSubtleItem
                          index={1}
                          icon={LayoutGrid}
                          label={t('tabs.inside')}
                        />
                      </TabsSubtle>
                    ) : null}

                    <Switch
                      aria-labelledby={labelId}
                      checked={config.enabled}
                      onCheckedChange={(next) =>
                        void setManagementCenterItemEnabled(
                          id,
                          config.placement,
                          next,
                        )
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
