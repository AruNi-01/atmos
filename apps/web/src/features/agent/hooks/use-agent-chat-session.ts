"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";
import { useContextParams } from "@/shared/hooks/use-context-params";
import {
  DEFAULT_CENTER_SPACE_ID,
  parseCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import { useCenterSpaceStore } from "@/app-shell/center-space/center-space-store";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import {
  buildQueuedAgentPromptContent,
  getAgentPromptQueueKey,
  useDialogStore,
} from "@/app-shell/state/use-dialog-store";
import { queryKeys } from "@/api/query/query-keys";
import { getComputerQueryScope } from "@/api/query/query-scope";
import { quotaUsageApi } from "@/api/ws/quota-usage-api";
import { agentChatApi, type AgentOptionsSnapshot } from "@/api/ws/agent-chat-api";
import { agentApi, type RegistryAgent } from "@/api/ws/agent-api";
import { agentApi as agentRestApi } from "@/api/rest-api";
import { agentBehaviourSettingsApi } from "@/api/ws/settings-api";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  useAgentRegistryListQuery,
  useCustomAgentListQuery,
  useNativeChatAgentListQuery,
} from "@/features/agent/hooks/use-agent-registry-query";
import { DEFAULT_AGENT_CHAT_MODE } from "@/features/agent/types/index";
import type {
  AgentChatEvent,
  AgentDescriptor,
  AgentMessage,
  AgentQueueItem,
  AgentSessionUsage,
} from "@atmos/api-types/ws/dto/agent-chat";
import {
  persistAgentChatLastSession,
  readAgentChatLastSessions,
  resolveRestoredAgentChat,
} from "@/features/agent/lib/agent-chat-last-session";
import { mergeContextUsageUpdate } from "@/features/agent/lib/context-window-usage";
import {
  lastNewChatConfigForAgent,
  mergeLastNewChatConfigs,
  pickInstalledRegistryId,
  preferredConfigFromDefault,
} from "@/features/agent/lib/agent-chat-prefs";
import {
  authRequiredFromTurnError,
  DEEPSEEK_HARNESS_ARGS,
  DEEPSEEK_HARNESS_ID,
  DEEPSEEK_API_KEY_ENV,
  mergeInstalledAgents,
  canonicalizeChatProviderId,
  tokenAuthEnvName,
} from "@/features/agent/lib/custom-agent-registry";
import {
  FOOTER_MODAL_CHAT_PREF_KEY,
  workingDirectoriesEqual,
  type AgentChatWorkingDirectory,
} from "@/features/agent/lib/agent-chat-working-directory";
import {
  deriveAgentActivity,
  readDefaultAgentRegistryId,
  runningBackgroundTools,
  writeDefaultAgentRegistryId,
  type PendingPermission,
  type PendingSessionOp,
} from "@/features/agent/lib/chat-helpers";
import {
  buildAgentChatExportableMessages,
  resolveAgentChatLocalPath,
  type UseAgentChatSessionOptions,
} from "./use-agent-chat-session-types";
import { useAgentChatUiHandlers } from "./use-agent-chat-ui-handlers";
import {
  agentChatEventFor,
  currentPlanFromMessages,
  dedupeAgentMessages,
  foldMessagesFromEvent,
} from "@/features/agent/lib/agent-chat-events";
import { routeBusySubmit, resolveFollowupPolicy } from "@/features/agent/lib/followup-policy";
import { isLiveAgentRuntimeStatus } from "@/features/agent/lib/agent-composer-placeholder";
import {
  clockFromElapsedMs,
  isLiveAssistantTurn,
  snapshotLiveElapsedMs,
} from "@/features/agent/lib/agent-chat-timing";
import {
  EMPTY_AGENT_SLASH_COMMANDS,
  normalizeAgentSlashCommands,
  rememberAgentSlashCommands,
  resolveAgentSlashCommands,
  useAgentSlashCommandCache,
  type AgentChatSlashCommand,
} from "@/features/agent/store/agent-slash-command-cache";
import {
  readComposerLocalCache,
  rememberComposerOptions,
  rememberLastNewChatConfigs,
  rememberLastRegistryId,
  seedNewChatComposer,
} from "@/features/agent/store/agent-composer-local-cache";
import {
  agentChatHistoryListRequest,
  composerConfigOptions,
  configKindMatches,
  displayedComposerConfigValue,
  defaultOptionsModelId,
  isOptionsModelsLoading,
  probingOptionsSnapshot,
  chatTitleFromPrompt,
  chatsToHistoryRows,
  parsePlan,
  queueToPrompts,
  thinkingChoices,
  type AgentChatHistoryRow,
} from "@/features/agent/lib/agent-chat-thread";

export type { AgentChatSlashCommand } from "@/features/agent/store/agent-slash-command-cache";

function pendingSessionConfigPatch(
  modelId: string,
  thinkingId: string,
  modeId: string,
  permissionModeId = "",
  fastId = "",
): {
  model?: string;
  thinking?: string;
  mode?: string;
  permission_mode?: string;
  fast?: string;
} {
  return {
    ...(modelId.trim() ? { model: modelId.trim() } : {}),
    ...(thinkingId.trim() ? { thinking: thinkingId.trim() } : {}),
    ...(modeId.trim() ? { mode: modeId.trim() } : {}),
    ...(permissionModeId.trim() ? { permission_mode: permissionModeId.trim() } : {}),
    ...(fastId.trim() ? { fast: fastId.trim() } : {}),
  };
}

function spaceIdForChatCreate(
  paintContextId: string | null | undefined,
  hostId: string | null | undefined,
): string | null {
  if (paintContextId?.trim()) {
    return parseCenterSpaceKey(paintContextId).spaceId;
  }
  const host = hostId?.trim();
  if (!host) return null;
  return useCenterSpaceStore.getState().getActiveSpaceId(host) || DEFAULT_CENTER_SPACE_ID;
}

export function useAgentChatSession({
  variant,
  mode = DEFAULT_AGENT_CHAT_MODE,
  active = true,
  contextOverride,
  transformPrompt,
  instanceKey = null,
  paintContextId = null,
  chatId: chatIdProp,
  resumeTranscript = false,
  onChatStarted,
  onChatUpdated,
  onOpenChat,
}: UseAgentChatSessionOptions & {
  chatId: string;
  resumeTranscript?: boolean;
  onChatStarted?: (id: string, meta?: {
    title?: string | null;
    cwd?: string;
    providerId?: string | null;
    hasMessages?: boolean;
  }) => void;
  onChatUpdated?: (id: string, meta: {
    title?: string | null;
    providerId?: string | null;
    cwd?: string;
    hasMessages?: boolean;
  }) => void;
  onOpenChat?: (id: string) => void;
}) {
  const chatId = chatIdProp.trim();
  const t = useTranslations("agent.chatSessionTypes");
  const tSessionHints = useTranslations("Agent.components.chatPanel.session.hints");
  const urlContext = useContextParams();
  const { workspaceId: urlWorkspaceId, projectId: urlProjectId, effectiveContextId } =
    contextOverride ?? urlContext;
  const projects = useProjects();
  const isPanelOpen = variant === "modal" ? active : active;
  const chatMode = mode;
  const isolatedModal = variant === "modal";
  const lastSessionPrefKey = isolatedModal ? FOOTER_MODAL_CHAT_PREF_KEY : undefined;
  const composerSeed = useMemo(
    () =>
      seedNewChatComposer({
        chatId,
        instanceKey,
        isolatedModal,
        urlWorkspaceId,
        urlProjectId,
        chatMode,
        lastSessionPrefKey,
      }),
    // Mount-only: new tabs paint from local cache instead of waiting on WS.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once
    [],
  );

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [runningTurnId, setRunningTurnId] = useState<string | null>(null);
  const [supportsSteer, setSupportsSteer] = useState(false);
  const [policy, setPolicy] = useState<"queue" | "steer">("queue");
  const [queue, setQueue] = useState<AgentQueueItem[]>([]);
  const [providerId, setProviderIdState] = useState(composerSeed.providerId);
  const [activeChatId, setActiveChatId] = useState(chatId);
  const [modelId, setModelId] = useState(composerSeed.preferred.modelId);
  const [thinkingId, setThinkingId] = useState(composerSeed.preferred.thinkingId);
  const [modeId, setModeId] = useState(composerSeed.preferred.modeId);
  const [permissionModeId, setPermissionModeId] = useState(composerSeed.preferred.permissionModeId);
  const [fastId, setFastId] = useState(composerSeed.preferred.fastId);
  const [catalog, setCatalogState] = useState<AgentOptionsSnapshot | null>(composerSeed.catalog);
  const optionsByAgentRef = useRef<Record<string, AgentOptionsSnapshot>>({
    ...readComposerLocalCache().optionsByAgent,
  });
  const rememberOptions = useCallback((next: AgentOptionsSnapshot | null) => {
    if (!next?.agent_id) return;
    if (next.status === "probing" && next.models.length === 0 && next.modes.length === 0) return;
    optionsByAgentRef.current[next.agent_id] = next;
    rememberComposerOptions(next);
  }, []);
  const setCatalog = useCallback((
    next:
      | AgentOptionsSnapshot
      | null
      | ((current: AgentOptionsSnapshot | null) => AgentOptionsSnapshot | null),
  ) => {
    setCatalogState((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      rememberOptions(resolved);
      return resolved;
    });
  }, [rememberOptions]);
  const [installedAgents, setInstalledAgents] = useState<RegistryAgent[]>(
    composerSeed.installedAgents,
  );
  const [defaultRegistryId, setDefaultRegistryId] = useState(
    composerSeed.lastRegistryId || composerSeed.providerId,
  );
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    isolatedModal ? null : urlWorkspaceId,
  );
  const [projectId, setProjectId] = useState<string | null>(isolatedModal ? null : urlProjectId);
  const [cwd, setCwd] = useState("");
  const [title, setTitle] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [authRequest, setAuthRequest] = useState<{
    message?: string;
    methods: { id: string; name: string; description?: string }[];
  } | null>(null);
  const [selectedAuthMethodId, setSelectedAuthMethodId] = useState("");
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [pendingSessionOp, setPendingSessionOp] = useState<PendingSessionOp | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState<AgentChatHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isResumingHistory, setIsResumingHistory] = useState(
    () => Boolean(chatId) && resumeTranscript,
  );
  const [shouldScrambleAutoTitle, setShouldScrambleAutoTitle] = useState(false);
  const [hydrated, setHydrated] = useState(composerSeed.hydrated);
  const [runtimeStatus, setRuntimeStatus] = useState<string | null>(null);
  const [hasPersistenceHandle, setHasPersistenceHandle] = useState(false);
  const [descriptor, setDescriptor] = useState<AgentDescriptor | null>(null);
  const [sessionCommands, setSessionCommands] = useState<AgentChatSlashCommand[]>([]);
  const [sessionUsage, setSessionUsage] = useState<AgentSessionUsage | null>(null);
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const consumedPrompts = useRef(new Set<string>());
  const lastSeq = useRef(0);
  const hydratingRef = useRef(Boolean(chatId) && resumeTranscript);
  const pendingEventsRef = useRef<AgentChatEvent[]>([]);
  const stoppedRef = useRef(false);
  const pendingSendRef = useRef<{ text: string; attachmentPaths: string[] } | null>(null);
  const lastSentRef = useRef<{ text: string; attachmentPaths: string[] } | null>(null);
  const persistConfigRef = useRef<(patch: {
    provider_id?: string;
    model?: string;
    thinking?: string;
    mode?: string;
    permission_mode?: string;
    fast?: string;
  }) => Promise<void>>(async () => undefined);
  const composerSelectionRef = useRef<() => {
    model: string;
    thinking: string;
    mode: string;
    permissionMode: string;
    fast: string;
    patch: {
      model?: string;
      thinking?: string;
      mode?: string;
      permission_mode?: string;
      fast?: string;
    };
  }>(() => ({
    model: "",
    thinking: "",
    mode: "",
    permissionMode: "",
    fast: "",
    patch: {},
  }));
  const creatingChatRef = useRef<Promise<string> | null>(null);
  const resumeTranscriptRef = useRef(resumeTranscript);
  resumeTranscriptRef.current = resumeTranscript;
  const activeIdRef = useRef(chatId);
  const providerIdRef = useRef(providerId);
  providerIdRef.current = providerId;
  const restoreAttemptedRef = useRef(false);
  const [prefsRestored, setPrefsRestored] = useState(true);
  const lastPersistedRegistryRef = useRef(composerSeed.lastRegistryId);
  const lastNewChatConfigsRef = useRef<Record<string, Record<string, string>>>(
    composerSeed.lastNewChatConfigs,
  );
  const [lastNewChatConfigs, setLastNewChatConfigs] = useState<
    Record<string, Record<string, string>>
  >(composerSeed.lastNewChatConfigs);
  lastNewChatConfigsRef.current = lastNewChatConfigs;
  const installedAgentsRef = useRef(installedAgents);
  installedAgentsRef.current = installedAgents;
  const wsConnected = useWebSocketStore((state) => state.connectionState === "connected");
  const registryQuery = useAgentRegistryListQuery();
  const customQuery = useCustomAgentListQuery();
  const nativeQuery = useNativeChatAgentListQuery();
  const loadingAgents =
    installedAgents.length === 0 &&
    (registryQuery.isLoading || customQuery.isLoading || nativeQuery.isLoading);
  const agentLocked =
    Boolean(activeChatId) &&
    (messages.length > 0 || hasPersistenceHandle || isLiveAgentRuntimeStatus(runtimeStatus));
  const bottomRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const {
    removeQueuedAgentChatPrompt: removeDialogQueued,
    updateQueuedAgentChatPrompt: updateDialogQueued,
    moveQueuedAgentChatPrompt: moveDialogQueued,
    shiftQueuedAgentChatPrompt,
  } = useDialogStore(
    useShallow((state) => ({
      removeQueuedAgentChatPrompt: state.removeQueuedAgentChatPrompt,
      updateQueuedAgentChatPrompt: state.updateQueuedAgentChatPrompt,
      moveQueuedAgentChatPrompt: state.moveQueuedAgentChatPrompt,
      shiftQueuedAgentChatPrompt: state.shiftQueuedAgentChatPrompt,
    })),
  );

  const currentPlan = useMemo(
    () => parsePlan(currentPlanFromMessages(messages)),
    [messages],
  );
  const backgroundTools = useMemo(
    () => runningBackgroundTools(messages),
    [messages],
  );
  const agentActivity = useMemo(
    () => deriveAgentActivity(messages, busy),
    [busy, messages],
  );

  const liveTurn = busy || isLiveAssistantTurn(messages.at(-1));
  useEffect(() => {
    if (!liveTurn || turnStartedAt == null) {
      if (!liveTurn) setElapsedMs(0);
      return;
    }
    const tick = () => setElapsedMs(Math.max(0, Date.now() - turnStartedAt));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [liveTurn, turnStartedAt]);

  const chatIdPropRef = useRef(chatId);
  const onStartedRef = useRef(onChatStarted);
  const onUpdatedRef = useRef(onChatUpdated);
  const onOpenChatRef = useRef(onOpenChat);
  onStartedRef.current = onChatStarted;
  onUpdatedRef.current = onChatUpdated;
  onOpenChatRef.current = onOpenChat;

  useEffect(() => {
    activeIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    const previous = chatIdPropRef.current;
    chatIdPropRef.current = chatId;
    if (chatId) {
      if (previous !== chatId) setSessionCommands([]);
      setActiveChatId(chatId);
      return;
    }
    if (previous && !chatId) {
      setActiveChatId("");
      setMessages([]);
      setTitle(null);
      setQueue([]);
      setBusy(false);
      setRunningTurnId(null);
      setPendingPermission(null);
      setPendingSessionOp(null);
      setSessionCommands([]);
      setSessionUsage(null);
      setTurnStartedAt(null);
      setElapsedMs(0);
      lastSeq.current = 0;
      setRuntimeStatus("detached");
      setHasPersistenceHandle(false);
      setDescriptor(null);
      setSupportsSteer(false);
    }
  }, [chatId]);

  const applyDescriptor = useCallback((
    next: AgentDescriptor,
    opts?: { keepComposerChrome?: boolean },
  ) => {
    setDescriptor(next);
    setSupportsSteer(next.capabilities.steer === "supported");
    if (opts?.keepComposerChrome) return;
    setModelId(next.current_config.model ?? "");
    setThinkingId(next.current_config.thinking ?? "");
    setModeId(next.current_config.mode ?? "");
    setPermissionModeId(next.current_config.permission_mode ?? "");
    setFastId(next.current_config.fast ?? "");
  }, []);

  const load = useCallback(async (id = activeChatId) => {
    if (!id) return;
    const snapshot = await agentChatApi.get(id);
    const meta = snapshot.meta;
    setTitle(meta.title?.trim() || null);
    applyDescriptor(meta.descriptor);
    const loadedMessages = dedupeAgentMessages(
      (snapshot.messages ?? []).map((message) => ({
        ...message,
        parts: message.parts ?? [],
      })),
    );
    setMessages(loadedMessages);
    if (loadedMessages.length > 0) {
      onUpdatedRef.current?.(id, { hasMessages: true });
    }
    setRuntimeStatus(meta.runtime_status ?? "detached");
    setHasPersistenceHandle(Boolean(meta.persistence_handle));
    const last = snapshot.messages?.at(-1);
    const running =
      meta.runtime_status === "running_turn" ||
      meta.runtime_status === "waiting_permission" ||
      Boolean(snapshot.running_turn_id) ||
      isLiveAssistantTurn(last);
    setBusy(running);
    setRunningTurnId(snapshot.running_turn_id ?? null);
    setSessionUsage(meta.session_usage ?? null);
    if (running) {
      const elapsed = snapshotLiveElapsedMs(snapshot) ?? 0;
      setTurnStartedAt(clockFromElapsedMs(elapsed));
      setElapsedMs(elapsed);
    } else {
      setTurnStartedAt(null);
      setElapsedMs(0);
    }
    setQueue(snapshot.queue ?? []);
    setProviderIdState(meta.provider_id || "claude");
    setWorkspaceId(meta.workspace_id ?? (isolatedModal ? null : urlWorkspaceId));
    setProjectId(meta.project_id ?? (isolatedModal ? null : urlProjectId));
    setCwd(isolatedModal && !meta.workspace_id && !meta.project_id ? "" : (meta.cwd ?? ""));
    const commands = normalizeAgentSlashCommands(meta.available_commands);
    setSessionCommands(commands);
    rememberAgentSlashCommands(meta.provider_id || providerIdRef.current, commands);
    if (meta.title?.trim()) {
      onUpdatedRef.current?.(id, {
        title: meta.title,
        providerId: meta.provider_id ?? null,
        cwd: meta.cwd,
      });
    } else if (meta.provider_id) {
      onUpdatedRef.current?.(id, { providerId: meta.provider_id });
    }
    const pending = snapshot.pending_permission as {
      request_id?: string;
      tool?: string;
      description?: string;
      content_markdown?: string;
      plan_todos?: Array<{ id?: string | null; content: string; status?: string }>;
      options?: Array<{ option_id: string; name: string; kind?: string }>;
      questions?: Array<{ id: string; prompt: string; options?: string[] }>;
    } | null;
    setPendingPermission(
      pending?.request_id
        ? {
            request_id: pending.request_id,
            tool: pending.tool ?? "",
            description: pending.description ?? "",
            content_markdown: pending.content_markdown ?? undefined,
            plan_todos: pending.plan_todos,
            risk_level: "",
            options: (pending.options ?? []).map((option) => ({
              option_id: option.option_id,
              name: option.name,
              kind: option.kind || option.option_id,
            })),
            questions: (pending.questions ?? []).map((question) => ({
              id: question.id,
              prompt: question.prompt,
              options: question.options ?? [],
            })),
          }
        : null,
    );
    setPendingSessionOp(snapshot.pending_session_op ?? null);
    setHistoryLoading(true);
    try {
      const listed = await agentChatApi.list(
        agentChatHistoryListRequest({
          variant,
          workspaceId: meta.workspace_id ?? null,
          projectId: meta.project_id ?? null,
        }),
      );
      setHistorySessions(chatsToHistoryRows(listed.items ?? []));
    } finally {
      setHistoryLoading(false);
    }
    lastSeq.current = Number(meta.last_event_seq ?? 0);
    persistAgentChatLastSession({
      workspaceId: meta.workspace_id ?? (isolatedModal ? null : urlWorkspaceId),
      projectId: meta.project_id ?? (isolatedModal ? null : urlProjectId),
      mode: chatMode,
      instanceKey,
      registryId: meta.provider_id || providerIdRef.current,
      chatId: id,
      cwd: meta.cwd ?? null,
      prefKey: lastSessionPrefKey,
    });
    setHydrated(true);
    setIsResumingHistory(false);
  }, [
    activeChatId,
    chatMode,
    instanceKey,
    isolatedModal,
    lastSessionPrefKey,
    urlProjectId,
    urlWorkspaceId,
    variant,
    applyDescriptor,
  ]);

  useEffect(() => {
    const readPolicy = () => {
      void agentBehaviourSettingsApi.get().then((settings) => {
        setPolicy(resolveFollowupPolicy(settings.followup_policy));
      });
    };
    readPolicy();
    const onVisible = () => {
      if (document.visibilityState === "visible") readPolicy();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!wsConnected) return;
    void agentChatApi.prefsGet().then((prefs) => {
      const incoming = prefs.last_new_chat_configs ?? {};
      const merged = mergeLastNewChatConfigs(lastNewChatConfigsRef.current, incoming);
      lastNewChatConfigsRef.current = merged;
      rememberLastNewChatConfigs(merged);
      setLastNewChatConfigs(merged);
      const installed = installedAgentsRef.current;
      const installedIds = installed.map((agent) => agent.id);
      const lastRegistryId = pickInstalledRegistryId(
        installedIds,
        prefs.last_registry_id,
      );
      if (lastRegistryId) {
        lastPersistedRegistryRef.current = lastRegistryId;
        rememberLastRegistryId(lastRegistryId);
        setDefaultRegistryId((current) => current || lastRegistryId);
      }
      setProviderIdState((current) => {
        if (current && (installedIds.length === 0 || installedIds.includes(current))) {
          return current;
        }
        return lastRegistryId || installed[0]?.id || current;
      });
      if (!activeIdRef.current) {
        const registry = providerIdRef.current || lastRegistryId;
        const preferred = preferredConfigFromDefault(
          lastNewChatConfigForAgent(merged, registry)
            ?? installed.find((agent) => agent.id === registry)?.default_config,
        );
        if (preferred.modelId) setModelId((current) => current || preferred.modelId);
        if (preferred.thinkingId) setThinkingId((current) => current || preferred.thinkingId);
        if (preferred.modeId) setModeId((current) => current || preferred.modeId);
        if (preferred.permissionModeId) {
          setPermissionModeId((current) => current || preferred.permissionModeId);
        }
        if (preferred.fastId) setFastId((current) => current || preferred.fastId);
      }
      setPrefsRestored(true);
    }).catch(() => {
      setDefaultRegistryId((current) => current || readDefaultAgentRegistryId() || "claude");
      setProviderIdState((current) => current || readDefaultAgentRegistryId() || "claude");
      setPrefsRestored(true);
    });
  }, [wsConnected]);

  useEffect(() => {
    if (registryQuery.isLoading || customQuery.isLoading || nativeQuery.isLoading) return;
    if (!registryQuery.data && !customQuery.data && !nativeQuery.data) return;
    const agents = registryQuery.data?.agents ?? [];
    const custom = customQuery.data?.agents ?? [];
    const natives = nativeQuery.data?.agents ?? [];
    const installed = mergeInstalledAgents(
      agents.filter((agent) => agent.installed),
      custom,
      natives,
    );
    setInstalledAgents(installed);
    setProviderIdState((current) => {
      if (current && installed.some((agent) => agent.id === current)) return current;
      if (current) {
        const folded = canonicalizeChatProviderId(current);
        const alias = installed.find((agent) => canonicalizeChatProviderId(agent.id) === folded);
        if (alias) return alias.id;
      }
      if (installed[0]) return installed[0].id;
      return current;
    });
  }, [
    customQuery.data,
    customQuery.isLoading,
    nativeQuery.data,
    nativeQuery.isLoading,
    registryQuery.data,
    registryQuery.isLoading,
  ]);

  useEffect(() => {
    return useWebSocketStore.getState().onEvent("agent_options_updated", (payload) => {
      const update = payload as { agent_id?: string; options?: AgentOptionsSnapshot };
      if (update.agent_id && update.options) {
        rememberOptions(update.options);
      }
      if (update.agent_id && update.options && update.agent_id === providerIdRef.current) {
        setCatalog(update.options);
        const message = update.options.status === "error" ? update.options.message?.trim() : "";
        if (message) setSendError(message);
        const commands = normalizeAgentSlashCommands(update.options.commands);
        if (commands.length > 0) {
          rememberAgentSlashCommands(update.agent_id, commands);
        }
      }
    });
  }, [rememberOptions, setCatalog]);

  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    const stored = readAgentChatLastSessions({
      workspaceId: isolatedModal ? null : urlWorkspaceId,
      projectId: isolatedModal ? null : urlProjectId,
      mode: chatMode,
      instanceKey,
      prefKey: lastSessionPrefKey,
    });
    const restored = resolveRestoredAgentChat({
      chatIdProp: chatId,
      instanceKey,
      instanceLast: stored.instanceLast,
      filterLast: stored.filterLast,
      installedAgentIds: installedAgents.map((agent) => agent.id),
      defaultRegistryId: defaultRegistryId || installedAgents[0]?.id || "",
    });
    const last = stored.instanceLast ?? stored.filterLast;
    if (isolatedModal && last) {
      setWorkspaceId(last.workspaceId);
      setProjectId(last.projectId);
      setCwd(last.workspaceId || last.projectId ? last.cwd ?? "" : "");
    }
    if (restored.registryId) {
      setProviderIdState((current) => current || restored.registryId);
    }
    if (restored.chatId && restored.chatId !== activeIdRef.current) {
      setActiveChatId(restored.chatId);
      onOpenChat?.(restored.chatId);
      onStartedRef.current?.(restored.chatId, {
        cwd: stored.instanceLast?.cwd ?? stored.filterLast?.cwd ?? undefined,
        providerId: restored.registryId || null,
        hasMessages: true,
      });
    }
  }, [
    chatId,
    chatMode,
    defaultRegistryId,
    installedAgents,
    instanceKey,
    isolatedModal,
    lastSessionPrefKey,
    onOpenChat,
    urlProjectId,
    urlWorkspaceId,
  ]);

  useEffect(() => {
    if (!prefsRestored) return;
    const registryId = providerId.trim();
    if (!registryId) return;
    persistAgentChatLastSession({
      workspaceId,
      projectId,
      mode: chatMode,
      instanceKey,
      registryId,
      chatId: activeChatId || null,
      cwd: cwd || null,
      prefKey: lastSessionPrefKey,
    });
  }, [
    activeChatId,
    chatMode,
    cwd,
    instanceKey,
    lastSessionPrefKey,
    prefsRestored,
    projectId,
    providerId,
    workspaceId,
  ]);

  useEffect(() => {
    if (!prefsRestored || !hydrated) return;
    if (activeChatId) return;
    const registryId = providerId.trim();
    if (!registryId) return;
    if (lastPersistedRegistryRef.current !== registryId) {
      lastPersistedRegistryRef.current = registryId;
      rememberLastRegistryId(registryId);
      void agentChatApi.prefsSet({ last_registry_id: registryId }).catch(() => undefined);
    }
  }, [activeChatId, hydrated, prefsRestored, providerId]);

  useEffect(() => {
    if (!wsConnected || !prefsRestored) return;
    if (activeChatId) return;
    hydratingRef.current = false;
    setHydrated(true);
    setIsResumingHistory(false);
    setProviderIdState((current) => current || readDefaultAgentRegistryId() || "claude");
    setHistoryLoading(true);
    void agentChatApi.list(
      agentChatHistoryListRequest({
        variant,
        workspaceId: workspaceId ?? urlWorkspaceId,
        projectId: projectId ?? urlProjectId,
      }),
    ).then((listed) => {
      setHistorySessions(chatsToHistoryRows(listed.items ?? []));
    }).finally(() => {
      setHistoryLoading(false);
    });
  }, [
    activeChatId,
    prefsRestored,
    projectId,
    urlProjectId,
    urlWorkspaceId,
    variant,
    workspaceId,
    wsConnected,
  ]);

  useEffect(() => {
    if (!wsConnected || !prefsRestored) return;
    if (!activeChatId) return;
    if (resumeTranscriptRef.current) {
      setIsResumingHistory(true);
    } else {
      hydratingRef.current = true;
      setHydrated(true);
      setIsResumingHistory(false);
    }
    const id = activeChatId;
    hydratingRef.current = true;
    pendingEventsRef.current = [];
    lastSeq.current = 0;
    const applyEvent = (event: AgentChatEvent) => {
      if (!agentChatEventFor(event, activeIdRef.current)) return;
      if (typeof event.sequence === "number") {
        if (event.sequence <= lastSeq.current) return;
        lastSeq.current = event.sequence;
      }
      setMessages((current) => foldMessagesFromEvent(current, event, activeIdRef.current));
      const payload = event.payload;
      if (payload.type === "turn_started") {
        setBusy(true);
        setRunningTurnId(payload.turn_id ?? null);
        const started = payload.created_at ? Date.parse(payload.created_at) : Date.now();
        setTurnStartedAt(Number.isNaN(started) ? Date.now() : started);
      }
      if (
        payload.type === "assistant_message_delta"
        || payload.type === "thinking_delta"
        || payload.type === "tool_call_started"
        || payload.type === "tool_call_updated"
        || payload.type === "plan_updated"
        || (payload.type === "session_lifecycle" && payload.status === "running")
      ) {
        // Content after a premature turn_completed must reopen the busy turn.
        setBusy(true);
      }
      if (payload.type === "turn_completed") {
        setBusy(false);
        setRunningTurnId(null);
        // Keep Ask / permission chrome until PermissionResolved — Grok may still
        // be waiting on `_x.ai/ask_user_question` after a premature TurnEnd.
        setTurnStartedAt(null);
        const auth = authRequiredFromTurnError(payload.error, providerIdRef.current);
        if (auth) {
          setSelectedAuthMethodId(auth.methods[0]?.id ?? "");
          setAuthRequest(auth);
        }
      }
      if (payload.type === "context_usage_updated") {
        setSessionUsage((prev) =>
          mergeContextUsageUpdate(prev, {
            used: payload.used,
            context_window: payload.context_window,
          }),
        );
      }
      if (payload.type === "usage_updated") {
        if (payload.session) {
          setSessionUsage((prev) => ({
            ...(prev ?? {}),
            ...payload.session,
            // Prefer explicit context_window; keep prior window if cost-only merge.
            used: payload.session.used ?? prev?.used ?? null,
            context_window:
              payload.session.context_window
              ?? payload.session.size
              ?? prev?.context_window
              ?? prev?.size
              ?? null,
          }));
        }
      }
      if (payload.type === "permission_requested" && payload.request?.request_id) {
        setBusy(true);
        setPendingPermission({
          request_id: payload.request.request_id,
          tool: payload.request.tool ?? "",
          description: payload.request.description ?? "",
          content_markdown: payload.request.content_markdown,
          plan_todos: payload.request.plan_todos,
          risk_level: "",
          options: (payload.request.options ?? []).map((option) => ({
            option_id: option.option_id,
            name: option.name,
            kind: option.kind || option.option_id,
          })),
          questions: (payload.request.questions ?? []).map((question) => ({
            id: question.id,
            prompt: question.prompt,
            options: question.options ?? [],
          })),
        });
      }
      if (payload.type === "permission_resolved") {
        setPendingPermission(null);
      }
      if (payload.type === "session_op_requested" && payload.request?.request_id) {
        setSendError(null);
        setPendingSessionOp(payload.request);
      }
      if (payload.type === "session_op_resolved") {
        setPendingSessionOp(null);
        if (payload.outcome === "failed") {
          const message = payload.error?.trim();
          setSendError(message || tSessionHints("sessionOpFailed"));
        }
      }
      if (payload.type === "session_forked") {
        const childId = payload.chat_id?.trim();
        if (childId && childId !== activeIdRef.current) {
          setPendingPermission(null);
          setPendingSessionOp(null);
          setMessages([]);
          setQueue([]);
          setBusy(false);
          setRunningTurnId(null);
          setSessionCommands([]);
          setSessionUsage(null);
          setTurnStartedAt(null);
          setElapsedMs(0);
          lastSeq.current = 0;
          setIsResumingHistory(true);
          hydratingRef.current = true;
          pendingEventsRef.current = [];
          setActiveChatId(childId);
          onOpenChatRef.current?.(childId);
          onStartedRef.current?.(childId, { hasMessages: true });
        }
      }
      if (payload.type === "rewind_view_updated") {
        const id = activeIdRef.current;
        if (id) void load(id);
      }
      if (payload.type === "queue_updated" && payload.items) {
        setQueue(payload.items);
      }
      if (payload.type === "available_commands_updated") {
        const commands = normalizeAgentSlashCommands(payload.commands);
        setSessionCommands(commands);
        rememberAgentSlashCommands(providerIdRef.current, commands);
      }
      if (payload.type === "config_updated") {
        applyDescriptor(payload.descriptor);
      }
      if (payload.type === "title_updated") {
        const nextTitle = payload.title;
        if (nextTitle) {
          setTitle(nextTitle);
          setShouldScrambleAutoTitle(true);
          onUpdatedRef.current?.(activeIdRef.current, { title: nextTitle });
        }
      }
      if (payload.type === "session_lifecycle" && (payload.status === "running" || payload.status === "completed")) {
        setRuntimeStatus((current) => (isLiveAgentRuntimeStatus(current) ? current : "starting"));
      }
      if (payload.type === "runtime_status") {
        if (payload.status) setRuntimeStatus(payload.status);
        if (payload.persistence_handle) setHasPersistenceHandle(true);
        if (payload.status === "detached" || payload.status === "closed") {
          setBusy(false);
          setRunningTurnId(null);
          setPendingPermission(null);
          setPendingSessionOp(null);
          setTurnStartedAt(null);
        }
      }
    };
    void load(id).then(async () => {
      const pending = pendingEventsRef.current;
      pendingEventsRef.current = [];
      hydratingRef.current = false;
      for (const event of pending) applyEvent(event);
      await agentChatApi.subscribe(id, lastSeq.current);
      const queued = pendingSendRef.current;
      pendingSendRef.current = null;
      if (queued) {
        await persistConfigRef.current(composerSelectionRef.current().patch);
        await agentChatApi.send(id, queued.text, queued.attachmentPaths);
      }
    }).catch(() => {
      hydratingRef.current = false;
      setHydrated(true);
      setIsResumingHistory(false);
    });
    const off = useWebSocketStore.getState().onEvent("agent_chat_event", (event: AgentChatEvent) => {
      if (!agentChatEventFor(event, activeIdRef.current)) return;
      if (hydratingRef.current) {
        pendingEventsRef.current.push(event);
        return;
      }
      applyEvent(event);
    });
    return () => {
      off();
      hydratingRef.current = true;
      void agentChatApi.unsubscribe(id);
    };
  }, [activeChatId, load, prefsRestored, wsConnected]);

  useEffect(() => {
    if (!providerId) return;
    const cached = optionsByAgentRef.current[providerId];
    if (cached) {
      setCatalog(cached);
    }
    let cancelled = false;
    void agentChatApi.optionsGet(providerId).then((next) => {
      if (cancelled) return;
      if (next.status === "probing" && next.models.length === 0) {
        const existing = optionsByAgentRef.current[providerId];
        if (existing && existing.models.length > 0) return;
      }
      setCatalog(next);
      const message = next.status === "error" ? next.message?.trim() : "";
      if (message) setSendError(message);
      const commands = normalizeAgentSlashCommands(next.commands);
      if (commands.length > 0) {
        rememberAgentSlashCommands(providerId, commands);
      }
    }).catch((error) => {
      if (cancelled) return;
      setSendError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
    };
  }, [providerId, setCatalog]);

  const refreshEmptyCatalog = useCallback(() => {
    const id = providerIdRef.current;
    if (!id) return;
    const remembered = optionsByAgentRef.current[id];
    if (remembered && remembered.models.length > 0) {
      setCatalog(remembered);
    }
    let skip = false;
    setCatalog((current) => {
      if (current?.agent_id === id && current.models.length > 0) {
        skip = true;
        return current;
      }
      if (current?.agent_id === id && current.status === "probing") {
        skip = true;
        return current;
      }
      return remembered ?? current ?? probingOptionsSnapshot(id);
    });
    if (skip) return;
    void agentChatApi.optionsGet(id).then((next) => {
      if (providerIdRef.current !== id) return;
      if (next.status === "probing" && next.models.length === 0) {
        const existing = optionsByAgentRef.current[id];
        if (existing && existing.models.length > 0) return;
      }
      setCatalog(next);
      const message = next.status === "error" ? next.message?.trim() : "";
      if (message) setSendError(message);
      const commands = normalizeAgentSlashCommands(next.commands);
      if (commands.length > 0) {
        rememberAgentSlashCommands(id, commands);
      }
    });
  }, [setCatalog]);

  useEffect(() => {
    if (!prefsRestored) return;
    if (activeChatId) return;
    if (
      messages.length > 0 ||
      hasPersistenceHandle ||
      isLiveAgentRuntimeStatus(runtimeStatus)
    ) {
      return;
    }
    if (!catalog) return;
    if (catalog.agent_id && providerId && catalog.agent_id !== providerId) return;
    const preferred = preferredConfigFromDefault(
      lastNewChatConfigForAgent(lastNewChatConfigs, providerId)
        ?? installedAgents.find((agent) => agent.id === providerId)?.default_config,
    );
    setModeId((current) =>
      current
        || preferred.modeId
        || catalog.modes.find((mode) => mode.is_default)?.id
        || catalog.modes[0]?.id
        || "",
    );
    setPermissionModeId((current) => current || preferred.permissionModeId);
    setFastId((current) => current || preferred.fastId);
    const resolvedModelId = defaultOptionsModelId(catalog, modelId || preferred.modelId);
    setModelId((current) => {
      if (current && catalog.models.some((model) => model.id === current)) {
        return current;
      }
      return resolvedModelId;
    });
    setThinkingId((current) => {
      const choices = thinkingChoices(catalog, resolvedModelId);
      const preferredThinking = current || preferred.thinkingId;
      if (preferredThinking && choices.includes(preferredThinking)) return preferredThinking;
      return choices[0] || "";
    });
  }, [
    activeChatId,
    catalog,
    hasPersistenceHandle,
    installedAgents,
    lastNewChatConfigs,
    messages.length,
    modelId,
    prefsRestored,
    providerId,
    runtimeStatus,
  ]);

  const persistNewSessionPreferences = useCallback((
    registryId: string,
    selected: {
      model: string;
      thinking: string;
      mode: string;
      permissionMode: string;
      fast: string;
    },
  ) => {
    const registry = registryId.trim();
    if (!registry) return;
    if (lastPersistedRegistryRef.current !== registry) {
      lastPersistedRegistryRef.current = registry;
      rememberLastRegistryId(registry);
    }
    const snapshot: Record<string, string> = {};
    if (selected.model.trim()) snapshot.model = selected.model.trim();
    if (selected.thinking.trim()) snapshot.thinking = selected.thinking.trim();
    if (selected.mode.trim()) snapshot.mode = selected.mode.trim();
    if (selected.permissionMode.trim()) snapshot.permission_mode = selected.permissionMode.trim();
    if (selected.fast.trim()) snapshot.fast = selected.fast.trim();
    if (Object.keys(snapshot).length === 0) return;
    lastNewChatConfigsRef.current = {
      ...lastNewChatConfigsRef.current,
      [registry]: snapshot,
    };
    setLastNewChatConfigs((current) => {
      const next = { ...current, [registry]: snapshot };
      rememberLastNewChatConfigs(next);
      return next;
    });
    void agentChatApi.prefsSet({
      last_registry_id: registry,
      last_new_chat_config: {
        agent_id: registry,
        model: snapshot.model ?? null,
        thinking: snapshot.thinking ?? null,
        mode: snapshot.mode ?? null,
        permission_mode: snapshot.permission_mode ?? null,
        fast: snapshot.fast ?? null,
      },
    }).catch(() => undefined);
    setInstalledAgents((current) =>
      current.map((agent) =>
        agent.id === registry
          ? {
              ...agent,
              default_config: {
                ...(agent.default_config || {}),
                ...snapshot,
              },
            }
          : agent,
      ),
    );
  }, []);

  const composerSelection = useCallback(() => {
    const options = composerConfigOptions({
      descriptor,
      catalog,
      providerId: providerId || defaultRegistryId || "claude",
      modelId,
      thinkingId,
      modeId,
      permissionModeId,
      fastId,
    });
    const model = displayedComposerConfigValue(options, "model", modelId);
    const thinking = displayedComposerConfigValue(options, "thinking", thinkingId);
    const mode = displayedComposerConfigValue(options, "mode", modeId);
    const permissionMode = displayedComposerConfigValue(
      options,
      "permission_mode",
      permissionModeId,
    );
    const fast = displayedComposerConfigValue(options, "fast", fastId);
    return {
      model,
      thinking,
      mode,
      permissionMode,
      fast,
      patch: pendingSessionConfigPatch(model, thinking, mode, permissionMode, fast),
    };
  }, [
    catalog,
    defaultRegistryId,
    descriptor,
    fastId,
    modeId,
    modelId,
    permissionModeId,
    providerId,
    thinkingId,
  ]);

  const persistConfig = useCallback(async (patch: {
    provider_id?: string;
    model?: string;
    thinking?: string;
    mode?: string;
    permission_mode?: string;
    fast?: string;
  }) => {
    const id = activeChatId || activeIdRef.current;
    if (!id) return;
    if (
      !patch.provider_id
      && !patch.model
      && !patch.thinking
      && !patch.mode
      && !patch.permission_mode
      && !patch.fast
    ) {
      return;
    }
    const meta = await agentChatApi.configure(id, patch);
    setProviderIdState(meta.provider_id || "claude");
    applyDescriptor(meta.descriptor);
    onUpdatedRef.current?.(id, { providerId: meta.provider_id ?? null });
  }, [activeChatId, applyDescriptor]);
  persistConfigRef.current = persistConfig;
  composerSelectionRef.current = composerSelection;

  const ensureCreatedChat = useCallback(async (input?: { title?: string | null }) => {
    const existing = activeIdRef.current.trim();
    if (existing) return existing;
    if (creatingChatRef.current) return creatingChatRef.current;
    const registry = providerId || defaultRegistryId || "claude";
    const pending = (async () => {
      const selected = composerSelection();
      const meta = await agentChatApi.create({
        provider_id: registry,
        model: selected.model || null,
        thinking: selected.thinking || null,
        mode: selected.mode || null,
        permission_mode: selected.permissionMode || null,
        fast: selected.fast || null,
        cwd: cwd || null,
        workspace_id: workspaceId,
        project_id: projectId,
        space_id: isolatedModal
          ? null
          : spaceIdForChatCreate(paintContextId, workspaceId || projectId),
        title: input?.title ?? null,
        origin: isolatedModal ? "quick" : "normal",
      });
      const id = meta.id;
      activeIdRef.current = id;
      setActiveChatId(id);
      applyDescriptor(meta.descriptor, { keepComposerChrome: true });
      setProviderIdState(meta.provider_id || registry);
      const nextTitle = meta.title?.trim() || input?.title?.trim() || null;
      if (nextTitle) setTitle(nextTitle);
      onStartedRef.current?.(id, {
        title: nextTitle,
        cwd: meta.cwd,
        providerId: meta.provider_id || registry,
        hasMessages: false,
      });
      return id;
    })();
    creatingChatRef.current = pending;
    try {
      return await pending;
    } finally {
      if (creatingChatRef.current === pending) creatingChatRef.current = null;
    }
  }, [
    composerSelection,
    cwd,
    defaultRegistryId,
    isolatedModal,
    paintContextId,
    projectId,
    providerId,
    workspaceId,
    applyDescriptor,
  ]);

  useEffect(() => {
    if (variant !== "center") return;
    if (!wsConnected || !prefsRestored) return;
    if (activeChatId || creatingChatRef.current) return;
    if (!(providerId || defaultRegistryId).trim()) return;
    void ensureCreatedChat();
  }, [
    activeChatId,
    defaultRegistryId,
    ensureCreatedChat,
    prefsRestored,
    providerId,
    variant,
    wsConnected,
  ]);

  useEffect(() => {
    const contextKey = getAgentPromptQueueKey(workspaceId, projectId, "default", null);
    const instanceQueueKey = getAgentPromptQueueKey(workspaceId, projectId, "default", instanceKey);
    const drain = async () => {
      const store = useDialogStore.getState();
      const queued = [
        ...(store.agentChatPromptQueues[contextKey] ?? []),
        ...(instanceKey ? (store.agentChatPromptQueues[instanceQueueKey] ?? []) : []),
      ];
      for (const item of queued) {
        if (consumedPrompts.current.has(item.id)) continue;
        consumedPrompts.current.add(item.id);
        shiftQueuedAgentChatPrompt(workspaceId, projectId, item.mode, item.instanceKey ?? null);
        const text = buildQueuedAgentPromptContent(item.prompt, item.attachmentPaths);
        if (!text.trim()) continue;
        let id = activeChatId || activeIdRef.current;
        if (item.forceNewSession && id) {
          const registry = item.registryId || providerId || defaultRegistryId || "claude";
          const selected = composerSelection();
          persistNewSessionPreferences(registry, selected);
          const meta = await agentChatApi.create({
            provider_id: registry,
            model: selected.model || null,
            thinking: selected.thinking || null,
            mode: selected.mode || null,
            permission_mode: selected.permissionMode || null,
            fast: selected.fast || null,
            cwd: cwd || null,
            workspace_id: workspaceId,
            project_id: projectId,
            space_id: isolatedModal
              ? null
              : spaceIdForChatCreate(paintContextId, workspaceId || projectId),
            title: item.sessionTitle ?? null,
            origin: isolatedModal ? "quick" : "normal",
          });
          applyDescriptor(meta.descriptor);
          setProviderIdState(meta.provider_id || registry);
          id = meta.id;
          pendingSendRef.current = { text, attachmentPaths: item.attachmentPaths ?? [] };
          activeIdRef.current = id;
          setActiveChatId(id);
          onStartedRef.current?.(id, {
            title: meta.title?.trim() || item.sessionTitle || chatTitleFromPrompt(text) || null,
            cwd: meta.cwd,
            providerId: meta.provider_id || item.registryId || providerId || defaultRegistryId || null,
            hasMessages: false,
          });
          return;
        }
        if (!id) {
          id = await ensureCreatedChat({
            title: item.sessionTitle ?? chatTitleFromPrompt(text),
          });
          pendingSendRef.current = { text, attachmentPaths: item.attachmentPaths ?? [] };
          return;
        }
        const selected = composerSelection();
        if (messages.length === 0) {
          persistNewSessionPreferences(
            providerId || defaultRegistryId || "claude",
            selected,
          );
        }
        await persistConfig(selected.patch);
        if (busy) {
          await agentChatApi.queueAdd(id, text, item.attachmentPaths);
        } else {
          await agentChatApi.send(id, text, item.attachmentPaths);
        }
      }
    };
    void drain();
  }, [
    composerSelection,
    activeChatId,
    busy,
    cwd,
    defaultRegistryId,
    instanceKey,
    isolatedModal,
    paintContextId,
    persistConfig,
    persistNewSessionPreferences,
    ensureCreatedChat,
    projectId,
    providerId,
    shiftQueuedAgentChatPrompt,
    messages.length,
    workspaceId,
    applyDescriptor,
  ]);

  const handleSubmit = useCallback(async (
    message: {
      text: string;
      files?: import("ai").FileUIPart[];
    },
    options?: { oneShot?: "queue" | "steer" },
  ) => {
    let text = message.text.trim();
    if (transformPrompt) text = transformPrompt(text);
    const files = message.files ?? [];
    if (!text && files.length === 0) return;
    setSendError(null);
    try {
      const selected = composerSelection();
      if (messages.length === 0) {
        persistNewSessionPreferences(
          providerIdRef.current || defaultRegistryId || "claude",
          selected,
        );
      }
      let id = activeChatId || activeIdRef.current;
      if (!id) {
        const promptTitle = chatTitleFromPrompt(text);
        id = await ensureCreatedChat({ title: promptTitle });
        let attachmentPaths: string[] = [];
        if (files.length > 0) {
          const uploaded = await agentRestApi.uploadAttachments(
            cwd || ".",
            files.map((file) => ({
              url: file.url,
              filename: file.filename,
              mediaType: file.mediaType,
            })),
            id,
          );
          attachmentPaths = uploaded.paths;
        }
        pendingSendRef.current = { text, attachmentPaths };
        if (promptTitle) setTitle((current) => current || promptTitle);
        onStartedRef.current?.(id, {
          title: promptTitle,
          hasMessages: false,
        });
        if (!hydratingRef.current) {
          const queued = pendingSendRef.current;
          pendingSendRef.current = null;
          if (queued) {
            lastSentRef.current = queued;
            const selected = composerSelection();
            persistNewSessionPreferences(
              providerIdRef.current || defaultRegistryId || "claude",
              selected,
            );
            await persistConfig(selected.patch);
            await agentChatApi.send(id, queued.text, queued.attachmentPaths);
          }
        }
        return;
      }
      let attachmentPaths: string[] = [];
      if (files.length > 0) {
        const { paths } = await agentRestApi.uploadAttachments(
          cwd || ".",
          files.map((file) => ({
            url: file.url,
            filename: file.filename,
            mediaType: file.mediaType,
          })),
          id,
        );
        attachmentPaths = paths;
      }
      if (busy) {
        const action = routeBusySubmit({
          policy,
          oneShot: options?.oneShot ?? null,
          supportsSteer,
        });
        if (action === "steer") {
          if (!supportsSteer || !runningTurnId) return;
          await agentChatApi.steer(id, runningTurnId, text);
          return;
        }
        await persistConfig(composerSelection().patch);
        await agentChatApi.queueAdd(id, text, attachmentPaths);
      } else {
        lastSentRef.current = { text, attachmentPaths };
        await persistConfig(composerSelection().patch);
        await agentChatApi.send(id, text, attachmentPaths);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not send that message";
      const auth = authRequiredFromTurnError(message, providerIdRef.current);
      if (auth) {
        setSelectedAuthMethodId(auth.methods[0]?.id ?? "");
        setAuthRequest(auth);
      }
      setSendError(message);
    }
  }, [
    activeChatId,
    busy,
    composerSelection,
    cwd,
    defaultRegistryId,
    isolatedModal,
    paintContextId,
    persistConfig,
    persistNewSessionPreferences,
    ensureCreatedChat,
    policy,
    projectId,
    providerId,
    runningTurnId,
    supportsSteer,
    transformPrompt,
    workspaceId,
    messages.length,
  ]);

  const startSession = useCallback(async (opts?: {
    registryId?: string;
    authMethodId?: string;
    apiKey?: string;
  }) => {
    const envName = tokenAuthEnvName(opts?.authMethodId ?? selectedAuthMethodId);
    const apiKey = opts?.apiKey?.trim() ?? "";
    if (envName && apiKey) {
      try {
        if (envName === DEEPSEEK_API_KEY_ENV) {
          await quotaUsageApi.addProviderApiKey("deepseek", null, apiKey);
        } else {
          const provider = opts?.registryId || providerIdRef.current || DEEPSEEK_HARNESS_ID;
          const listed = await agentApi.listCustomAgents().catch(() => ({ agents: [] }));
          const existing = listed.agents.find((agent) => agent.name === provider);
          await agentApi.addCustomAgent({
            name: provider,
            command: existing?.command || "npx",
            args: existing?.args?.length ? existing.args : [...DEEPSEEK_HARNESS_ARGS],
            env: {
              ...(existing?.env ?? {}),
              [envName]: apiKey,
            },
          });
          const client = getAtmosWebQueryClient();
          void client.invalidateQueries({
            queryKey: queryKeys.computer.customAgentList(getComputerQueryScope()),
            refetchType: "active",
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not save API token";
        setSendError(message);
        throw error;
      }
    }
    setAuthRequest(null);
    const retry = lastSentRef.current;
    const chatId = activeIdRef.current;
    if (retry && chatId) {
      setSendError(null);
      try {
        await persistConfig(composerSelection().patch);
        await agentChatApi.send(chatId, retry.text, retry.attachmentPaths);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not send that message";
        const auth = authRequiredFromTurnError(message, providerIdRef.current);
        if (auth) {
          setSelectedAuthMethodId(auth.methods[0]?.id ?? "");
          setAuthRequest(auth);
        }
        setSendError(message);
      }
    }
  }, [
    composerSelection,
    persistConfig,
    selectedAuthMethodId,
  ]);

  const persistPreferredRegistry = useCallback((registryId: string) => {
    const next = registryId.trim();
    if (!next) return;
    setProviderIdState((current) => (agentLocked ? current : next || current));
    persistAgentChatLastSession({
      workspaceId,
      projectId,
      mode: chatMode,
      instanceKey,
      registryId: next,
      chatId: activeChatId || null,
      cwd: cwd || null,
      prefKey: lastSessionPrefKey,
    });
    if (lastPersistedRegistryRef.current !== next) {
      lastPersistedRegistryRef.current = next;
      rememberLastRegistryId(next);
      void agentChatApi.prefsSet({ last_registry_id: next }).catch(() => undefined);
    }
  }, [
    activeChatId,
    agentLocked,
    chatMode,
    cwd,
    instanceKey,
    lastSessionPrefKey,
    projectId,
    workspaceId,
  ]);

  const handleCreateNewSession = useCallback(async (targetRegistryId?: string) => {
    const nextRegistry = targetRegistryId?.trim() || providerId;
    const registryChanged = Boolean(
      targetRegistryId?.trim() && targetRegistryId.trim() !== providerId,
    );
    if (targetRegistryId) {
      setProviderIdState(targetRegistryId);
      const cached =
        optionsByAgentRef.current[targetRegistryId]
        ?? readComposerLocalCache().optionsByAgent[targetRegistryId];
      if (cached) {
        optionsByAgentRef.current[targetRegistryId] = cached;
        setCatalog(cached);
      } else if (registryChanged) {
        setCatalog(null);
      }
    }
    // Restore the last landing snapshot for this agent (picker / first send).
    const preferred = preferredConfigFromDefault(
      lastNewChatConfigForAgent(lastNewChatConfigsRef.current, nextRegistry)
        ?? installedAgents.find((agent) => agent.id === nextRegistry)?.default_config,
    );
    setModelId(preferred.modelId);
    setThinkingId(preferred.thinkingId);
    setModeId(preferred.modeId);
    setPermissionModeId(preferred.permissionModeId);
    setFastId(preferred.fastId);
    if (nextRegistry) {
      persistAgentChatLastSession({
        workspaceId,
        projectId,
        mode: chatMode,
        instanceKey,
        registryId: nextRegistry,
        chatId: null,
        cwd: cwd || null,
        prefKey: lastSessionPrefKey,
      });
      if (lastPersistedRegistryRef.current !== nextRegistry) {
        lastPersistedRegistryRef.current = nextRegistry;
        rememberLastRegistryId(nextRegistry);
        void agentChatApi.prefsSet({ last_registry_id: nextRegistry }).catch(() => undefined);
      }
    }
    const previousId = activeIdRef.current;
    activeIdRef.current = "";
    creatingChatRef.current = null;
    hydratingRef.current = false;
    resumeTranscriptRef.current = false;
    setIsResumingHistory(false);
    setActiveChatId("");
    setMessages([]);
    setTitle(null);
    setQueue([]);
    setBusy(false);
    setRunningTurnId(null);
    setPendingPermission(null);
    setPendingSessionOp(null);
    setSessionCommands([]);
    setSessionUsage(null);
    setTurnStartedAt(null);
    setElapsedMs(0);
    lastSeq.current = 0;
    setRuntimeStatus("detached");
    setHasPersistenceHandle(false);
    setDescriptor(null);
    setSupportsSteer(false);
    if (previousId) {
      onUpdatedRef.current?.(previousId, { hasMessages: false });
    }
    onOpenChat?.("");
  }, [
    chatMode,
    cwd,
    instanceKey,
    installedAgents,
    lastSessionPrefKey,
    onOpenChat,
    projectId,
    providerId,
    workspaceId,
  ]);

  const handleSelectHistorySession = useCallback(async (row: AgentChatHistoryRow) => {
    setHistoryOpen(false);
    if (row.chat_id === activeIdRef.current) return;
    setActiveChatId(row.chat_id);
    setTitle(row.title?.trim() || null);
    setShouldScrambleAutoTitle(false);
    if (row.provider_id) setProviderIdState(row.provider_id);
    setCwd(row.cwd ?? "");
    setMessages([]);
    setQueue([]);
    setBusy(false);
    setRunningTurnId(null);
    setPendingPermission(null);
    setPendingSessionOp(null);
    setSessionCommands([]);
    setSessionUsage(null);
    setTurnStartedAt(null);
    setElapsedMs(0);
    lastSeq.current = 0;
    setIsResumingHistory(true);
    hydratingRef.current = true;
    pendingEventsRef.current = [];
    onOpenChat?.(row.chat_id);
    onStartedRef.current?.(row.chat_id, {
      title: row.title,
      cwd: row.cwd,
      providerId: row.provider_id || null,
      hasMessages: true,
    });
  }, [onOpenChat]);

  const queuedPrompts = useMemo(
    () => queueToPrompts(queue, workspaceId, projectId),
    [projectId, queue, workspaceId],
  );

  const removeQueuedAgentChatPrompt = useCallback(async (id: string) => {
    if (!activeChatId) return;
    await agentChatApi.queueDelete(activeChatId, id);
    removeDialogQueued(id);
    void load(activeChatId);
  }, [activeChatId, load, removeDialogQueued]);

  const updateQueuedAgentChatPrompt = useCallback(async (
    id: string,
    updates: { prompt: string },
  ) => {
    if (!activeChatId) return;
    await agentChatApi.queueUpdate(activeChatId, id, { text: updates.prompt });
    updateDialogQueued(id, updates);
    void load(activeChatId);
  }, [activeChatId, load, updateDialogQueued]);

  const moveQueuedAgentChatPrompt = useCallback(async (id: string, toIndex: number) => {
    const ids = queue.map((item) => item.id);
    const fromIndex = ids.indexOf(id);
    if (fromIndex < 0) return;
    ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, id);
    if (!activeChatId) return;
    await agentChatApi.queueReorder(activeChatId, ids);
    moveDialogQueued(id, toIndex);
    void load(activeChatId);
  }, [activeChatId, load, moveDialogQueued, queue]);

  const configOptions = useMemo(
    () =>
      composerConfigOptions({
        descriptor,
        catalog,
        providerId,
        modelId,
        thinkingId,
        modeId,
        permissionModeId,
        fastId,
      }),
    [catalog, descriptor, fastId, modeId, modelId, permissionModeId, providerId, thinkingId],
  );

  const setAgentDefaultConfig = useCallback((configId: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const registry = providerIdRef.current.trim();
    if (!registry) return;
    // Shift-click "set as default" is local chrome only. Durable New Chat
    // snapshots are written solely by agent_chat_create.
    setInstalledAgents((current) => {
      const agent = current.find((item) => item.id === registry);
      if (agent?.default_config?.[configId] === trimmed) return current;
      return current.map((item) =>
        item.id === registry
          ? { ...item, default_config: { ...(item.default_config || {}), [configId]: trimmed } }
          : item,
      );
    });
  }, []);

  // Composer chrome updates local draft state. Landing picker changes also
  // become the next New Chat snapshot. Session SetConfig stays deferred until
  // send / queue / retry so intermediate flips do not spam the runtime.
  const setConfigOption = useCallback((key: string, value: string) => {
    const next = {
      model: modelId,
      thinking: thinkingId,
      mode: modeId,
      permissionMode: permissionModeId,
      fast: fastId,
    };
    if (configKindMatches(key, undefined, "model")) {
      setModelId(value);
      next.model = value;
    } else if (configKindMatches(key, undefined, "thinking")) {
      setThinkingId(value);
      next.thinking = value;
    } else if (configKindMatches(key, undefined, "permission_mode")) {
      setPermissionModeId(value);
      next.permissionMode = value;
    } else if (configKindMatches(key, undefined, "mode")) {
      setModeId(value);
      next.mode = value;
    } else if (configKindMatches(key, undefined, "fast")) {
      setFastId(value);
      next.fast = value;
    } else {
      return;
    }
    const registry = providerIdRef.current.trim();
    if (registry) persistNewSessionPreferences(registry, next);
  }, [
    fastId,
    modeId,
    modelId,
    permissionModeId,
    persistNewSessionPreferences,
    thinkingId,
  ]);

  const setProviderId = useCallback((next: string) => {
    if (agentLocked) return;
    setProviderIdState(next);
    const cached =
      optionsByAgentRef.current[next] ?? readComposerLocalCache().optionsByAgent[next];
    if (cached) {
      optionsByAgentRef.current[next] = cached;
      setCatalog(cached);
    } else {
      setCatalog(null);
    }
    setDescriptor(null);
    setSupportsSteer(false);
    const preferred = preferredConfigFromDefault(
      lastNewChatConfigForAgent(lastNewChatConfigsRef.current, next)
        ?? installedAgents.find((agent) => agent.id === next)?.default_config,
    );
    setModelId(preferred.modelId);
    setThinkingId(preferred.thinkingId);
    setModeId(preferred.modeId);
    setPermissionModeId(preferred.permissionModeId);
    setFastId(preferred.fastId);
    persistPreferredRegistry(next);
    if (activeIdRef.current) {
      void persistConfig({
        provider_id: next,
        ...(preferred.modelId ? { model: preferred.modelId } : {}),
        ...(preferred.thinkingId ? { thinking: preferred.thinkingId } : {}),
        ...(preferred.modeId ? { mode: preferred.modeId } : {}),
        ...(preferred.permissionModeId ? { permission_mode: preferred.permissionModeId } : {}),
        ...(preferred.fastId ? { fast: preferred.fastId } : {}),
      });
    }
  }, [agentLocked, installedAgents, persistConfig, persistPreferredRegistry, setCatalog]);

  const activeAgent = installedAgents.find((agent) => agent.id === providerId) ?? installedAgents[0] ?? null;
  const registryId = activeAgent?.id || providerId;
  const cachedCommands = useAgentSlashCommandCache((state) => {
    const id = (providerId || defaultRegistryId).trim();
    if (!id) return EMPTY_AGENT_SLASH_COMMANDS;
    return state.byProviderId[id] ?? EMPTY_AGENT_SLASH_COMMANDS;
  });
  const catalogCommands = normalizeAgentSlashCommands(catalog?.commands);
  const availableCommands = resolveAgentSlashCommands(
    sessionCommands,
    cachedCommands,
    catalogCommands,
  );

  useEffect(() => {
    if (!activeChatId || messages.length === 0) return;
    onUpdatedRef.current?.(activeChatId, { hasMessages: true });
  }, [activeChatId, messages.length]);

  useEffect(() => {
    if (activeChatId) return;
    const id = (providerId || defaultRegistryId).trim();
    if (!id) return;
    if (useAgentSlashCommandCache.getState().byProviderId[id]?.length) return;
    const match = historySessions.find((row) => row.provider_id === id);
    if (!match?.chat_id) return;
    let cancelled = false;
    void agentChatApi
      .get(match.chat_id)
      .then((snapshot) => {
        if (cancelled) return;
        rememberAgentSlashCommands(
          id,
          normalizeAgentSlashCommands(snapshot.meta.available_commands),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeChatId, defaultRegistryId, historySessions, providerId]);
  const resetConversation = useCallback(() => {
    setActiveChatId("");
    setMessages([]);
    setTitle(null);
    setQueue([]);
    setBusy(false);
    setRunningTurnId(null);
    setPendingPermission(null);
    setPendingSessionOp(null);
    setSessionCommands([]);
    setSessionUsage(null);
    setTurnStartedAt(null);
    setElapsedMs(0);
    lastSeq.current = 0;
    setRuntimeStatus("detached");
    setHasPersistenceHandle(false);
    setDescriptor(null);
    setSupportsSteer(false);
    onOpenChat?.("");
  }, [onOpenChat]);

  const handleSelectWorkingDirectory = useCallback(
    (selection: AgentChatWorkingDirectory) => {
      if (activeChatId) return;
      const current: AgentChatWorkingDirectory = {
        workspaceId,
        projectId,
        cwd: cwd || null,
      };
      if (workingDirectoriesEqual(current, selection)) return;
      setWorkspaceId(selection.workspaceId);
      setProjectId(selection.projectId);
      setCwd(selection.cwd ?? "");
      const registry = providerId || defaultRegistryId;
      if (registry) {
        persistAgentChatLastSession({
          workspaceId: selection.workspaceId,
          projectId: selection.projectId,
          mode: chatMode,
          instanceKey,
          registryId: registry,
          chatId: null,
          cwd: selection.cwd,
          prefKey: lastSessionPrefKey,
        });
      }
    },
    [
      activeChatId,
      chatMode,
      cwd,
      defaultRegistryId,
      instanceKey,
      lastSessionPrefKey,
      projectId,
      providerId,
      workspaceId,
    ],
  );

  const localPath = useMemo(
    () =>
      isolatedModal
        ? cwd || null
        : cwd || resolveAgentChatLocalPath(projects, effectiveContextId),
    [cwd, effectiveContextId, isolatedModal, projects],
  );
  const exportableMessages = useMemo(() => buildAgentChatExportableMessages(messages), [messages]);
  const ui = useAgentChatUiHandlers({
    displaySessionTitle: title,
    messages,
    exportableMessages,
    panelTitle: activeAgent?.name ?? "Chat",
    setDefaultRegistryId: (value) => {
      const next = typeof value === "function" ? value(defaultRegistryId) : value;
      setDefaultRegistryId(next);
      writeDefaultAgentRegistryId(next);
    },
  });

  const handlePermission = useCallback((optionKind: string) => {
    if (!pendingPermission) return;
    const option = pendingPermission.options.find(
      (item) => item.option_id === optionKind || item.kind === optionKind,
    );
    if (!activeChatId) return;
    void agentChatApi.permissionRespond(
      activeChatId,
      pendingPermission.request_id,
      option?.option_id ?? optionKind,
    );
    setPendingPermission(null);
  }, [activeChatId, pendingPermission]);

  const handleSessionOp = useCallback((optionId: string) => {
    if (!pendingSessionOp || !activeChatId) return;
    void agentChatApi.sessionOpRespond(
      activeChatId,
      pendingSessionOp.request_id,
      optionId,
    );
    setPendingSessionOp(null);
  }, [activeChatId, pendingSessionOp]);

  const sendCancel = useCallback(() => {
    stoppedRef.current = true;
    if (!activeChatId) return;
    void agentChatApi.cancel(activeChatId);
  }, [activeChatId]);

  return {
    isPanelOpen,
    isConnected: hydrated,
    isConnecting: !hydrated && isResumingHistory,
    connectionPhase: hydrated ? "connected" : "connecting_ws",
    error: sendError,
    chatId: activeChatId,
    followupPolicy: policy,
    supportsSteer,
    agentLocked,
    sessionCwd: cwd || null,
    availableCommands,
    messages,
    setMessages,
    currentPlan,
    backgroundTools,
    pendingPermission,
    pendingPermissionMarkdown: pendingPermission?.content_markdown ?? null,
    pendingSessionOp,
    agentActivity,
    waitingForResponse: busy,
    setWaitingForResponse: (value: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof value === "function" ? value(busy) : value;
      setBusy(next);
    },
    stoppedRef,
    isResumingHistory: isResumingHistory && messages.length === 0,
    isRestoringTranscript: isResumingHistory,
    isResumedSession: messages.length > 0,
    runtimeStatus,
    hasPersistenceHandle,
    installedAgents,
    setInstalledAgents,
    activeAgent,
    registryId,
    defaultRegistryId,
    loadingAgents,
    agentInfo: activeAgent
      ? { name: activeAgent.id, title: activeAgent.name, version: activeAgent.version }
      : null,
    capabilities: null,
    catalogModelsLoading: isOptionsModelsLoading(catalog, providerId),
    refreshEmptyCatalog,
    configOptions,
    modelsLocked: false,
    modesLocked: false,
    setConfigOption,
    setProviderId,
    persistPreferredRegistry,
    setAgentDefaultConfig,
    sessionUsage,
    elapsedMs,
    historyOpen,
    setHistoryOpen,
    historySessions,
    historyHasMore: false,
    historyLoading,
    historyCursor: null,
    historyResumeUnsupportedReason: null,
    historyUnsupportedReason: null,
    loadHistorySessions: async () => {
      if (!wsConnected) return;
      setHistoryLoading(true);
      try {
        const listed = await agentChatApi.list(
          agentChatHistoryListRequest({
            variant,
            workspaceId: workspaceId ?? urlWorkspaceId,
            projectId: projectId ?? urlProjectId,
          }),
        );
        setHistorySessions(chatsToHistoryRows(listed.items ?? []));
      } finally {
        setHistoryLoading(false);
      }
    },
    projects,
    sessionTitle: title,
    displaySessionTitle: title,
    sessionTitleSource: title ? "auto" : null,
    isAutoGeneratingTitle: false,
    shouldScrambleAutoTitle,
    setShouldScrambleAutoTitle,
    chatMode,
    localPath,
    sessionWorkspaceId: workspaceId,
    sessionProjectId: projectId,
    canUseCurrentMode: Boolean(providerId) || hydrated,
    panelTitle: activeAgent?.name ?? "Chat",
    connectionPhaseLabel: hydrated ? t("connectionPhase.connected") : t("connectionPhase.connectingWs"),
    queueKey: getAgentPromptQueueKey(workspaceId, projectId, chatMode, instanceKey),
    queuedPrompts,
    removeQueuedAgentChatPrompt: (id: string) => {
      void removeQueuedAgentChatPrompt(id);
    },
    updateQueuedAgentChatPrompt: (id: string, updates: { prompt: string }) => {
      void updateQueuedAgentChatPrompt(id, updates);
    },
    moveQueuedAgentChatPrompt: (id: string, toIndex: number) => {
      void moveQueuedAgentChatPrompt(id, toIndex);
    },
    newSessionAgentsOpen: ui.newSessionAgentsOpen,
    setNewSessionAgentsOpen: ui.setNewSessionAgentsOpen,
    bottomRef,
    transcriptRef,
    authRequest,
    selectedAuthMethodId,
    setSelectedAuthMethodId,
    clearAuthRequest: () => setAuthRequest(null),
    startSession,
    exportableMessages,
    userMessageIndices: ui.userMessageIndices,
    messageNavIndex: ui.messageNavIndex,
    setMessageNavIndex: ui.setMessageNavIndex,
    scrollToIndexRef: ui.scrollToIndexRef,
    handleSubmit,
    handleClose: () => undefined,
    handleLogoutAgent: async () => undefined,
    handlePermission,
    handleSessionOp,
    handleCreateNewSession,
    handleSelectWorkingDirectory,
    handleSelectHistorySession,
    handleSelectMessage: ui.handleSelectMessage,
    handleSetDefaultAgent: ui.handleSetDefaultAgent,
    handleOpenNewSessionAgentsMenu: ui.handleOpenNewSessionAgentsMenu,
    handleScheduleCloseNewSessionAgentsMenu: ui.handleScheduleCloseNewSessionAgentsMenu,
    handleExportChat: ui.handleExportChat,
    persistHandoffSnapshot: async () => activeChatId || null,
    restoreHandoffSnapshot: async () => true,
    sendCancel,
    disconnect: () => undefined,
  };
}
