'use client';

import React from 'react';
import type { CodeAgentCustomEntry, LlmProvidersFile } from '@/api/ws-api';
import type { UpdateStatus } from '@/features/settings/hooks/use-updater';
import type { TerminalFileLinkOpenMode } from '@/features/settings/store/terminal-link-settings-store';
import type { NotificationSettings, PushServerConfig } from '@/features/settings/store/notification-settings-store';
import type { QuickOpenAppName } from '@/app-shell/quick-open-apps';
import { AtmosComputerSection } from '@/features/remote-access/components/AtmosComputerSection';
import { RemoteAccessSection } from '@/features/remote-access/components/RemoteAccessSection';
import { CanvasSettingsSection } from '@/features/settings/components/CanvasSettingsSection';
import { CodeAgentSettingsSection } from '@/features/settings/components/CodeAgentSettingsSection';
import { EditorSettingsSection } from '@/features/settings/components/EditorSettingsSection';
import { ExperimentSettingsSection } from '@/features/settings/components/ExperimentSettingsSection';
import { IntegrationsSettingsSection } from '@/features/settings/components/IntegrationsSettingsSection';
import { LabelSettingsSection } from '@/features/settings/components/LabelSettingsSection';
import { LayoutSettingsSection } from '@/features/settings/components/LayoutSettingsSection';
import { NotifySettingsSection } from '@/features/settings/components/NotifySettingsSection';
import { ShortcutsSettingsSection } from '@/features/settings/components/ShortcutsSettingsSection';
import { TerminalSettingsSection } from '@/features/settings/components/TerminalSettingsSection';
import { WorkspaceSettingsSection } from '@/features/settings/components/WorkspaceSettingsSection';
import { SettingsAboutSection } from '@/features/settings/components/SettingsAboutSection';
import { SettingsAiSection, type ProviderTestState } from '@/features/settings/components/SettingsAiSection';
import type { SettingsSectionId } from '@/features/settings/components/settings-modal-sidebar';

type BuiltInAgentSettings = Record<string, { cmd?: string; flags?: string; enabled?: boolean }>;

interface SettingsModalSectionsProps {
  activeSection: SettingsSectionId;
  appVersion: string;
  cliVersionInfo: {
    current: string | null;
    latest: string | null;
    updateAvailable: boolean;
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
  useLastSplitAgentOnSplit: boolean;
  lastSplitAgentId: string | null;
  setFileLinkOpenMode: (mode: TerminalFileLinkOpenMode) => Promise<void> | void;
  setFileLinkOpenApp: (app: QuickOpenAppName) => Promise<void> | void;
  setUseLastSplitAgentOnSplit: (enabled: boolean) => void;
  agentCustomSettings: BuiltInAgentSettings;
  agentSettingsLoading: boolean;
  builtInAgentOpen: Record<string, boolean>;
  builtInAgentsExpanded: boolean;
  customAgentOpen: Record<string, boolean>;
  customAgents: CodeAgentCustomEntry[];
  customAgentsExpanded: boolean;
  idleSessionTimeoutMins: number;
  removingCustomAgentIds: Record<string, boolean>;
  savedAgentCustomSettings: BuiltInAgentSettings;
  savedCustomAgents: CodeAgentCustomEntry[];
  savedIdleSessionTimeoutMins: number;
  savingBuiltInAgentIds: Record<string, boolean>;
  savingCustomAgentIds: Record<string, boolean>;
  savingIdleTimeout: boolean;
  syncingBuiltInEnabledIds: Record<string, boolean>;
  syncingCustomEnabledIds: Record<string, boolean>;
  onAddCustomAgent: () => void;
  onAgentSettingChange: (agentId: string, field: 'cmd' | 'flags' | 'enabled', value: string | boolean) => void;
  onBuiltInEnabledChange: (agentId: string, enabled: boolean) => void;
  onCustomAgentChange: (id: string, field: keyof CodeAgentCustomEntry, value: string | boolean) => void;
  onCustomAgentEnabledChange: (id: string, enabled: boolean) => void;
  onRemoveCustomAgent: (id: string) => void;
  onSaveBuiltInAgent: (agentId: string) => void;
  onSaveCustomAgent: (id: string) => void;
  onSaveIdleTimeout: () => void;
  setBuiltInAgentOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setBuiltInAgentsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setCustomAgentOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setCustomAgentsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setIdleSessionTimeoutMins: React.Dispatch<React.SetStateAction<number>>;
  handleLlmConfigUpdate: (
    key: string,
    updater: (current: LlmProvidersFile) => LlmProvidersFile,
  ) => Promise<void>;
  handleProviderEnabledChange: (providerId: string, enabled: boolean) => Promise<void>;
  isLlmConfigLoading: boolean;
  llmConfig: LlmProvidersFile | null;
  loadLlmConfig: () => Promise<void>;
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

export function SettingsModalSections(props: SettingsModalSectionsProps) {
  switch (props.activeSection) {
    case 'about':
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
    case 'terminal':
      return (
        <TerminalSettingsSection
          fileLinkOpenMode={props.fileLinkOpenMode}
          fileLinkOpenApp={props.fileLinkOpenApp}
          useLastSplitAgentOnSplit={props.useLastSplitAgentOnSplit}
          lastSplitAgentId={props.lastSplitAgentId}
          setFileLinkOpenMode={props.setFileLinkOpenMode}
          setFileLinkOpenApp={props.setFileLinkOpenApp}
          setUseLastSplitAgentOnSplit={props.setUseLastSplitAgentOnSplit}
        />
      );
    case 'code-agent':
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
          removingCustomAgentIds={props.removingCustomAgentIds}
          savedAgentCustomSettings={props.savedAgentCustomSettings}
          savedCustomAgents={props.savedCustomAgents}
          savedIdleSessionTimeoutMins={props.savedIdleSessionTimeoutMins}
          savingBuiltInAgentIds={props.savingBuiltInAgentIds}
          savingCustomAgentIds={props.savingCustomAgentIds}
          savingIdleTimeout={props.savingIdleTimeout}
          syncingBuiltInEnabledIds={props.syncingBuiltInEnabledIds}
          syncingCustomEnabledIds={props.syncingCustomEnabledIds}
          onAddCustomAgent={props.onAddCustomAgent}
          onAgentSettingChange={props.onAgentSettingChange}
          onBuiltInEnabledChange={props.onBuiltInEnabledChange}
          onCustomAgentChange={props.onCustomAgentChange}
          onCustomAgentEnabledChange={props.onCustomAgentEnabledChange}
          onRemoveCustomAgent={props.onRemoveCustomAgent}
          onSaveBuiltInAgent={props.onSaveBuiltInAgent}
          onSaveCustomAgent={props.onSaveCustomAgent}
          onSaveIdleTimeout={props.onSaveIdleTimeout}
          setBuiltInAgentOpen={props.setBuiltInAgentOpen}
          setBuiltInAgentsExpanded={props.setBuiltInAgentsExpanded}
          setCustomAgentOpen={props.setCustomAgentOpen}
          setCustomAgentsExpanded={props.setCustomAgentsExpanded}
          setIdleSessionTimeoutMins={props.setIdleSessionTimeoutMins}
        />
      );
    case 'workspace':
      return <WorkspaceSettingsSection />;
    case 'labels':
      return <LabelSettingsSection />;
    case 'integrations':
      return <IntegrationsSettingsSection />;
    case 'ai':
      return (
        <SettingsAiSection
          handleLlmConfigUpdate={props.handleLlmConfigUpdate}
          handleProviderEnabledChange={props.handleProviderEnabledChange}
          isLlmConfigLoading={props.isLlmConfigLoading}
          llmConfig={props.llmConfig}
          loadLlmConfig={props.loadLlmConfig}
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
    case 'notify':
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
      return <RemoteAccessSection />;
    case 'atmos-computer':
      return <AtmosComputerSection />;
    case 'shortcuts':
      return <ShortcutsSettingsSection />;
    case 'experiments':
      return <ExperimentSettingsSection />;
    case 'layout':
      return <LayoutSettingsSection />;
    case 'editor':
      return <EditorSettingsSection />;
    case 'canvas':
      return <CanvasSettingsSection />;
    default:
      return null;
  }
}
