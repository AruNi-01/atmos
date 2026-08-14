'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useQueryState } from 'nuqs';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Switch,
  cn,
} from '@workspace/ui';
import { ChevronDown, Columns2, PanelBottom } from 'lucide-react';
import { useExperimentSettingsStore } from '@/features/settings/store/experiment-settings-store';
import { useLayoutSettingsStore } from '@/features/settings/store/layout-settings-store';
import { settingsModalParams } from '@/shared/lib/nuqs/searchParams';
import { HeaderLayoutSettingsSection } from '@/features/settings/components/HeaderLayoutSettingsSection';
import { RightSidebarLayoutSettingsSection } from '@/features/settings/components/RightSidebarLayoutSettingsSection';
import { LaunchpadLayoutSettings } from '@/features/settings/components/LaunchpadLayoutSettings';

export function LayoutSettingsSection() {
  const t = useTranslations('settings.layoutSection');
  const {
    projectFilesSide,
    workspaceSidebarTwoColumn,
    workspaceSidebarTwoColumnShowPinned,
    workspaceSidebarSecondColumnKanban,
    workspaceSidebarTimeTwoColumn,
    workspaceSidebarStatusTwoColumn,
    workspaceSidebarPriorityTwoColumn,
    workspaceSidebarLabelTwoColumn,
    workspaceSidebarGroupTwoColumn,
    workspaceSidebarAgentTwoColumn,
    showWsConnection,
    showLocalServices,
    showUsageCarousel,
    showAgentStatus,
    loadSettings,
    setProjectFilesSide,
    setWorkspaceSidebarTwoColumn,
    setWorkspaceSidebarTwoColumnShowPinned,
    setWorkspaceSidebarSecondColumnKanban,
    setWorkspaceSidebarTimeTwoColumn,
    setWorkspaceSidebarStatusTwoColumn,
    setWorkspaceSidebarPriorityTwoColumn,
    setWorkspaceSidebarLabelTwoColumn,
    setWorkspaceSidebarGroupTwoColumn,
    setWorkspaceSidebarAgentTwoColumn,
    setFooterShowWsConnection,
    setFooterShowLocalServices,
    setFooterShowUsageCarousel,
    setFooterShowAgentStatus,
  } = useLayoutSettingsStore();
  const launchpadAgentsEnabled = useExperimentSettingsStore((state) => state.launchpadAgentsEnabled);
  const loadExperimentSettings = useExperimentSettingsStore((state) => state.loadSettings);
  const [, setActiveSettingTab] = useQueryState('activeSettingTab', settingsModalParams.activeSettingTab);
  const [workspaceSidebarLayoutExpanded, setWorkspaceSidebarLayoutExpanded] = React.useState(false);
  const [launchpadExpanded, setLaunchpadExpanded] = React.useState(false);
  const [headerLayoutExpanded, setHeaderLayoutExpanded] = React.useState(false);
  const [rightSidebarLayoutExpanded, setRightSidebarLayoutExpanded] = React.useState(false);
  const [footerLayoutExpanded, setFooterLayoutExpanded] = React.useState(false);
  const isAnyTwoColumnEnabled =
    workspaceSidebarTwoColumn ||
    workspaceSidebarTimeTwoColumn ||
    workspaceSidebarStatusTwoColumn ||
    workspaceSidebarPriorityTwoColumn ||
    workspaceSidebarLabelTwoColumn ||
    workspaceSidebarGroupTwoColumn ||
    workspaceSidebarAgentTwoColumn;
  const footerEnabledCount =
    Number(showWsConnection) + Number(showLocalServices) + Number(showUsageCarousel) + Number(showAgentStatus);

  React.useEffect(() => {
    loadSettings();
    void loadExperimentSettings();
  }, [loadSettings, loadExperimentSettings]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
          <div>
            <p className="text-base font-medium text-foreground">{t('projectFilesSide.title')}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t('projectFilesSide.description')}
            </p>
          </div>
          <div className="flex items-center justify-end">
            <div className="inline-flex h-9 items-center rounded-lg border border-border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setProjectFilesSide('left')}
                className={cn(
                  'h-full rounded-md px-3 text-sm font-medium transition-colors',
                  projectFilesSide === 'left'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('projectFilesSide.left')}
              </button>
              <button
                type="button"
                onClick={() => setProjectFilesSide('right')}
                className={cn(
                  'h-full rounded-md px-3 text-sm font-medium transition-colors',
                  projectFilesSide === 'right'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('projectFilesSide.right')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <LaunchpadLayoutSettings
        expanded={launchpadExpanded}
        onExpandedChange={setLaunchpadExpanded}
      />

      <Collapsible
        open={workspaceSidebarLayoutExpanded}
        onOpenChange={setWorkspaceSidebarLayoutExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 size-5 shrink-0">
                <Columns2 className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-medium text-foreground">{t('workspaceSidebar.title')}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t('workspaceSidebar.description')}
                </p>
              </div>
            </div>
          </CollapsibleTrigger>
          <div className="pt-1 text-xs text-muted-foreground">
            {isAnyTwoColumnEnabled
              ? t('workspaceSidebar.enabled')
              : t('workspaceSidebar.disabled')}
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t border-border px-4">
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-base font-medium text-foreground">{t('workspaceSidebar.projectTwoColumnTitle')}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t('workspaceSidebar.projectTwoColumnDescription')}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={workspaceSidebarTwoColumn}
                    onCheckedChange={(checked) => void setWorkspaceSidebarTwoColumn(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-base font-medium text-foreground">{t('workspaceSidebar.showPinnedTitle')}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t('workspaceSidebar.showPinnedDescription')}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={workspaceSidebarTwoColumnShowPinned}
                    disabled={!workspaceSidebarTwoColumn}
                    onCheckedChange={(checked) => void setWorkspaceSidebarTwoColumnShowPinned(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-base font-medium text-foreground">{t('workspaceSidebar.kanbanTitle')}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t('workspaceSidebar.kanbanDescription')}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={workspaceSidebarSecondColumnKanban}
                    disabled={!isAnyTwoColumnEnabled}
                    onCheckedChange={(checked) => void setWorkspaceSidebarSecondColumnKanban(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-base font-medium text-foreground">{t('workspaceSidebar.byTimeTitle')}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t('workspaceSidebar.byTimeDescription')}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={workspaceSidebarTimeTwoColumn}
                    onCheckedChange={(checked) => void setWorkspaceSidebarTimeTwoColumn(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-base font-medium text-foreground">{t('workspaceSidebar.byStatusTitle')}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t('workspaceSidebar.byStatusDescription')}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={workspaceSidebarStatusTwoColumn}
                    onCheckedChange={(checked) => void setWorkspaceSidebarStatusTwoColumn(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-base font-medium text-foreground">{t('workspaceSidebar.byPriorityTitle')}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t('workspaceSidebar.byPriorityDescription')}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={workspaceSidebarPriorityTwoColumn}
                    onCheckedChange={(checked) => void setWorkspaceSidebarPriorityTwoColumn(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-base font-medium text-foreground">{t('workspaceSidebar.byLabelTitle')}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t('workspaceSidebar.byLabelDescription')}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={workspaceSidebarLabelTwoColumn}
                    onCheckedChange={(checked) => void setWorkspaceSidebarLabelTwoColumn(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-base font-medium text-foreground">{t('workspaceSidebar.byGroupTitle')}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t('workspaceSidebar.byGroupDescription')}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={workspaceSidebarGroupTwoColumn}
                    onCheckedChange={(checked) => void setWorkspaceSidebarGroupTwoColumn(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="px-2 py-4">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-base font-medium text-foreground">{t('workspaceSidebar.byAgentTitle')}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t('workspaceSidebar.byAgentDescription')}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={workspaceSidebarAgentTwoColumn}
                    onCheckedChange={(checked) => void setWorkspaceSidebarAgentTwoColumn(!!checked)}
                  />
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <HeaderLayoutSettingsSection
        expanded={headerLayoutExpanded}
        onExpandedChange={setHeaderLayoutExpanded}
      />

      <RightSidebarLayoutSettingsSection
        expanded={rightSidebarLayoutExpanded}
        onExpandedChange={setRightSidebarLayoutExpanded}
      />

      <Collapsible
        open={footerLayoutExpanded}
        onOpenChange={setFooterLayoutExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 size-5 shrink-0">
                <PanelBottom className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-medium text-foreground">{t('footer.title')}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t('footer.description')}
                </p>
              </div>
            </div>
          </CollapsibleTrigger>
          <div className="pt-1 text-xs text-muted-foreground">
            {footerEnabledCount > 0
              ? t('footer.enabledCount', { count: footerEnabledCount })
              : t('footer.hidden')}
          </div>
        </div>
        <CollapsibleContent>
          <div className="border-t border-border px-4">
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('footer.wsConnectionTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('footer.wsConnectionDescription')}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={showWsConnection}
                    onCheckedChange={(checked) => void setFooterShowWsConnection(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('footer.localServicesTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('footer.localServicesDescription')}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={showLocalServices}
                    onCheckedChange={(checked) => void setFooterShowLocalServices(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('footer.usageCarouselTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('footer.usageCarouselDescription')}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={showUsageCarousel}
                    onCheckedChange={(checked) => void setFooterShowUsageCarousel(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('footer.agentStatusTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('footer.agentStatusDescriptionPrefix')}{' '}
                    <button
                      type="button"
                      className="text-foreground underline underline-offset-2 hover:text-foreground/80"
                      onClick={() => void setActiveSettingTab('code-agent')}
                    >
                      {t('footer.codeAgent')}
                    </button>{' '}
                    {t('footer.agentStatusDescriptionSuffix')}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <Switch
                    checked={showAgentStatus}
                    onCheckedChange={(checked) => void setFooterShowAgentStatus(!!checked)}
                  />
                </div>
              </div>
            </div>
            <div className="px-2 py-4">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('footer.acpChatTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('footer.acpChatDescription')}
                  </p>
                </div>
                <div className="flex flex-col items-end justify-center gap-2 text-right">
                  <span className="text-xs text-muted-foreground">
                    {launchpadAgentsEnabled
                      ? t('footer.enabledInLayout')
                      : t('footer.disabledInLayout')}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => void setActiveSettingTab('layout')}
                  >
                    {t('footer.openLayout')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
