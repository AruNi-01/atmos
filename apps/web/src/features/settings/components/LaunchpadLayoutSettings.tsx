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
} from '@workspace/ui';
import {
  Bot,
  ChartColumnBig,
  ChevronDown,
  FolderKanban,
  HardDrive,
  LayoutTemplate,
  LayoutGrid,
  List,
  ListTodo,
  Plus,
  Presentation,
  Puzzle,
  Rocket,
  SquareTerminal,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import {
  LAUNCHPAD_ITEM_IDS,
  type LaunchpadItemId,
  type LaunchpadPlacement,
  useExperimentSettingsStore,
} from '@/features/settings/store/experiment-settings-store';

/** Items that remain experimental feature flags — shown with a badge in layout settings. */
export const EXPERIMENTAL_LAUNCHPAD_ITEM_IDS = new Set<LaunchpadItemId>([
  'terminals',
  'agents',
  'automations',
]);

const ITEM_I18N_KEYS: Record<LaunchpadItemId, string> = {
  workspaces: 'items.workspaces',
  skills: 'items.skills',
  terminals: 'items.terminals',
  agents: 'items.agents',
  automations: 'items.automations',
  'disk-analyzer': 'items.diskAnalyzer',
  'token-usage': 'items.tokenUsage',
  canvas: 'items.canvas',
  'pt-design': 'items.ptDesign',
  tasks: 'items.tasks',
  'new-workspace': 'items.newWorkspace',
};

/** Icons match LeftSidebarLaunchpad item definitions. */
const ITEM_ICONS: Record<LaunchpadItemId, LucideIcon> = {
  workspaces: FolderKanban,
  skills: Puzzle,
  terminals: SquareTerminal,
  agents: Bot,
  automations: Timer,
  'disk-analyzer': HardDrive,
  'token-usage': ChartColumnBig,
  canvas: Presentation,
  'pt-design': LayoutTemplate,
  tasks: ListTodo,
  'new-workspace': Plus,
};

/** Tab order: Outside (list below Launchpad) → Inside (grid cards). */
const PLACEMENT_ORDER: LaunchpadPlacement[] = ['outside', 'inside'];

function placementIndex(placement: LaunchpadPlacement): number {
  return PLACEMENT_ORDER.indexOf(placement);
}

export function LaunchpadLayoutSettings({
  expanded,
  onExpandedChange,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const t = useTranslations('settings.layoutSection.launchpad');
  const {
    launchpadItems,
    loadSettings,
    setLaunchpadItemEnabled,
  } = useExperimentSettingsStore();

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const enabledCount = LAUNCHPAD_ITEM_IDS.filter(
    (id) => launchpadItems[id].enabled,
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
              <Rocket className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
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
        <div className="border-t border-border px-4">
          {LAUNCHPAD_ITEM_IDS.map((id) => {
            const config = launchpadItems[id];
            const experimental = EXPERIMENTAL_LAUNCHPAD_ITEM_IDS.has(id);
            const labelId = `launchpad-item-${id}`;
            const Icon = ITEM_ICONS[id];

            return (
              <div
                key={id}
                className="border-b border-border px-2 py-4 last:border-b-0"
              >
                <div className="flex items-center gap-4">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <span className="mt-0.5 size-4 shrink-0 text-muted-foreground">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
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
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {/* Placement chooser only when the entry is enabled */}
                    {config.enabled ? (
                      <TabsSubtle
                        idPrefix={`launchpad-placement-${id}`}
                        activeLabel
                        selectedIndex={placementIndex(config.placement)}
                        onSelect={(nextIndex) => {
                          const nextPlacement = PLACEMENT_ORDER[nextIndex];
                          if (!nextPlacement || nextPlacement === config.placement) return;
                          void setLaunchpadItemEnabled(id, nextPlacement, true);
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
                        void setLaunchpadItemEnabled(
                          id,
                          config.placement,
                          next,
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
