'use client';

import React from 'react';
import type { CodeAgentCustomEntry, LlmProvidersFile } from '@/api/ws-api';
import type { UpdateStatus } from '@/features/settings/hooks/use-updater';
import type { TerminalFileLinkOpenMode } from '@/features/settings/store/terminal-link-settings-store';
import type { NotificationSettings, PushServerConfig } from '@/features/settings/store/notification-settings-store';
import type { QuickOpenAppName } from '@/app-shell/quick-open-apps';
import { AtmosComputerSection } from '@/features/atmos-computer/components/AtmosComputerSection';
import { TunnelConnectorSection } from '@/features/tunnel-connector/components/TunnelConnectorSection';
import { DesktopUseSettingsSection } from '@/features/settings/components/DesktopUseSettingsSection';
import { BrowserSettingsSection } from '@/features/settings/components/BrowserSettingsSection';
import { PermissionAccessSettingsSection } from '@/features/settings/components/PermissionAccessSettingsSection';
import { CanvasSettingsSection } from '@/features/settings/components/CanvasSettingsSection';
import { CodeAgentSettingsSection } from '@/features/settings/components/CodeAgentSettingsSection';
import { EditorSettingsSection } from '@/features/settings/components/EditorSettingsSection';
import { ExperimentSettingsSection } from '@/features/settings/components/ExperimentSettingsSection';
import { AccountSettingsSection } from '@/features/settings/components/AccountSettingsSection';
import { AppearanceSettingsSection } from '@/features/settings/components/AppearanceSettingsSection';
import { IntegrationsSettingsSection } from '@/features/settings/components/IntegrationsSettingsSection';
import { LabelSettingsSection } from '@/features/settings/components/LabelSettingsSection';
import { LayoutSettingsSection } from '@/features/settings/components/LayoutSettingsSection';
import { NotifySettingsSection } from '@/features/settings/components/NotifySettingsSection';
import { ShortcutsSettingsSection } from '@/features/settings/components/ShortcutsSettingsSection';
import { TerminalSettingsSection } from '@/features/settings/components/TerminalSettingsSection';
import { WorkspaceSettingsSection } from '@/features/settings/components/WorkspaceSettingsSection';
import { SettingsAboutSection } from '@/features/settings/components/SettingsAboutSection';
import { SettingsAiSection, type ProviderTestState } from '@/features/settings/components/SettingsAiSection';
import type { LocalAgentOption } from '@/app-shell/llm-providers-modal-utils';
import { SettingsSection } from '@/features/settings/components/settings/SettingsGroupCard';
import type { SettingsSectionId } from '@/features/settings/components/settings-modal-data';
import type { TerminalAgentSavedRunConfig } from '@/features/agent/lib/terminal-agent-run-config';
import type { SettingsGroupTabId } from '@/features/settings/lib/settings-section-group-tabs';

type BuiltInAgentSettings = Record<string, { cmd?: string; flags?: string; enabled?: boolean }>;
type AgentOption = { id: string; label: string };

interface SettingsModalSectionsProps {
  activeSection: SettingsSectionId;
  activeGroupTab: SettingsGroupTabId | null;
  appVersion: string;
  cliVersionInfo: {
    current: string | null;
    latest: string | null;
    updateAvailable: boolean;
    installed: boolean;
  } | null;
  isInstallingCli: boolean;
  isCheckingCliVersion: boolean;
  isCheckingDesktopUpdate: boolean;
  status: UpdateStatus;
  onInstallCli: () => void;
  onCheckCliVersion: () => void;
  onCheckForUpdate: () => void;
  fileLinkOpenMode: TerminalFileLinkOpenMode;
  fileLinkOpenApp: QuickOpenAppName;
  sideContextPromptBudgetBytes: number;
  richInputEnabled: boolean;
  richInputTriggerBarVisible: boolean;
  setFileLinkOpenMode: (mode: TerminalFileLinkOpenMode) => Promise<void> | void;
  setFileLinkOpenApp: (app: QuickOpenAppName) => Promise<void> | void;
  setSideContextPromptBudgetBytes: (bytes: number) => Promise<void> | void;
  setRichInputEnabled: (enabled: boolean) => Promise<void> | void;
  setRichInputTriggerBarVisible: (visible: boolean) => Promise<void> | void;
  maxWarmWorkspaces: number;
  maxGlobalTerminalPanes: number;
  setMaxWarmWorkspaces: (size: number) => Promise<void> | void;
  setMaxGlobalTerminalPanes: (panels: number) => Promise<void> | void;
  agentCustomSettings: BuiltInAgentSettings;
  agentSettingsLoading: boolean;
  builtInAgentOpen: Record<string, boolean>;
  builtInAgentsExpanded: boolean;
  customAgentOpen: Record<string, boolean>;
  customAgents: CodeAgentCustomEntry[];
  customAgentsExpanded: boolean;
  idleSessionTimeoutMins: number;
  attentionSummaryEnabled: boolean;
  attentionSummaryDelayMins: number;
  attentionSummaryAgentId: string;
  attentionSummaryModel: string;
  runConfigAgentOptions: AgentOption[];
  runConfigsLoading: boolean;
  removingCustomAgentIds: Record<string, boolean>;
  savedRunConfigs: TerminalAgentSavedRunConfig[];
  savedAgentCustomSettings: BuiltInAgentSettings;
  savedCustomAgents: CodeAgentCustomEntry[];
  savedIdleSessionTimeoutMins: number;
  savedAttentionSummaryEnabled: boolean;
  savedAttentionSummaryDelayMins: number;
  savedAttentionSummaryAgentId: string;
  savedAttentionSummaryModel: string;
  savingBuiltInAgentIds: Record<string, boolean>;
  savingCustomAgentIds: Record<string, boolean>;
  savingIdleTimeout: boolean;
  savingRunConfigs: boolean;
  syncingBuiltInEnabledIds: Record<string, boolean>;
  syncingCustomEnabledIds: Record<string, boolean>;
  yoloMode: boolean;
  yoloModeSyncing: boolean;
  yoloModeRestoring: boolean;
  onYoloModeChange: (enabled: boolean) => void;
  onRestoreAllYoloMode: () => void;
  showAgentNameInTerminalTitles: boolean;
  showAgentNameInTerminalTitlesSyncing: boolean;
  onShowAgentNameInTerminalTitlesChange: (enabled: boolean) => void;
  onAddCustomAgent: () => void;
  onAgentSettingChange: (agentId: string, field: 'cmd' | 'flags' | 'interactiveFlags' | 'enabled', value: string | boolean) => void;
  onBuiltInEnabledChange: (agentId: string, enabled: boolean) => void;
  onCustomAgentChange: (id: string, field: keyof CodeAgentCustomEntry, value: string | boolean) => void;
  onCustomAgentEnabledChange: (id: string, enabled: boolean) => void;
  onRemoveCustomAgent: (id: string) => void;
  onSaveBuiltInAgent: (agentId: string) => void;
  onSaveCustomAgent: (id: string) => void;
  onCommitBehaviourSettings: (values: {
    idleSessionTimeoutMins: number;
    attentionSummaryEnabled: boolean;
    attentionSummaryDelayMins: number;
    attentionSummaryAgentId: string;
    attentionSummaryModel: string;
  }) => void | Promise<void>;
  onSaveRunConfigs: (configs: TerminalAgentSavedRunConfig[]) => Promise<void>;
  setBuiltInAgentOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setBuiltInAgentsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setCustomAgentOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setCustomAgentsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setIdleSessionTimeoutMins: React.Dispatch<React.SetStateAction<number>>;
  setAttentionSummaryEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setAttentionSummaryDelayMins: React.Dispatch<React.SetStateAction<number>>;
  setAttentionSummaryAgentId: React.Dispatch<React.SetStateAction<string>>;
  setAttentionSummaryModel: React.Dispatch<React.SetStateAction<string>>;
  handleLlmConfigUpdate: (
    key: string,
    updater: (current: LlmProvidersFile) => LlmProvidersFile,
  ) => Promise<void>;
  handleProviderEnabledChange: (providerId: string, enabled: boolean) => Promise<void>;
  isLlmConfigLoading: boolean;
  llmConfig: LlmProvidersFile | null;
  loadLlmConfig: () => Promise<void>;
  localAgentOptions: readonly LocalAgentOption[];
  providerTests: ProviderTestState;
  providerToggleId: string | null;
  providersExpanded: boolean;
  routingExpanded: boolean;
  routingSavingKey: string | null;
  runProviderTest: (
    providerId: string,
    provider: NonNullable<LlmProvidersFile['providers'][string]>,
  ) => Promise<void>;
  setProviderDialogState: React.Dispatch<React.SetStateAction<{
    open: boolean;
    providerId: string | null;
  }>>;
  setProviderTests: React.Dispatch<React.SetStateAction<ProviderTestState>>;
  setProvidersExpanded: (open: boolean) => void;
  setRoutingExpanded: (open: boolean) => void;
  notifySettings: NotificationSettings;
  isNotifyLoading: boolean;
  isNotifySaving: boolean;
  onToggleBrowserNotifications: (checked: boolean) => void | Promise<void>;
  onToggleDesktopNotifications: (checked: boolean) => void;
  onTestBrowserNotification: () => Promise<boolean>;
  onTestDesktopNotification: () => Promise<boolean>;
  onTogglePermissionRequestNotification: (checked: boolean) => void;
  onToggleTaskCompleteNotification: (checked: boolean) => void;
  onAddPushServer: (server: PushServerConfig) => Promise<void>;
  onRemovePushServer: (id: string) => Promise<void>;
  onUpdatePushServer: (id: string, updates: Partial<PushServerConfig>) => Promise<void>;
  onTestPushServer: (index: number) => Promise<{ ok: boolean; error?: string }>;
}

function TabbedSettingsSection({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return <SettingsSection id={id}>{children}</SettingsSection>;
}

export function SettingsModalSections(props: SettingsModalSectionsProps) {
  switch (props.activeSection) {
    case 'general':
      if (props.activeGroupTab === 'about') {
        return (
          <SettingsAboutSection
            appVersion={props.appVersion}
            cliVersionInfo={props.cliVersionInfo}
            isInstallingCli={props.isInstallingCli}
            isCheckingCliVersion={props.isCheckingCliVersion}
            isCheckingDesktopUpdate={props.isCheckingDesktopUpdate}
            status={props.status}
            onInstallCli={props.onInstallCli}
            onCheckCliVersion={props.onCheckCliVersion}
            onCheckForUpdate={props.onCheckForUpdate}
          />
        );
      }
      if (props.activeGroupTab === 'experiments') {
        return <ExperimentSettingsSection />;
      }
      return <AppearanceSettingsSection />;
    case 'terminal':
      return (
        <TerminalSettingsSection
          fileLinkOpenMode={props.fileLinkOpenMode}
          fileLinkOpenApp={props.fileLinkOpenApp}
          sideContextPromptBudgetBytes={props.sideContextPromptBudgetBytes}
          richInputEnabled={props.richInputEnabled}
          richInputTriggerBarVisible={props.richInputTriggerBarVisible}
          setFileLinkOpenMode={props.setFileLinkOpenMode}
          setFileLinkOpenApp={props.setFileLinkOpenApp}
          setSideContextPromptBudgetBytes={props.setSideContextPromptBudgetBytes}
          setRichInputEnabled={props.setRichInputEnabled}
          setRichInputTriggerBarVisible={props.setRichInputTriggerBarVisible}
          maxWarmWorkspaces={props.maxWarmWorkspaces}
          maxGlobalTerminalPanes={props.maxGlobalTerminalPanes}
          setMaxWarmWorkspaces={props.setMaxWarmWorkspaces}
          setMaxGlobalTerminalPanes={props.setMaxGlobalTerminalPanes}
        />
      );
    case 'agents':
      return (
        <CodeAgentSettingsSection
          agentCustomSettings={props.agentCustomSettings}
          agentSettingsLoading={props.agentSettingsLoading}
          builtInAgentOpen={props.builtInAgentOpen}
          builtInAgentsExpanded={props.builtInAgentsExpanded}
          customAgentOpen={props.customAgentOpen}
          customAgents={props.customAgents}
          customAgentsExpanded={props.customAgentsExpanded}
          idleSessionTimeoutMins={props.idleSessionTimeoutMins}
          attentionSummaryEnabled={props.attentionSummaryEnabled}
          attentionSummaryDelayMins={props.attentionSummaryDelayMins}
          attentionSummaryAgentId={props.attentionSummaryAgentId}
          attentionSummaryModel={props.attentionSummaryModel}
          runConfigAgentOptions={props.runConfigAgentOptions}
          runConfigsLoading={props.runConfigsLoading}
          removingCustomAgentIds={props.removingCustomAgentIds}
          savedRunConfigs={props.savedRunConfigs}
          savedAgentCustomSettings={props.savedAgentCustomSettings}
          savedCustomAgents={props.savedCustomAgents}
          savedIdleSessionTimeoutMins={props.savedIdleSessionTimeoutMins}
          savedAttentionSummaryEnabled={props.savedAttentionSummaryEnabled}
          savedAttentionSummaryDelayMins={props.savedAttentionSummaryDelayMins}
          savedAttentionSummaryAgentId={props.savedAttentionSummaryAgentId}
          savedAttentionSummaryModel={props.savedAttentionSummaryModel}
          savingBuiltInAgentIds={props.savingBuiltInAgentIds}
          savingCustomAgentIds={props.savingCustomAgentIds}
          savingIdleTimeout={props.savingIdleTimeout}
          savingRunConfigs={props.savingRunConfigs}
          syncingBuiltInEnabledIds={props.syncingBuiltInEnabledIds}
          syncingCustomEnabledIds={props.syncingCustomEnabledIds}
          yoloMode={props.yoloMode}
          yoloModeSyncing={props.yoloModeSyncing}
          yoloModeRestoring={props.yoloModeRestoring}
          onYoloModeChange={props.onYoloModeChange}
          onRestoreAllYoloMode={props.onRestoreAllYoloMode}
          showAgentNameInTerminalTitles={props.showAgentNameInTerminalTitles}
          showAgentNameInTerminalTitlesSyncing={props.showAgentNameInTerminalTitlesSyncing}
          onShowAgentNameInTerminalTitlesChange={props.onShowAgentNameInTerminalTitlesChange}
          onAddCustomAgent={props.onAddCustomAgent}
          onAgentSettingChange={props.onAgentSettingChange}
          onBuiltInEnabledChange={props.onBuiltInEnabledChange}
          onCustomAgentChange={props.onCustomAgentChange}
          onCustomAgentEnabledChange={props.onCustomAgentEnabledChange}
          onRemoveCustomAgent={props.onRemoveCustomAgent}
          onSaveBuiltInAgent={props.onSaveBuiltInAgent}
          onSaveCustomAgent={props.onSaveCustomAgent}
          onCommitBehaviourSettings={props.onCommitBehaviourSettings}
          onSaveRunConfigs={props.onSaveRunConfigs}
          setBuiltInAgentOpen={props.setBuiltInAgentOpen}
          setBuiltInAgentsExpanded={props.setBuiltInAgentsExpanded}
          setCustomAgentOpen={props.setCustomAgentOpen}
          setCustomAgentsExpanded={props.setCustomAgentsExpanded}
          setIdleSessionTimeoutMins={props.setIdleSessionTimeoutMins}
          setAttentionSummaryEnabled={props.setAttentionSummaryEnabled}
          setAttentionSummaryDelayMins={props.setAttentionSummaryDelayMins}
          setAttentionSummaryAgentId={props.setAttentionSummaryAgentId}
          setAttentionSummaryModel={props.setAttentionSummaryModel}
        />
      );
    case 'workspace':
      if (props.activeGroupTab === 'labels') {
        return (
          <TabbedSettingsSection id="labels">
            <LabelSettingsSection />
          </TabbedSettingsSection>
        );
      }
      return (
        <TabbedSettingsSection id="workspace">
          <WorkspaceSettingsSection />
        </TabbedSettingsSection>
      );
    case 'account':
      return <AccountSettingsSection />;
    case 'models':
      return (
        <SettingsAiSection
          handleLlmConfigUpdate={props.handleLlmConfigUpdate}
          handleProviderEnabledChange={props.handleProviderEnabledChange}
          isLlmConfigLoading={props.isLlmConfigLoading}
          llmConfig={props.llmConfig}
          loadLlmConfig={props.loadLlmConfig}
          localAgentOptions={props.localAgentOptions}
          providerTests={props.providerTests}
          providerToggleId={props.providerToggleId}
          providersExpanded={props.providersExpanded}
          routingExpanded={props.routingExpanded}
          routingSavingKey={props.routingSavingKey}
          runProviderTest={props.runProviderTest}
          setProviderDialogState={props.setProviderDialogState}
          setProviderTests={props.setProviderTests}
          setProvidersExpanded={props.setProvidersExpanded}
          setRoutingExpanded={props.setRoutingExpanded}
        />
      );
    case 'notifications':
      return (
        <NotifySettingsSection
          settings={props.notifySettings}
          isLoading={props.isNotifyLoading}
          isSaving={props.isNotifySaving}
          onToggleBrowser={props.onToggleBrowserNotifications}
          onToggleDesktop={props.onToggleDesktopNotifications}
          onTestBrowser={props.onTestBrowserNotification}
          onTestDesktop={props.onTestDesktopNotification}
          onTogglePermissionRequest={props.onTogglePermissionRequestNotification}
          onToggleTaskComplete={props.onToggleTaskCompleteNotification}
          onAddPushServer={props.onAddPushServer}
          onRemovePushServer={props.onRemovePushServer}
          onUpdatePushServer={props.onUpdatePushServer}
          onTestPushServer={props.onTestPushServer}
        />
      );
    case 'remote-access':
      if (props.activeGroupTab === 'tunnel-connector') {
        return (
          <TabbedSettingsSection id="tunnel-connector">
            <TunnelConnectorSection />
          </TabbedSettingsSection>
        );
      }
      return (
        <TabbedSettingsSection id="atmos-computer">
          <AtmosComputerSection />
        </TabbedSettingsSection>
      );
    case 'apps':
      if (props.activeGroupTab === 'browser') {
        return (
          <TabbedSettingsSection id="browser">
            <BrowserSettingsSection />
          </TabbedSettingsSection>
        );
      }
      if (props.activeGroupTab === 'desktop-use') {
        return (
          <TabbedSettingsSection id="desktop-use">
            <DesktopUseSettingsSection />
          </TabbedSettingsSection>
        );
      }
      return (
        <TabbedSettingsSection id="integrations">
          <IntegrationsSettingsSection />
        </TabbedSettingsSection>
      );
    case 'privacy':
      return <PermissionAccessSettingsSection />;
    case 'keyboard':
      return <ShortcutsSettingsSection />;
    case 'interface':
      return <LayoutSettingsSection />;
    case 'editor':
      if (props.activeGroupTab === 'canvas') {
        return <CanvasSettingsSection />;
      }
      return (
        <TabbedSettingsSection id="editor">
          <EditorSettingsSection />
        </TabbedSettingsSection>
      );
    default:
      return null;
  }
}
