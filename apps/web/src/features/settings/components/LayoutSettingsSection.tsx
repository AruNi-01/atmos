'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useQueryState } from 'nuqs';
import { Button, Switch } from '@workspace/ui';
import { useExperimentSettingsStore } from '@/features/settings/store/experiment-settings-store';
import { useLayoutSettingsStore } from '@/features/settings/store/layout-settings-store';
import { settingsModalParams } from '@/shared/lib/nuqs/searchParams';
import { HeaderLayoutSettingsSection } from '@/features/settings/components/HeaderLayoutSettingsSection';
import { LaunchpadLayoutSettings } from '@/features/settings/components/LaunchpadLayoutSettings';
import {
  SettingsGroupCard,
  SettingsGroupRow,
  SettingsPageStack,
} from '@/features/settings/components/settings/SettingsGroupCard';
import { SettingsToggleRow } from '@/features/settings/components/settings/SettingsToggleRow';

export function LayoutSettingsSection() {
  const t = useTranslations('settings.layoutSection');
  const {
    workspaceSidebarTwoColumn,
    workspaceSidebarTwoColumnShowPinned,
    workspaceSidebarSecondColumnKanban,
    workspaceSidebarTimeTwoColumn,
    workspaceSidebarStatusTwoColumn,
    workspaceSidebarPriorityTwoColumn,
    workspaceSidebarLabelTwoColumn,
    workspaceSidebarGroupTwoColumn,
    workspaceSidebarAgentTwoColumn,
    showLocalServices,
    showResourceMonitor,
    showUsageCarousel,
    showAgentStatus,
    loadSettings,

    setWorkspaceSidebarTwoColumn,
    setWorkspaceSidebarTwoColumnShowPinned,
    setWorkspaceSidebarSecondColumnKanban,
    setWorkspaceSidebarTimeTwoColumn,
    setWorkspaceSidebarStatusTwoColumn,
    setWorkspaceSidebarPriorityTwoColumn,
    setWorkspaceSidebarLabelTwoColumn,
    setWorkspaceSidebarGroupTwoColumn,
    setWorkspaceSidebarAgentTwoColumn,
    setFooterShowLocalServices,
    setFooterShowResourceMonitor,
    setFooterShowUsageCarousel,
    setFooterShowAgentStatus,
  } = useLayoutSettingsStore();
  const launchpadAgentsEnabled = useExperimentSettingsStore((state) => state.launchpadAgentsEnabled);
  const loadExperimentSettings = useExperimentSettingsStore((state) => state.loadSettings);
  const [, setActiveSettingTab] = useQueryState('activeSettingTab', settingsModalParams.activeSettingTab);
  const [workspaceSidebarLayoutExpanded, setWorkspaceSidebarLayoutExpanded] = React.useState(true);
  const [launchpadExpanded, setLaunchpadExpanded] = React.useState(true);
  const [headerLayoutExpanded, setHeaderLayoutExpanded] = React.useState(true);
  const [footerLayoutExpanded, setFooterLayoutExpanded] = React.useState(true);
  const isAnyTwoColumnEnabled =
    workspaceSidebarTwoColumn ||
    workspaceSidebarTimeTwoColumn ||
    workspaceSidebarStatusTwoColumn ||
    workspaceSidebarPriorityTwoColumn ||
    workspaceSidebarLabelTwoColumn ||
    workspaceSidebarGroupTwoColumn ||
    workspaceSidebarAgentTwoColumn;
  const footerEnabledCount =
    Number(showResourceMonitor) +
    Number(showLocalServices) +
    Number(showUsageCarousel) +
    Number(showAgentStatus);

  React.useEffect(() => {
    loadSettings();
    void loadExperimentSettings();
  }, [loadSettings, loadExperimentSettings]);

  return (
    <SettingsPageStack>
      <LaunchpadLayoutSettings
        expanded={launchpadExpanded}
        onExpandedChange={setLaunchpadExpanded}
      />

      <SettingsGroupCard
        id="sidebar"
        open={workspaceSidebarLayoutExpanded}
        onOpenChange={setWorkspaceSidebarLayoutExpanded}
        title={t('workspaceSidebar.title')}
        description={t('workspaceSidebar.description')}
        headerEnd={
          <span className="text-xs text-muted-foreground">
            {isAnyTwoColumnEnabled
              ? t('workspaceSidebar.enabled')
              : t('workspaceSidebar.disabled')}
          </span>
        }
      >
        <SettingsToggleRow
          title={t('workspaceSidebar.projectTwoColumnTitle')}
          description={t('workspaceSidebar.projectTwoColumnDescription')}
          checked={workspaceSidebarTwoColumn}
          onCheckedChange={(checked) => void setWorkspaceSidebarTwoColumn(checked)}
        />
        <SettingsToggleRow
          title={t('workspaceSidebar.showPinnedTitle')}
          description={t('workspaceSidebar.showPinnedDescription')}
          checked={workspaceSidebarTwoColumnShowPinned}
          disabled={!workspaceSidebarTwoColumn}
          onCheckedChange={(checked) => void setWorkspaceSidebarTwoColumnShowPinned(checked)}
        />
        <SettingsToggleRow
          title={t('workspaceSidebar.kanbanTitle')}
          description={t('workspaceSidebar.kanbanDescription')}
          checked={workspaceSidebarSecondColumnKanban}
          disabled={!isAnyTwoColumnEnabled}
          onCheckedChange={(checked) => void setWorkspaceSidebarSecondColumnKanban(checked)}
        />
        <SettingsToggleRow
          title={t('workspaceSidebar.byTimeTitle')}
          description={t('workspaceSidebar.byTimeDescription')}
          checked={workspaceSidebarTimeTwoColumn}
          onCheckedChange={(checked) => void setWorkspaceSidebarTimeTwoColumn(checked)}
        />
        <SettingsToggleRow
          title={t('workspaceSidebar.byStatusTitle')}
          description={t('workspaceSidebar.byStatusDescription')}
          checked={workspaceSidebarStatusTwoColumn}
          onCheckedChange={(checked) => void setWorkspaceSidebarStatusTwoColumn(checked)}
        />
        <SettingsToggleRow
          title={t('workspaceSidebar.byPriorityTitle')}
          description={t('workspaceSidebar.byPriorityDescription')}
          checked={workspaceSidebarPriorityTwoColumn}
          onCheckedChange={(checked) => void setWorkspaceSidebarPriorityTwoColumn(checked)}
        />
        <SettingsToggleRow
          title={t('workspaceSidebar.byLabelTitle')}
          description={t('workspaceSidebar.byLabelDescription')}
          checked={workspaceSidebarLabelTwoColumn}
          onCheckedChange={(checked) => void setWorkspaceSidebarLabelTwoColumn(checked)}
        />
        <SettingsToggleRow
          title={t('workspaceSidebar.byGroupTitle')}
          description={t('workspaceSidebar.byGroupDescription')}
          checked={workspaceSidebarGroupTwoColumn}
          onCheckedChange={(checked) => void setWorkspaceSidebarGroupTwoColumn(checked)}
        />
        <SettingsToggleRow
          title={t('workspaceSidebar.byAgentTitle')}
          description={t('workspaceSidebar.byAgentDescription')}
          checked={workspaceSidebarAgentTwoColumn}
          onCheckedChange={(checked) => void setWorkspaceSidebarAgentTwoColumn(checked)}
        />
      </SettingsGroupCard>

      <HeaderLayoutSettingsSection
        expanded={headerLayoutExpanded}
        onExpandedChange={setHeaderLayoutExpanded}
      />

      <SettingsGroupCard
        id="footer"
        open={footerLayoutExpanded}
        onOpenChange={setFooterLayoutExpanded}
        title={t('footer.title')}
        description={t('footer.description')}
        headerEnd={
          <span className="text-xs text-muted-foreground">
            {footerEnabledCount > 0
              ? t('footer.enabledCount', { count: footerEnabledCount })
              : t('footer.hidden')}
          </span>
        }
      >
        <SettingsToggleRow
          title={t('footer.resourceMonitorTitle')}
          description={t('footer.resourceMonitorDescription')}
          checked={showResourceMonitor}
          onCheckedChange={(checked) => void setFooterShowResourceMonitor(checked)}
        />
        <SettingsToggleRow
          title={t('footer.localServicesTitle')}
          description={t('footer.localServicesDescription')}
          checked={showLocalServices}
          onCheckedChange={(checked) => void setFooterShowLocalServices(checked)}
        />
        <SettingsToggleRow
          title={t('footer.usageCarouselTitle')}
          description={t('footer.usageCarouselDescription')}
          checked={showUsageCarousel}
          onCheckedChange={(checked) => void setFooterShowUsageCarousel(checked)}
        />
        <SettingsGroupRow
          title={t('footer.agentStatusTitle')}
          description={
            <>
              {t('footer.agentStatusDescriptionPrefix')}{' '}
              <button
                type="button"
                className="text-foreground underline underline-offset-2 hover:text-foreground/80"
                onClick={() => void setActiveSettingTab('agents')}
              >
                {t('footer.codeAgent')}
              </button>{' '}
              {t('footer.agentStatusDescriptionSuffix')}
            </>
          }
        >
          <Switch
            checked={showAgentStatus}
            onCheckedChange={(checked) => void setFooterShowAgentStatus(!!checked)}
          />
        </SettingsGroupRow>
        <SettingsGroupRow
          wide
          title={t('footer.acpChatTitle')}
          description={t('footer.acpChatDescription')}
        >
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
              onClick={() => {
                setLaunchpadExpanded(true);
                document.getElementById('settings-section-launchpad')?.scrollIntoView({
                  block: 'start',
                  behavior: 'smooth',
                });
              }}
            >
              {t('footer.openLayout')}
            </Button>
          </div>
        </SettingsGroupRow>
      </SettingsGroupCard>
    </SettingsPageStack>
  );
}
