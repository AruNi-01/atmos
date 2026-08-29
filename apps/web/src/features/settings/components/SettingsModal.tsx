'use client';

import React, { useState, useEffect, useRef, type ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryState } from 'nuqs';
import {
  ScrollArea,
  SidebarInset,
  SidebarProvider,
  toastManager,
} from '@workspace/ui';
import { AGENT_OPTIONS } from '@/features/wiki/components/AgentSelect';
import { useTerminalLinkSettingsStore } from '@/features/settings/store/terminal-link-settings-store';
import { useTerminalRichInputSettingsStore } from '@/features/settings/store/terminal-rich-input-settings-store';
import { useTerminalSideChatSettingsStore } from '@/features/settings/store/terminal-side-chat-settings-store';
import { useWorkspaceSurfaceCacheStore } from '@/features/workspace/store/use-workspace-surface-cache-store';
import { useTerminalSplitPrefsStore } from '@/features/settings/store/terminal-split-prefs-store';
import {
  agentBehaviourSettingsApi,
  codeAgentCustomApi,
  type CodeAgentCustomEntry,
  functionSettingsApi,
  llmProvidersApi,
  type LlmProvidersFile,
} from '@/api/ws-api';
import { readSavedRunConfigs, type TerminalAgentSavedRunConfig } from '@/features/agent/lib/terminal-agent-run-config';
import { setAgentYoloMode } from '@/features/agent/lib/terminal-agent-yolo';
import { LlmProviderEditorDialog } from '@/app-shell/LlmProvidersModal';
import { buildLocalAgentOptions } from '@/app-shell/llm-providers-modal-utils';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import { settingsModalParams } from '@/shared/lib/nuqs/searchParams';
import { useNotificationSettingsStore } from '@/features/settings/store/notification-settings-store';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';

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
import { SettingsPageTabs } from '@/features/settings/components/SettingsPageTabs';
import {
  SETTINGS_SEARCH_HIGHLIGHT_STORAGE_KEY,
  type SettingsSectionId,
} from '@/features/settings/components/settings-modal-data';
import { settingsSectionDomId } from '@/features/settings/components/settings/SettingsGroupCard';
import { SettingsModalSidebar } from '@/features/settings/components/settings-modal-sidebar';
import {
  rememberSettingsTab,
  resolveSettingsTab,
} from '@/features/settings/lib/settings-last-section';
import { useSettingsUpdateActions } from '@/features/settings/components/use-settings-update-actions';
import { useSettingsGroupTab } from '@/features/settings/hooks/use-settings-group-tab';
import { leaveSettingsPage } from '@/features/settings/lib/open-settings';
import {
  isForeignSettingsGroupTabHash,
  readSettingsHash,
  replaceSettingsGroupHash,
} from '@/features/settings/lib/settings-section-group-tabs';
import {
  Blocks,
  Computer,
  FileCode,
  FlaskConical,
  FolderKanban,
  Globe,
  Info,
  Monitor,
  Presentation,
  SunMoon,
  Tags,
  Waypoints,
} from 'lucide-react';
import { isCancelledError } from '@/shared/lib/is-cancelled-error';
import { useAppRouter } from '@/shared/hooks/use-app-router';
import { useDesktopTrafficLightsPadding } from '@/shared/hooks/use-desktop-traffic-lights-padding';

type CssHighlightRegistry = {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
};

const SETTINGS_CONTENT_HIGHLIGHT_NAME = 'settings-search-match';
const SETTINGS_CONTENT_HIGHLIGHT_STYLE_ID = 'settings-search-highlight-style';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const toCamelCase = (str: string) => str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());

const SETTINGS_GROUP_TAB_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  appearance: SunMoon,
  about: Info,
  experiments: FlaskConical,
  editor: FileCode,
  canvas: Presentation,
  workspace: FolderKanban,
  labels: Tags,
  'atmos-computer': Computer,
  'tunnel-connector': Waypoints,
  integrations: Blocks,
  browser: Globe,
  'desktop-use': Monitor,
};

function buildSettingsSearchTerms(query: string) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  return Array.from(
    new Map(
      [
        trimmedQuery,
        ...trimmedQuery.split(/\s+/),
      ]
        .map((term) => term.trim())
        .filter(Boolean)
        .map((term) => [term.toLowerCase(), term] as const),
    ).values(),
  ).sort((a, b) => b.length - a.length);
}

function getCssHighlightRegistry(): CssHighlightRegistry | null {
  if (typeof CSS === 'undefined') return null;
  return (CSS as unknown as { highlights?: CssHighlightRegistry }).highlights ?? null;
}

function getHighlightConstructor(): (new (...ranges: Range[]) => unknown) | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight ?? null;
}

function ensureSettingsHighlightStyle() {
  if (typeof document === 'undefined' || document.getElementById(SETTINGS_CONTENT_HIGHLIGHT_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = SETTINGS_CONTENT_HIGHLIGHT_STYLE_ID;
  style.textContent = `
::highlight(${SETTINGS_CONTENT_HIGHLIGHT_NAME}) {
  background-color: rgb(96 165 250 / 0.38);
  color: inherit;
}
`;
  document.head.appendChild(style);
}

function collectSettingsSearchRanges(root: HTMLElement, terms: string[]) {
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;

        const parent = node.parentElement;
        if (!parent || parent.closest('input, textarea, select, script, style, [contenteditable="true"]')) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  while (walker.nextNode() && ranges.length < 500) {
    const node = walker.currentNode;
    const text = node.nodeValue ?? '';
    pattern.lastIndex = 0;

    let match = pattern.exec(text);
    while (match && ranges.length < 500) {
      const start = match.index;
      const end = start + match[0].length;

      if (end > start) {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        ranges.push(range);
      }

      if (pattern.lastIndex === match.index) {
        pattern.lastIndex += 1;
      }
      match = pattern.exec(text);
    }
  }

  return ranges;
}

function useSettingsContentHighlight(
  contentElement: HTMLElement | null,
  query: string,
  activeSection: SettingsSectionId,
) {
  useEffect(() => {
    const registry = getCssHighlightRegistry();
    const HighlightCtor = getHighlightConstructor();
    registry?.delete(SETTINGS_CONTENT_HIGHLIGHT_NAME);

    if (!registry || !HighlightCtor) return undefined;

    const root = contentElement;
    const terms = buildSettingsSearchTerms(query);
    if (!root || terms.length === 0) {
      return () => registry.delete(SETTINGS_CONTENT_HIGHLIGHT_NAME);
    }

    ensureSettingsHighlightStyle();

    const refreshHighlight = () => {
      registry.delete(SETTINGS_CONTENT_HIGHLIGHT_NAME);
      const ranges = collectSettingsSearchRanges(root, terms);
      if (ranges.length > 0) {
        registry.set(SETTINGS_CONTENT_HIGHLIGHT_NAME, new HighlightCtor(...ranges));
      }
    };

    refreshHighlight();

    const observer = new MutationObserver(refreshHighlight);
    observer.observe(root, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      registry.delete(SETTINGS_CONTENT_HIGHLIGHT_NAME);
    };
  }, [activeSection, contentElement, query]);
}

export function SettingsPage({ onLeave }: { onLeave?: () => void } = {}) {
  const t = useTranslations('settings.modal');
  const router = useAppRouter();
  const needsTrafficLightsPadding = useDesktopTrafficLightsPadding();
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
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');
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
  const [providerTests, setProviderTests] = useState<ProviderTestState>({});
  const [settingsContentElement, setSettingsContentElement] = useState<HTMLElement | null>(null);
  const providerTestUnsubscribeRef = useRef<Record<string, (() => void) | null>>({});
  // Code Agent settings persisted in ~/.atmos/agent/terminal_code_agent.json
  const [agentCustomSettings, setAgentCustomSettings] = useState<Record<string, { cmd?: string; flags?: string; interactiveFlags?: string; enabled?: boolean }>>({});
  const [savedAgentCustomSettings, setSavedAgentCustomSettings] = useState<Record<string, { cmd?: string; flags?: string; interactiveFlags?: string; enabled?: boolean }>>({});
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
  const [followupPolicy, setFollowupPolicy] = useState<"queue" | "steer">("queue");
  const [savedFollowupPolicy, setSavedFollowupPolicy] = useState<"queue" | "steer">("queue");
  const [savedIdleSessionTimeoutMins, setSavedIdleSessionTimeoutMins] = useState<number>(30);
  const [attentionSummaryEnabled, setAttentionSummaryEnabled] = useState(true);
  const [savedAttentionSummaryEnabled, setSavedAttentionSummaryEnabled] = useState(true);
  const [attentionSummaryDelayMins, setAttentionSummaryDelayMins] = useState(5);
  const [savedAttentionSummaryDelayMins, setSavedAttentionSummaryDelayMins] = useState(5);
  const [attentionSummaryAgentId, setAttentionSummaryAgentId] = useState("");
  const [savedAttentionSummaryAgentId, setSavedAttentionSummaryAgentId] = useState("");
  const [attentionSummaryModel, setAttentionSummaryModel] = useState("");
  const [savedAttentionSummaryModel, setSavedAttentionSummaryModel] = useState("");
  const [savingIdleTimeout, setSavingIdleTimeout] = useState(false);
  const [savedRunConfigs, setSavedRunConfigs] = useState<TerminalAgentSavedRunConfig[]>([]);
  const [runConfigsLoading, setRunConfigsLoading] = useState(false);
  const [savingRunConfigs, setSavingRunConfigs] = useState(false);
  const [yoloMode, setYoloMode] = useState(true);
  const [yoloModeSyncing, setYoloModeSyncing] = useState(false);
  const [yoloModeRestoring, setYoloModeRestoring] = useState(false);
  const getErrorDescription = React.useCallback(
    (error: unknown) => (error instanceof Error ? error.message : t('unknownError')),
    [t],
  );
  const {
    fileLinkOpenMode,
    fileLinkOpenApp,
    loadSettings: loadTerminalLinkSettings,
    setFileLinkOpenMode,
    setFileLinkOpenApp,
  } = useTerminalLinkSettingsStore();
  const loadTerminalSplitPrefs = useTerminalSplitPrefsStore((state) => state.loadSettings);
  const {
    sideContextPromptBudgetBytes,
    loadSettings: loadTerminalSideChatSettings,
    setSideContextPromptBudgetBytes,
  } = useTerminalSideChatSettingsStore();
  const {
    enabled: richInputEnabled,
    triggerBarVisible: richInputTriggerBarVisible,
    loadSettings: loadTerminalRichInputSettings,
    setEnabled: setRichInputEnabled,
    setTriggerBarVisible: setRichInputTriggerBarVisible,
  } = useTerminalRichInputSettingsStore();
  const maxWarmWorkspaces = useWorkspaceSurfaceCacheStore((state) => state.maxWarmWorkspaces);
  const maxGlobalTerminalPanes = useWorkspaceSurfaceCacheStore((state) => state.maxGlobalTerminalPanes);
  const setMaxWarmWorkspaces = useWorkspaceSurfaceCacheStore((state) => state.setMaxWarmWorkspaces);
  const setMaxGlobalTerminalPanes = useWorkspaceSurfaceCacheStore((state) => state.setMaxGlobalTerminalPanes);
  const loadWorkspaceSurfaceSettings = useWorkspaceSurfaceCacheStore((state) => state.loadSettings);

  useEffect(() => {
    void loadTerminalLinkSettings();
    void loadTerminalSideChatSettings();
    void loadTerminalRichInputSettings();
    void loadWorkspaceSurfaceSettings();
    void loadTerminalSplitPrefs();
  }, [
    loadTerminalSplitPrefs,
    loadTerminalLinkSettings,
    loadTerminalRichInputSettings,
    loadTerminalSideChatSettings,
    loadWorkspaceSurfaceSettings,
  ]);

  // Load agent custom settings when modal opens
  const loadAgentSettings = React.useCallback(async () => {
    setAgentSettingsLoading(true);
    setRunConfigsLoading(true);
    try {
      const [customData, behaviourData, functionSettings] = await Promise.all([
        codeAgentCustomApi.get(),
        agentBehaviourSettingsApi.get(),
        useFunctionSettingsStore.getState().load(),
      ]);
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

      const timeout = behaviourData?.idle_session_timeout_mins ?? 30;
      setIdleSessionTimeoutMins(timeout);
      setSavedIdleSessionTimeoutMins(timeout);
      const followup = behaviourData?.followup_policy === "steer" ? "steer" : "queue";
      setFollowupPolicy(followup);
      setSavedFollowupPolicy(followup);
      const summaryEnabled = behaviourData?.attention_summary_enabled ?? true;
      setAttentionSummaryEnabled(summaryEnabled);
      setSavedAttentionSummaryEnabled(summaryEnabled);
      const summaryDelay = behaviourData?.attention_summary_delay_mins ?? 5;
      setAttentionSummaryDelayMins(summaryDelay);
      setSavedAttentionSummaryDelayMins(summaryDelay);
      const summaryAgent = behaviourData?.attention_summary_agent_id ?? "";
      setAttentionSummaryAgentId(summaryAgent || "");
      setSavedAttentionSummaryAgentId(summaryAgent || "");
      const summaryModel = behaviourData?.attention_summary_model ?? "";
      setAttentionSummaryModel(summaryModel || "");
      setSavedAttentionSummaryModel(summaryModel || "");

      const agentCli = (functionSettings as Record<string, unknown>)?.agent_cli as
        | Record<string, unknown>
        | undefined;
      setSavedRunConfigs(readSavedRunConfigs(agentCli?.saved_run_configs));
      setYoloMode(
        typeof agentCli?.yolo_mode === "boolean" ? agentCli.yolo_mode : true,
      );
    } catch {
      // ignore
    } finally {
      setAgentSettingsLoading(false);
      setRunConfigsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgentSettings();
  }, [loadAgentSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pendingHighlightQuery = window.sessionStorage.getItem(SETTINGS_SEARCH_HIGHLIGHT_STORAGE_KEY);
    if (!pendingHighlightQuery) return;

    setSettingsSearchQuery(pendingHighlightQuery);
    window.sessionStorage.removeItem(SETTINGS_SEARCH_HIGHLIGHT_STORAGE_KEY);
  }, []);

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
    void loadNotifySettings();
  }, [loadNotifySettings]);

  const persistCodeAgents = React.useCallback(async (agents: CodeAgentCustomEntry[]) => {
    const nextAgents = dedupeCodeAgentEntries(agents);
    await codeAgentCustomApi.update(nextAgents);
    return nextAgents;
  }, []);

  const handleAgentSettingChange = React.useCallback((agentId: string, field: 'cmd' | 'flags' | 'interactiveFlags' | 'enabled', value: string | boolean) => {
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
        (AGENT_OPTIONS.find((agent) => agent.id === agentId)?.params || '') &&
      (nextBuiltInSettings[agentId]?.interactiveFlags ?? (AGENT_OPTIONS.find((agent) => agent.id === agentId)?.interactiveParams || '')) ===
        (AGENT_OPTIONS.find((agent) => agent.id === agentId)?.interactiveParams || '')
    ) {
      delete nextBuiltInSettings[agentId];
    }

    setSavingBuiltInAgentIds((prev) => ({ ...prev, [agentId]: true }));
    try {
      const nextBuiltInEntries = buildBuiltInEntries(nextBuiltInSettings, yoloMode);
      await persistCodeAgents([
        ...savedCustomAgents,
        ...nextBuiltInEntries,
      ]);
      setSavedAgentCustomSettings(nextBuiltInSettings);
    } catch (error) {
      toastManager.add({
        title: t('errors.saveBuiltInAgentTitle'),
        description: getErrorDescription(error),
        type: 'error',
      });
    } finally {
      setSavingBuiltInAgentIds((prev) => {
        const next = { ...prev };
        delete next[agentId];
        return next;
      });
    }
  }, [agentCustomSettings, persistCodeAgents, savedAgentCustomSettings, savedCustomAgents, yoloMode]);

  const handleYoloModeChange = React.useCallback(async (enabled: boolean) => {
    const previous = yoloMode;
    setYoloMode(enabled);
    setYoloModeSyncing(true);
    try {
      await setAgentYoloMode(enabled);
    } catch (error) {
      setYoloMode(previous);
      toastManager.add({
        title: t('errors.updateYoloModeTitle'),
        description: getErrorDescription(error),
        type: 'error',
      });
    } finally {
      setYoloModeSyncing(false);
    }
  }, [getErrorDescription, t, yoloMode]);

  /** Enable YOLO and clear built-in flag overrides so manifests reapply. */
  const handleRestoreAllYoloMode = React.useCallback(async () => {
    setYoloModeRestoring(true);
    try {
      await setAgentYoloMode(true);
      setYoloMode(true);
      // Keep enabled/cmd overrides only; drop flags so YOLO defaults apply.
      const nextBuiltIn: Record<string, { cmd?: string; flags?: string; interactiveFlags?: string; enabled?: boolean }> = {};
      for (const [id, draft] of Object.entries(savedAgentCustomSettings)) {
        const base = AGENT_OPTIONS.find((agent) => agent.id === id);
        if (!base) continue;
        const keepCmd = draft.cmd && draft.cmd !== base.cmd ? draft.cmd : undefined;
        const keepEnabled = draft.enabled === false ? false : undefined;
        if (keepCmd !== undefined || keepEnabled !== undefined) {
          nextBuiltIn[id] = {};
          if (keepCmd !== undefined) nextBuiltIn[id].cmd = keepCmd;
          if (keepEnabled !== undefined) nextBuiltIn[id].enabled = keepEnabled;
        }
      }
      await persistCodeAgents([
        ...savedCustomAgents,
        ...buildBuiltInEntries(nextBuiltIn, true),
      ]);
      setAgentCustomSettings(nextBuiltIn);
      setSavedAgentCustomSettings(nextBuiltIn);
    } catch (error) {
      toastManager.add({
        title: t('errors.restoreYoloModeTitle'),
        description: getErrorDescription(error),
        type: 'error',
      });
    } finally {
      setYoloModeRestoring(false);
    }
  }, [getErrorDescription, persistCodeAgents, savedAgentCustomSettings, savedCustomAgents, t]);

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
      (nextSavedBuiltInSettings[agentId]?.interactiveFlags ?? (AGENT_OPTIONS.find((agent) => agent.id === agentId)?.interactiveParams || '')) ===
        (AGENT_OPTIONS.find((agent) => agent.id === agentId)?.interactiveParams || '') &&
      (nextSavedBuiltInSettings[agentId]?.enabled ?? true) === true
    ) {
      delete nextSavedBuiltInSettings[agentId];
    }

    try {
      await persistCodeAgents([
        ...savedCustomAgents,
        ...buildBuiltInEntries(nextSavedBuiltInSettings, yoloMode),
      ]);
      setSavedAgentCustomSettings(nextSavedBuiltInSettings);
    } catch (error) {
      setAgentCustomSettings((prev) => ({
        ...prev,
        [agentId]: { ...prev[agentId], enabled: previousEnabled },
      }));
      toastManager.add({
        title: t('errors.updateAgentVisibilityTitle'),
        description: getErrorDescription(error),
        type: 'error',
      });
    } finally {
      setSyncingBuiltInEnabledIds((prev) => {
        const next = { ...prev };
        delete next[agentId];
        return next;
      });
    }
  }, [persistCodeAgents, savedAgentCustomSettings, savedCustomAgents, yoloMode]);

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
        title: t('errors.removeCustomAgentTitle'),
        description: getErrorDescription(error),
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
        title: t('errors.customAgentIncompleteTitle'),
        description: t('errors.customAgentIncompleteDescription'),
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
        title: t('errors.saveCustomAgentTitle'),
        description: getErrorDescription(error),
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
        title: t('errors.updateAgentVisibilityTitle'),
        description: getErrorDescription(error),
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

  const handleCommitBehaviourSettings = React.useCallback(
    async (values: {
      idleSessionTimeoutMins: number;
      attentionSummaryEnabled: boolean;
      attentionSummaryDelayMins: number;
      attentionSummaryAgentId: string;
      attentionSummaryModel: string;
      followupPolicy: "queue" | "steer";
    }) => {
      setSavingIdleTimeout(true);
      // Keep controlled inputs in sync when the commit carries clamped/normalized values.
      setIdleSessionTimeoutMins(values.idleSessionTimeoutMins);
      setAttentionSummaryEnabled(values.attentionSummaryEnabled);
      setAttentionSummaryDelayMins(values.attentionSummaryDelayMins);
      setAttentionSummaryAgentId(values.attentionSummaryAgentId);
      setAttentionSummaryModel(values.attentionSummaryModel);
      setFollowupPolicy(values.followupPolicy);
      try {
        await agentBehaviourSettingsApi.update({
          idle_session_timeout_mins: values.idleSessionTimeoutMins,
          attention_summary_enabled: values.attentionSummaryEnabled,
          attention_summary_delay_mins: values.attentionSummaryDelayMins,
          attention_summary_agent_id: values.attentionSummaryAgentId,
          attention_summary_model: values.attentionSummaryModel,
          followup_policy: values.followupPolicy,
        });
        setSavedIdleSessionTimeoutMins(values.idleSessionTimeoutMins);
        setSavedAttentionSummaryEnabled(values.attentionSummaryEnabled);
        setSavedAttentionSummaryDelayMins(values.attentionSummaryDelayMins);
        setSavedAttentionSummaryAgentId(values.attentionSummaryAgentId);
        setSavedAttentionSummaryModel(values.attentionSummaryModel);
        setSavedFollowupPolicy(values.followupPolicy);
      } catch (error) {
        toastManager.add({
          title: t('errors.saveBehaviourTitle'),
          description: getErrorDescription(error),
          type: 'error',
        });
      } finally {
        setSavingIdleTimeout(false);
      }
    },
    [getErrorDescription, t],
  );

  const loadLlmConfig = React.useCallback(async () => {
    setIsLlmConfigLoading(true);
    try {
      const config = await llmProvidersApi.get();
      setLlmConfig(config);
    } catch (error) {
      if (isCancelledError(error)) return;
      toastManager.add({
        title: t('errors.loadLlmSettingsTitle'),
        description: getErrorDescription(error),
        type: 'error',
      });
    } finally {
      setIsLlmConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLlmConfig();
  }, [loadLlmConfig]);

  useEffect(() => {
    const testUnsubscribeRef = providerTestUnsubscribeRef;
    return () => {
      const unsubscribers = Object.values(testUnsubscribeRef.current);
      unsubscribers.forEach((unsubscribe) => {
        unsubscribe?.();
      });
    };
  }, []);

  const resolvedActiveSection = resolveSettingsTab(activeSection);

  useEffect(() => {
    rememberSettingsTab(resolvedActiveSection);
    if (activeSection == null) {
      void setActiveSection(resolvedActiveSection);
    }
  }, [activeSection, resolvedActiveSection, setActiveSection]);

  const { groupTabs, groupTab, selectGroupTab } = useSettingsGroupTab(
    resolvedActiveSection,
    settingsSearchQuery,
  );
  useSettingsContentHighlight(settingsContentElement, settingsSearchQuery, resolvedActiveSection);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(settingsSectionDomId(hash))?.scrollIntoView({
        block: 'start',
        behavior: 'smooth',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [groupTab, resolvedActiveSection]);
  const localAgentOptions = React.useMemo(
    () =>
      buildLocalAgentOptions([
        ...buildBuiltInEntries(savedAgentCustomSettings),
        ...savedCustomAgents,
      ]),
    [savedAgentCustomSettings, savedCustomAgents],
  );
  const runConfigAgentOptions = React.useMemo(() => {
    const builtIns = AGENT_OPTIONS.map((agent) => ({ id: agent.id, label: agent.label }));
    const customs = customAgents
      .filter((agent) => agent.label.trim())
      .map((agent) => ({ id: agent.id, label: agent.label.trim() }));
    const merged = [...builtIns];
    for (const agent of customs) {
      if (!merged.some((item) => item.id === agent.id)) {
        merged.push(agent);
      }
    }
    for (const config of savedRunConfigs) {
      if (!merged.some((item) => item.id === config.agent_id)) {
        merged.push({ id: config.agent_id, label: config.agent_id });
      }
    }
    return merged;
  }, [customAgents, savedRunConfigs]);

  const handleSaveRunConfigs = React.useCallback(async (configs: TerminalAgentSavedRunConfig[]) => {
    setSavingRunConfigs(true);
    try {
      await functionSettingsApi.update('agent_cli', 'saved_run_configs', configs);
      setSavedRunConfigs(configs);
      useFunctionSettingsStore.getState().invalidate();
      void useFunctionSettingsStore.getState().load();
    } catch (error) {
      toastManager.add({
        title: t('errors.saveRunConfigsTitle'),
        description: getErrorDescription(error),
        type: 'error',
      });
      throw error;
    } finally {
      setSavingRunConfigs(false);
    }
  }, []);

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
        title: t('errors.updateProviderTitle'),
        description: getErrorDescription(error),
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
        title: t('errors.updateRoutingTitle'),
        description: getErrorDescription(error),
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
          title: t('errors.browserNotificationPermissionDeniedTitle'),
          description: t('errors.browserNotificationPermissionDeniedDescription'),
          type: 'error',
        });
        return;
      }
    }
    void updateNotifyField('browser_notification', checked);
  }, [updateNotifyField]);

  const leaveSettings = React.useCallback(() => {
    if (onLeave) {
      onLeave();
      return;
    }
    leaveSettingsPage(router);
  }, [onLeave, router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      if (providerDialogState.open) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('[role="dialog"], [data-slot="dialog-content"]')
      ) {
        return;
      }
      if (settingsSearchQuery.trim()) {
        event.preventDefault();
        setSettingsSearchQuery('');
        return;
      }
      event.preventDefault();
      leaveSettings();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [leaveSettings, providerDialogState.open, settingsSearchQuery]);

  return (
    <div className="desktop-no-drag flex h-dvh min-h-0 w-full bg-background">
      <SidebarProvider
        keyboardShortcut={false}
        className="h-full min-h-0 w-full"
        style={{ '--sidebar-width': '240px' } as React.CSSProperties}
      >
        <SettingsModalSidebar
          activeSection={resolvedActiveSection}
          onSelectSection={(sectionId) => {
            void setActiveSection(sectionId);
            const hash = readSettingsHash();
            if (isForeignSettingsGroupTabHash(sectionId, hash)) {
              replaceSettingsGroupHash(null);
            }
          }}
          searchQuery={settingsSearchQuery}
          onSearchQueryChange={setSettingsSearchQuery}
          onBack={leaveSettings}
          trafficLightsPadding={needsTrafficLightsPadding}
        />

        <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
          <section
            ref={setSettingsContentElement}
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          >
          {groupTabs && groupTab ? (
            <div className="px-8 pt-5 pb-1">
              <SettingsPageTabs
                value={groupTab}
                onValueChange={selectGroupTab}
                items={groupTabs.map((tabId) => ({
                  value: tabId,
                  label: t(`sections.${toCamelCase(tabId)}.label`),
                  icon: SETTINGS_GROUP_TAB_ICONS[tabId],
                }))}
              />
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="size-full">
              <div className="px-8 py-6">
                <SettingsModalSections
                    activeSection={resolvedActiveSection}
                    activeGroupTab={groupTab}
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
                    sideContextPromptBudgetBytes={sideContextPromptBudgetBytes}
                    richInputEnabled={richInputEnabled}
                    richInputTriggerBarVisible={richInputTriggerBarVisible}
                    setFileLinkOpenMode={setFileLinkOpenMode}
                    setFileLinkOpenApp={setFileLinkOpenApp}
                    setSideContextPromptBudgetBytes={setSideContextPromptBudgetBytes}
                    setRichInputEnabled={setRichInputEnabled}
                    setRichInputTriggerBarVisible={setRichInputTriggerBarVisible}
                    maxWarmWorkspaces={maxWarmWorkspaces}
                    maxGlobalTerminalPanes={maxGlobalTerminalPanes}
                    setMaxWarmWorkspaces={setMaxWarmWorkspaces}
                    setMaxGlobalTerminalPanes={setMaxGlobalTerminalPanes}
                    agentCustomSettings={agentCustomSettings}
                    agentSettingsLoading={agentSettingsLoading}
                    builtInAgentOpen={builtInAgentOpen}
                    builtInAgentsExpanded={builtInAgentsExpanded}
                    customAgentOpen={customAgentOpen}
                    customAgents={customAgents}
                    customAgentsExpanded={customAgentsExpanded}
                    idleSessionTimeoutMins={idleSessionTimeoutMins}
                    attentionSummaryEnabled={attentionSummaryEnabled}
                    attentionSummaryDelayMins={attentionSummaryDelayMins}
                    attentionSummaryAgentId={attentionSummaryAgentId}
                    attentionSummaryModel={attentionSummaryModel}
                    followupPolicy={followupPolicy}
                    runConfigAgentOptions={runConfigAgentOptions}
                    runConfigsLoading={runConfigsLoading}
                    removingCustomAgentIds={removingCustomAgentIds}
                    savedRunConfigs={savedRunConfigs}
                    savedAgentCustomSettings={savedAgentCustomSettings}
                    savedCustomAgents={savedCustomAgents}
                    savedIdleSessionTimeoutMins={savedIdleSessionTimeoutMins}
                    savedAttentionSummaryEnabled={savedAttentionSummaryEnabled}
                    savedAttentionSummaryDelayMins={savedAttentionSummaryDelayMins}
                    savedAttentionSummaryAgentId={savedAttentionSummaryAgentId}
                    savedAttentionSummaryModel={savedAttentionSummaryModel}
                    savedFollowupPolicy={savedFollowupPolicy}
                    savingBuiltInAgentIds={savingBuiltInAgentIds}
                    savingCustomAgentIds={savingCustomAgentIds}
                    savingIdleTimeout={savingIdleTimeout}
                    savingRunConfigs={savingRunConfigs}
                    syncingBuiltInEnabledIds={syncingBuiltInEnabledIds}
                    syncingCustomEnabledIds={syncingCustomEnabledIds}
                    yoloMode={yoloMode}
                    yoloModeSyncing={yoloModeSyncing}
                    yoloModeRestoring={yoloModeRestoring}
                    onYoloModeChange={(enabled) => {
                      void handleYoloModeChange(enabled);
                    }}
                    onRestoreAllYoloMode={() => {
                      void handleRestoreAllYoloMode();
                    }}
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
                    onCommitBehaviourSettings={(values) => {
                      void handleCommitBehaviourSettings(values);
                    }}
                    onSaveRunConfigs={handleSaveRunConfigs}
                    setBuiltInAgentOpen={setBuiltInAgentOpen}
                    setBuiltInAgentsExpanded={setBuiltInAgentsExpanded}
                    setCustomAgentOpen={setCustomAgentOpen}
                    setCustomAgentsExpanded={setCustomAgentsExpanded}
                    setIdleSessionTimeoutMins={setIdleSessionTimeoutMins}
                    setAttentionSummaryEnabled={setAttentionSummaryEnabled}
                    setAttentionSummaryDelayMins={setAttentionSummaryDelayMins}
                    setAttentionSummaryAgentId={setAttentionSummaryAgentId}
                    setAttentionSummaryModel={setAttentionSummaryModel}
                    setFollowupPolicy={setFollowupPolicy}
                    handleLlmConfigUpdate={handleLlmConfigUpdate}
                    handleProviderEnabledChange={handleProviderEnabledChange}
                    isLlmConfigLoading={isLlmConfigLoading}
                    llmConfig={llmConfig}
                    loadLlmConfig={loadLlmConfig}
                    localAgentOptions={localAgentOptions}
                    providerTests={providerTests}
                    providerToggleId={providerToggleId}
                    providersExpanded={providersExpanded}
                    routingExpanded={routingExpanded}
                    routingSavingKey={routingSavingKey}
                    runProviderTest={runProviderTest}
                    setProviderDialogState={setProviderDialogState}
                    setProviderTests={setProviderTests}
                    setProvidersExpanded={setProvidersExpanded}
                    setRoutingExpanded={setRoutingExpanded}
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
        </SidebarInset>

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
      </SidebarProvider>
    </div>
  );
}

export const SettingsModal = SettingsPage;
