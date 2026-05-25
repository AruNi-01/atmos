'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQueryState } from 'nuqs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  ScrollArea,
  toastManager,
} from '@workspace/ui';
import { AGENT_OPTIONS } from '@/features/wiki/components/AgentSelect';
import { useTerminalLinkSettingsStore } from '@/features/settings/store/terminal-link-settings-store';
import { useTerminalSplitPrefsStore } from '@/features/settings/store/terminal-split-prefs-store';
import {
  agentBehaviourSettingsApi,
  codeAgentCustomApi,
  type CodeAgentCustomEntry,
  llmProvidersApi,
  type LlmProvidersFile,
} from '@/api/ws-api';
import { LlmProviderEditorDialog } from '@/app-shell/LlmProvidersModal';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import { settingsModalParams } from '@/shared/lib/nuqs/searchParams';
import { useNotificationSettingsStore } from '@/features/settings/store/notification-settings-store';
import {
  requestBrowserNotificationPermission,
  sendBrowserNotification,
  showDesktopNotification,
} from '@/shared/lib/notifications';
import {
  TEST_NOTIFICATION_PAYLOAD,
  buildBuiltInEntries,
  buildBuiltInOverrides,
  dedupeCodeAgentEntries,
  isBuiltInAgentId,
} from '@/features/settings/components/settings/settings-modal-utils';
import type { ProviderTestState } from '@/features/settings/components/SettingsAiSection';
import { SettingsModalSections } from '@/features/settings/components/SettingsModalSections';
import {
  SETTINGS_SECTIONS,
  SettingsModalSidebar,
  type SettingsSectionId,
} from '@/features/settings/components/settings-modal-sidebar';
import { useSettingsUpdateActions } from '@/features/settings/components/use-settings-update-actions';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSectionOverride?: SettingsSectionId | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  activeSectionOverride,
}) => {
  const {
    appVersion,
    cliVersionInfo,
    handleCheckCliVersion,
    handleCheckForUpdate,
    handleInstallCli,
    isCheckingCliVersion,
    isCheckingDesktopUpdate,
    isInstallingCli,
    status,
  } = useSettingsUpdateActions();
  const [activeSection, setActiveSection] = useQueryState('activeSettingTab', settingsModalParams.activeSettingTab);
  const [llmConfig, setLlmConfig] = useState<LlmProvidersFile | null>(null);
  const [isLlmConfigLoading, setIsLlmConfigLoading] = useState(false);
  const [providerDialogState, setProviderDialogState] = useState<{
    open: boolean;
    providerId: string | null;
  }>({ open: false, providerId: null });
  const [providersExpanded, setProvidersExpanded] = useState(true);
  const [routingExpanded, setRoutingExpanded] = useState(true);
  const [providerToggleId, setProviderToggleId] = useState<string | null>(null);
  const [routingSavingKey, setRoutingSavingKey] = useState<string | null>(null);
  const [sessionTitleFormatOpen, setSessionTitleFormatOpen] = useState(false);
  const [providerTests, setProviderTests] = useState<ProviderTestState>({});
  const providerTestUnsubscribeRef = useRef<Record<string, (() => void) | null>>({});
  // Code Agent settings persisted in ~/.atmos/agent/terminal_code_agent.json
  const [agentCustomSettings, setAgentCustomSettings] = useState<Record<string, { cmd?: string; flags?: string; enabled?: boolean }>>({});
  const [savedAgentCustomSettings, setSavedAgentCustomSettings] = useState<Record<string, { cmd?: string; flags?: string; enabled?: boolean }>>({});
  const [agentSettingsLoading, setAgentSettingsLoading] = useState(false);
  const [savingBuiltInAgentIds, setSavingBuiltInAgentIds] = useState<Record<string, boolean>>({});
  const [syncingBuiltInEnabledIds, setSyncingBuiltInEnabledIds] = useState<Record<string, boolean>>({});
  const [builtInAgentsExpanded, setBuiltInAgentsExpanded] = useState(false);
  const [customAgentsExpanded, setCustomAgentsExpanded] = useState(false);
  const [builtInAgentOpen, setBuiltInAgentOpen] = useState<Record<string, boolean>>({});
  const [customAgentOpen, setCustomAgentOpen] = useState<Record<string, boolean>>({});
  const [customAgents, setCustomAgents] = useState<CodeAgentCustomEntry[]>([]);
  const [savedCustomAgents, setSavedCustomAgents] = useState<CodeAgentCustomEntry[]>([]);
  const [savingCustomAgentIds, setSavingCustomAgentIds] = useState<Record<string, boolean>>({});
  const [syncingCustomEnabledIds, setSyncingCustomEnabledIds] = useState<Record<string, boolean>>({});
  const [removingCustomAgentIds, setRemovingCustomAgentIds] = useState<Record<string, boolean>>({});
  const [idleSessionTimeoutMins, setIdleSessionTimeoutMins] = useState<number>(30);
  const [savedIdleSessionTimeoutMins, setSavedIdleSessionTimeoutMins] = useState<number>(30);
  const [savingIdleTimeout, setSavingIdleTimeout] = useState(false);
  const {
    fileLinkOpenMode,
    fileLinkOpenApp,
    loadSettings: loadTerminalLinkSettings,
    setFileLinkOpenMode,
    setFileLinkOpenApp,
  } = useTerminalLinkSettingsStore();
  const {
    useLastSplitAgentOnSplit,
    lastSplitAgentId,
    hydrate: hydrateTerminalSplitPrefs,
    setUseLastSplitAgentOnSplit,
  } = useTerminalSplitPrefsStore();

  useEffect(() => {
    void loadTerminalLinkSettings();
    hydrateTerminalSplitPrefs();
  }, [hydrateTerminalSplitPrefs, loadTerminalLinkSettings]);

  // Load agent custom settings when modal opens
  const loadAgentSettings = React.useCallback(async () => {
    setAgentSettingsLoading(true);
    try {
      const customData = await codeAgentCustomApi.get();
      const allAgents = dedupeCodeAgentEntries(
        Array.isArray(customData?.agents) ? customData.agents : [],
      );
      const builtInEntries = allAgents.filter((agent) => isBuiltInAgentId(agent.id));
      const customEntries = allAgents.filter((agent) => !isBuiltInAgentId(agent.id));
      const builtInOverrides = buildBuiltInOverrides(builtInEntries);

      setAgentCustomSettings(builtInOverrides);
      setSavedAgentCustomSettings(builtInOverrides);
      setCustomAgents(customEntries);
      setSavedCustomAgents(customEntries);
      setBuiltInAgentsExpanded(false);
      setCustomAgentsExpanded(false);
      setBuiltInAgentOpen({});
      setCustomAgentOpen({});

      const behaviourData = await agentBehaviourSettingsApi.get();
      const timeout = behaviourData?.idle_session_timeout_mins ?? 30;
      setIdleSessionTimeoutMins(timeout);
      setSavedIdleSessionTimeoutMins(timeout);
    } catch {
      // ignore
    } finally {
      setAgentSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadAgentSettings();
  }, [isOpen, loadAgentSettings]);

  const {
    settings: notifySettings,
    isLoading: isNotifyLoading,
    isSaving: isNotifySaving,
    loadSettings: loadNotifySettings,
    updateField: updateNotifyField,
    addPushServer,
    removePushServer,
    updatePushServer,
    testPushServer,
  } = useNotificationSettingsStore();

  useEffect(() => {
    if (!isOpen) return;
    void loadNotifySettings();
  }, [isOpen, loadNotifySettings]);

  useEffect(() => {
    if (!isOpen || !activeSectionOverride) return;
    void setActiveSection(activeSectionOverride);
  }, [activeSectionOverride, isOpen, setActiveSection]);

  const persistCodeAgents = React.useCallback(async (agents: CodeAgentCustomEntry[]) => {
    const nextAgents = dedupeCodeAgentEntries(agents);
    await codeAgentCustomApi.update(nextAgents);
    return nextAgents;
  }, []);

  const handleAgentSettingChange = React.useCallback((agentId: string, field: 'cmd' | 'flags' | 'enabled', value: string | boolean) => {
    setAgentCustomSettings((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], [field]: value },
    }));
  }, []);

  const handleSaveBuiltInAgent = React.useCallback(async (agentId: string) => {
    const nextBuiltInSettings = {
      ...savedAgentCustomSettings,
      [agentId]: agentCustomSettings[agentId] ?? {},
    };

    if (
      (nextBuiltInSettings[agentId]?.cmd ?? AGENT_OPTIONS.find((agent) => agent.id === agentId)?.cmd) ===
        AGENT_OPTIONS.find((agent) => agent.id === agentId)?.cmd &&
      (nextBuiltInSettings[agentId]?.flags ?? (AGENT_OPTIONS.find((agent) => agent.id === agentId)?.params || '')) ===
        (AGENT_OPTIONS.find((agent) => agent.id === agentId)?.params || '')
    ) {
      delete nextBuiltInSettings[agentId];
    }

    setSavingBuiltInAgentIds((prev) => ({ ...prev, [agentId]: true }));
    try {
      const nextBuiltInEntries = buildBuiltInEntries(nextBuiltInSettings);
      await persistCodeAgents([
        ...savedCustomAgents,
        ...nextBuiltInEntries,
      ]);
      setSavedAgentCustomSettings(nextBuiltInSettings);
    } catch (error) {
      toastManager.add({
        title: 'Failed to save built-in agent',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setSavingBuiltInAgentIds((prev) => {
        const next = { ...prev };
        delete next[agentId];
        return next;
      });
    }
  }, [agentCustomSettings, persistCodeAgents, savedAgentCustomSettings, savedCustomAgents]);

  const handleBuiltInEnabledChange = React.useCallback(async (agentId: string, enabled: boolean) => {
    const previousEnabled = savedAgentCustomSettings[agentId]?.enabled ?? true;
    setAgentCustomSettings((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], enabled },
    }));
    setSyncingBuiltInEnabledIds((prev) => ({ ...prev, [agentId]: true }));

    const nextSavedBuiltInSettings = {
      ...savedAgentCustomSettings,
      [agentId]: { ...savedAgentCustomSettings[agentId], enabled },
    };

    if (
      (nextSavedBuiltInSettings[agentId]?.cmd ?? AGENT_OPTIONS.find((agent) => agent.id === agentId)?.cmd) ===
        AGENT_OPTIONS.find((agent) => agent.id === agentId)?.cmd &&
      (nextSavedBuiltInSettings[agentId]?.flags ?? (AGENT_OPTIONS.find((agent) => agent.id === agentId)?.params || '')) ===
        (AGENT_OPTIONS.find((agent) => agent.id === agentId)?.params || '') &&
      (nextSavedBuiltInSettings[agentId]?.enabled ?? true) === true
    ) {
      delete nextSavedBuiltInSettings[agentId];
    }

    try {
      await persistCodeAgents([
        ...savedCustomAgents,
        ...buildBuiltInEntries(nextSavedBuiltInSettings),
      ]);
      setSavedAgentCustomSettings(nextSavedBuiltInSettings);
    } catch (error) {
      setAgentCustomSettings((prev) => ({
        ...prev,
        [agentId]: { ...prev[agentId], enabled: previousEnabled },
      }));
      toastManager.add({
        title: 'Failed to update agent visibility',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setSyncingBuiltInEnabledIds((prev) => {
        const next = { ...prev };
        delete next[agentId];
        return next;
      });
    }
  }, [persistCodeAgents, savedAgentCustomSettings, savedCustomAgents]);

  const handleAddCustomAgent = React.useCallback(() => {
    const id = `custom_${Date.now()}`;
    setCustomAgents((prev) => {
      return [...prev, { id, label: '', cmd: '', flags: '', enabled: true }];
    });
    setCustomAgentsExpanded(true);
    setCustomAgentOpen((prev) => ({ ...prev, [id]: true }));
  }, []);

  const handleRemoveCustomAgent = React.useCallback((id: string) => {
    const wasSaved = savedCustomAgents.some((agent) => agent.id === id);
    setCustomAgents((prev) => prev.filter((agent) => agent.id !== id));
    setCustomAgentOpen((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    if (!wasSaved) return;

    setRemovingCustomAgentIds((prev) => ({ ...prev, [id]: true }));
    const nextSavedCustomAgents = savedCustomAgents.filter((agent) => agent.id !== id);
    void persistCodeAgents([
      ...buildBuiltInEntries(savedAgentCustomSettings),
      ...nextSavedCustomAgents,
    ]).then(() => {
      setSavedCustomAgents(nextSavedCustomAgents);
    }).catch((error) => {
      toastManager.add({
        title: 'Failed to remove custom agent',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
      void loadAgentSettings();
    }).finally(() => {
      setRemovingCustomAgentIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });
  }, [loadAgentSettings, persistCodeAgents, savedAgentCustomSettings, savedCustomAgents]);

  const handleCustomAgentChange = React.useCallback((id: string, field: keyof CodeAgentCustomEntry, value: string | boolean) => {
    setCustomAgents((prev) => {
      return prev.map((agent) => (agent.id === id ? { ...agent, [field]: value } : agent));
    });
  }, []);

  const handleSaveCustomAgent = React.useCallback(async (id: string) => {
    const currentAgent = customAgents.find((agent) => agent.id === id);
    if (!currentAgent) return;

    if (!currentAgent.label.trim() || !currentAgent.cmd.trim()) {
      toastManager.add({
        title: 'Custom agent is incomplete',
        description: 'Name and command are required before saving.',
        type: 'error',
      });
      return;
    }

    setSavingCustomAgentIds((prev) => ({ ...prev, [id]: true }));
    try {
      const normalizedAgent: CodeAgentCustomEntry = {
        ...currentAgent,
        label: currentAgent.label.trim(),
        cmd: currentAgent.cmd.trim(),
        flags: currentAgent.flags.trim(),
        enabled: currentAgent.enabled !== false,
      };
      const nextSavedCustomAgents = dedupeCodeAgentEntries([
        ...savedCustomAgents.filter((agent) => agent.id !== id),
        normalizedAgent,
      ]).filter((agent) => !isBuiltInAgentId(agent.id));

      await persistCodeAgents([
        ...buildBuiltInEntries(savedAgentCustomSettings),
        ...nextSavedCustomAgents,
      ]);

      setCustomAgents((prev) => prev.map((agent) => (
        agent.id === id ? normalizedAgent : agent
      )));
      setSavedCustomAgents(nextSavedCustomAgents);
    } catch (error) {
      toastManager.add({
        title: 'Failed to save custom agent',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setSavingCustomAgentIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, [customAgents, persistCodeAgents, savedAgentCustomSettings, savedCustomAgents]);

  const handleCustomAgentEnabledChange = React.useCallback(async (id: string, enabled: boolean) => {
    const savedAgent = savedCustomAgents.find((agent) => agent.id === id);
    setCustomAgents((prev) => prev.map((agent) => (
      agent.id === id ? { ...agent, enabled } : agent
    )));

    if (!savedAgent) return;

    setSyncingCustomEnabledIds((prev) => ({ ...prev, [id]: true }));
    const nextSavedCustomAgents = savedCustomAgents.map((agent) => (
      agent.id === id ? { ...agent, enabled } : agent
    ));

    try {
      await persistCodeAgents([
        ...buildBuiltInEntries(savedAgentCustomSettings),
        ...nextSavedCustomAgents,
      ]);
      setSavedCustomAgents(nextSavedCustomAgents);
    } catch (error) {
      setCustomAgents((prev) => prev.map((agent) => (
        agent.id === id ? { ...agent, enabled: savedAgent.enabled !== false } : agent
      )));
      toastManager.add({
        title: 'Failed to update agent visibility',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setSyncingCustomEnabledIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, [persistCodeAgents, savedAgentCustomSettings, savedCustomAgents]);

  const handleSaveIdleTimeout = React.useCallback(async () => {
    setSavingIdleTimeout(true);
    try {
      await agentBehaviourSettingsApi.update({
        idle_session_timeout_mins: idleSessionTimeoutMins,
      });
      setSavedIdleSessionTimeoutMins(idleSessionTimeoutMins);
    } finally {
      setSavingIdleTimeout(false);
    }
  }, [idleSessionTimeoutMins]);

  const loadLlmConfig = React.useCallback(async () => {
    setIsLlmConfigLoading(true);
    try {
      const config = await llmProvidersApi.get();
      setLlmConfig(config);
    } catch (error) {
      toastManager.add({
        title: 'Failed to load LLM settings',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setIsLlmConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadLlmConfig();
  }, [isOpen, loadLlmConfig]);

  useEffect(() => {
    const testUnsubscribeRef = providerTestUnsubscribeRef;
    return () => {
      const unsubscribers = Object.values(testUnsubscribeRef.current);
      unsubscribers.forEach((unsubscribe) => {
        unsubscribe?.();
      });
    };
  }, []);

  const resolvedActiveSection = activeSection ?? 'about';
  const activeSectionMeta = SETTINGS_SECTIONS.find((section) => section.id === resolvedActiveSection) ?? SETTINGS_SECTIONS[0];

  const handleProviderEnabledChange = React.useCallback(async (providerId: string, enabled: boolean) => {
    if (!llmConfig?.providers?.[providerId]) return;

    const nextConfig: LlmProvidersFile = {
      ...llmConfig,
      providers: {
        ...llmConfig.providers,
        [providerId]: {
          ...llmConfig.providers[providerId],
          enabled,
        },
      },
    };

    setProviderToggleId(providerId);
    setLlmConfig(nextConfig);

    try {
      await llmProvidersApi.update(nextConfig);
    } catch (error) {
      setLlmConfig(llmConfig);
      toastManager.add({
        title: 'Failed to update provider',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setProviderToggleId(null);
    }
  }, [llmConfig]);

  const handleLlmConfigUpdate = React.useCallback(async (
    key: string,
    updater: (current: LlmProvidersFile) => LlmProvidersFile,
  ) => {
    if (!llmConfig) return;

    const previousConfig = llmConfig;
    const nextConfig = updater(previousConfig);

    setRoutingSavingKey(key);
    setLlmConfig(nextConfig);

    try {
      await llmProvidersApi.update(nextConfig);
    } catch (error) {
      setLlmConfig(previousConfig);
      toastManager.add({
        title: 'Failed to update routing',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setRoutingSavingKey(null);
    }
  }, [llmConfig]);

  const runProviderTest = React.useCallback(async (
    providerId: string,
    provider: NonNullable<LlmProvidersFile['providers'][string]>,
  ) => {
    providerTestUnsubscribeRef.current[providerId]?.();

    const streamId = crypto.randomUUID();
    let streamedOutput = '';

    setProviderTests((current) => ({
      ...current,
      [providerId]: {
        open: true,
        status: 'testing',
        output: '',
      },
    }));

    providerTestUnsubscribeRef.current[providerId] = useWebSocketStore
      .getState()
      .onEvent('llm_provider_test_chunk', (payload) => {
        if (
          typeof payload !== 'object' ||
          payload === null ||
          (payload as { stream_id?: unknown }).stream_id !== streamId
        ) {
          return;
        }

        const chunk = (payload as { chunk?: unknown }).chunk;
        if (typeof chunk !== 'string' || chunk.length === 0) return;

        streamedOutput += chunk;
        setProviderTests((current) => ({
          ...current,
          [providerId]: {
            open: true,
            status: 'testing',
            output: streamedOutput,
          },
        }));
      });

    try {
      const result = await llmProvidersApi.testProvider({
        stream_id: streamId,
        provider_id: providerId,
        provider,
      });
      setProviderTests((current) => ({
        ...current,
        [providerId]: {
          open: true,
          status: 'pass',
          output: streamedOutput || result.text || '',
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setProviderTests((current) => ({
        ...current,
        [providerId]: {
          open: true,
          status: 'fail',
          output: streamedOutput
            ? `${streamedOutput}\n\n[ERROR] ${message}`
            : `[ERROR] ${message}`,
        },
      }));
    } finally {
      providerTestUnsubscribeRef.current[providerId]?.();
      providerTestUnsubscribeRef.current[providerId] = null;
    }
  }, []);

  const handleToggleBrowserNotifications = React.useCallback(async (checked: boolean) => {
    if (checked) {
      const granted = await requestBrowserNotificationPermission();
      if (!granted) {
        toastManager.add({
          title: 'Browser notification permission denied',
          description: 'Please allow notifications in your browser settings.',
          type: 'error',
        });
        return;
      }
    }
    void updateNotifyField('browser_notification', checked);
  }, [updateNotifyField]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} className="h-[min(90vh,820px)] w-[min(96vw,1360px)] max-w-[min(96vw,1360px)] overflow-hidden border-border bg-background p-0 sm:!max-w-[min(96vw,1360px)]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Manage ATMOS settings, product information, and desktop updates.
        </DialogDescription>

        <div className="grid h-full min-h-0 grid-cols-[240px_minmax(0,1fr)]">
          <SettingsModalSidebar
            activeSection={resolvedActiveSection}
            onSelectSection={(sectionId) => void setActiveSection(sectionId)}
          />

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="px-8 py-4">
              <h2 className="text-[28px] font-semibold tracking-tight text-foreground">
                {activeSectionMeta.label}
              </h2>
              <p className="mt-1 max-w-md text-sm leading-5 text-muted-foreground">
                {activeSectionMeta.description}
              </p>
            </div>
            <div className="px-8">
              <div className="border-b border-border" />
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="size-full">
                <div className="px-8 py-6">
                  <SettingsModalSections
                    activeSection={resolvedActiveSection}
                    appVersion={appVersion}
                    cliVersionInfo={cliVersionInfo}
                    isInstallingCli={isInstallingCli}
                    isCheckingCliVersion={isCheckingCliVersion}
                    isCheckingDesktopUpdate={isCheckingDesktopUpdate}
                    status={status}
                    onInstallCli={() => void handleInstallCli()}
                    onCheckCliVersion={() => void handleCheckCliVersion()}
                    onCheckForUpdate={() => void handleCheckForUpdate()}
                    fileLinkOpenMode={fileLinkOpenMode}
                    fileLinkOpenApp={fileLinkOpenApp}
                    useLastSplitAgentOnSplit={useLastSplitAgentOnSplit}
                    lastSplitAgentId={lastSplitAgentId}
                    setFileLinkOpenMode={setFileLinkOpenMode}
                    setFileLinkOpenApp={setFileLinkOpenApp}
                    setUseLastSplitAgentOnSplit={setUseLastSplitAgentOnSplit}
                    agentCustomSettings={agentCustomSettings}
                    agentSettingsLoading={agentSettingsLoading}
                    builtInAgentOpen={builtInAgentOpen}
                    builtInAgentsExpanded={builtInAgentsExpanded}
                    customAgentOpen={customAgentOpen}
                    customAgents={customAgents}
                    customAgentsExpanded={customAgentsExpanded}
                    idleSessionTimeoutMins={idleSessionTimeoutMins}
                    removingCustomAgentIds={removingCustomAgentIds}
                    savedAgentCustomSettings={savedAgentCustomSettings}
                    savedCustomAgents={savedCustomAgents}
                    savedIdleSessionTimeoutMins={savedIdleSessionTimeoutMins}
                    savingBuiltInAgentIds={savingBuiltInAgentIds}
                    savingCustomAgentIds={savingCustomAgentIds}
                    savingIdleTimeout={savingIdleTimeout}
                    syncingBuiltInEnabledIds={syncingBuiltInEnabledIds}
                    syncingCustomEnabledIds={syncingCustomEnabledIds}
                    onAddCustomAgent={handleAddCustomAgent}
                    onAgentSettingChange={handleAgentSettingChange}
                    onBuiltInEnabledChange={(agentId, enabled) => {
                      void handleBuiltInEnabledChange(agentId, enabled);
                    }}
                    onCustomAgentChange={handleCustomAgentChange}
                    onCustomAgentEnabledChange={(id, enabled) => {
                      void handleCustomAgentEnabledChange(id, enabled);
                    }}
                    onRemoveCustomAgent={handleRemoveCustomAgent}
                    onSaveBuiltInAgent={(agentId) => {
                      void handleSaveBuiltInAgent(agentId);
                    }}
                    onSaveCustomAgent={(id) => {
                      void handleSaveCustomAgent(id);
                    }}
                    onSaveIdleTimeout={() => {
                      void handleSaveIdleTimeout();
                    }}
                    setBuiltInAgentOpen={setBuiltInAgentOpen}
                    setBuiltInAgentsExpanded={setBuiltInAgentsExpanded}
                    setCustomAgentOpen={setCustomAgentOpen}
                    setCustomAgentsExpanded={setCustomAgentsExpanded}
                    setIdleSessionTimeoutMins={setIdleSessionTimeoutMins}
                    handleLlmConfigUpdate={handleLlmConfigUpdate}
                    handleProviderEnabledChange={handleProviderEnabledChange}
                    isLlmConfigLoading={isLlmConfigLoading}
                    llmConfig={llmConfig}
                    loadLlmConfig={loadLlmConfig}
                    providerTests={providerTests}
                    providerToggleId={providerToggleId}
                    providersExpanded={providersExpanded}
                    routingExpanded={routingExpanded}
                    routingSavingKey={routingSavingKey}
                    runProviderTest={runProviderTest}
                    sessionTitleFormatOpen={sessionTitleFormatOpen}
                    setProviderDialogState={setProviderDialogState}
                    setProviderTests={setProviderTests}
                    setProvidersExpanded={setProvidersExpanded}
                    setRoutingExpanded={setRoutingExpanded}
                    setSessionTitleFormatOpen={setSessionTitleFormatOpen}
                    notifySettings={notifySettings}
                    isNotifyLoading={isNotifyLoading}
                    isNotifySaving={isNotifySaving}
                    onToggleBrowserNotifications={handleToggleBrowserNotifications}
                    onToggleDesktopNotifications={(checked) => void updateNotifyField('desktop_notification', checked)}
                    onTestBrowserNotification={() => sendBrowserNotification(TEST_NOTIFICATION_PAYLOAD)}
                    onTestDesktopNotification={() => showDesktopNotification(TEST_NOTIFICATION_PAYLOAD)}
                    onTogglePermissionRequestNotification={(checked) => void updateNotifyField('notify_on_permission_request', checked)}
                    onToggleTaskCompleteNotification={(checked) => void updateNotifyField('notify_on_task_complete', checked)}
                    onAddPushServer={addPushServer}
                    onRemovePushServer={removePushServer}
                    onUpdatePushServer={updatePushServer}
                    onTestPushServer={testPushServer}
                  />
                </div>
              </ScrollArea>
            </div>
          </section>
        </div>

        <LlmProviderEditorDialog
          open={providerDialogState.open}
          providerId={providerDialogState.providerId}
          onOpenChange={(open) =>
            setProviderDialogState((current) => ({ ...current, open }))
          }
          onSaved={() => {
            void loadLlmConfig();
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
