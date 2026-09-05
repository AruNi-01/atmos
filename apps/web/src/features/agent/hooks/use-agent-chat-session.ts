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
import { agentChatApi, type AgentModelCatalog } from "@/api/ws/agent-chat-api";
import { agentApi, type RegistryAgent } from "@/api/ws/agent-api";
import { agentApi as agentRestApi } from "@/api/rest-api";
import { agentBehaviourSettingsApi } from "@/api/ws/settings-api";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { DEFAULT_AGENT_CHAT_MODE } from "@/features/agent/types/index";
import type {
  AgentChatEvent,
  AgentMessage,
  AgentQueueItem,
  AgentSessionUsage,
  SessionAdvertisedOption,
} from "@atmos/api-types/ws/dto/agent-chat";
import {
  persistAgentChatLastSession,
  readAgentChatLastSessions,
  resolveRestoredAgentChat,
} from "@/features/agent/lib/agent-chat-last-session";
import {
  pickInstalledRegistryId,
  preferredConfigFromDefault,
} from "@/features/agent/lib/agent-chat-prefs";
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
  agentChatHistoryListRequest,
  advertisedOptionsToConfigOptions,
  catalogToConfigOptions,
  configKindMatches,
  defaultCatalogModelId,
  isCatalogModelsLoading,
  overlayPendingConfigValues,
  probingCatalog,
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
): { model?: string; thinking?: string; mode?: string } {
  return {
    ...(modelId.trim() ? { model: modelId.trim() } : {}),
    ...(thinkingId.trim() ? { thinking: thinkingId.trim() } : {}),
    ...(modeId.trim() ? { mode: modeId.trim() } : {}),
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
  const urlContext = useContextParams();
  const { workspaceId: urlWorkspaceId, projectId: urlProjectId, effectiveContextId } =
    contextOverride ?? urlContext;
  const projects = useProjects();
  const isPanelOpen = variant === "modal" ? active : active;
  const chatMode = mode;
  const isolatedModal = variant === "modal";
  const lastSessionPrefKey = isolatedModal ? FOOTER_MODAL_CHAT_PREF_KEY : undefined;

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [runningTurnId, setRunningTurnId] = useState<string | null>(null);
  const [supportsSteer, setSupportsSteer] = useState(false);
  const [policy, setPolicy] = useState<"queue" | "steer">("queue");
  const [queue, setQueue] = useState<AgentQueueItem[]>([]);
  const [providerId, setProviderIdState] = useState("");
  const [activeChatId, setActiveChatId] = useState(chatId);
  const [modelId, setModelId] = useState("");
  const [thinkingId, setThinkingId] = useState("");
  const [modeId, setModeId] = useState("");
  const [catalog, setCatalog] = useState<AgentModelCatalog | null>(null);
  const [installedAgents, setInstalledAgents] = useState<RegistryAgent[]>([]);
  const [defaultRegistryId, setDefaultRegistryId] = useState("");
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    isolatedModal ? null : urlWorkspaceId,
  );
  const [projectId, setProjectId] = useState<string | null>(isolatedModal ? null : urlProjectId);
  const [cwd, setCwd] = useState("");
  const [title, setTitle] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState<AgentChatHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isResumingHistory, setIsResumingHistory] = useState(
    () => Boolean(chatId) && resumeTranscript,
  );
  const [shouldScrambleAutoTitle, setShouldScrambleAutoTitle] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<string | null>(null);
  const [hasPersistenceHandle, setHasPersistenceHandle] = useState(false);
  const [sessionConfigOptions, setSessionConfigOptions] = useState<SessionAdvertisedOption[]>([]);
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
  const creatingChatRef = useRef<Promise<string> | null>(null);
  const resumeTranscriptRef = useRef(resumeTranscript);
  resumeTranscriptRef.current = resumeTranscript;
  const activeIdRef = useRef(chatId);
  const providerIdRef = useRef(providerId);
  providerIdRef.current = providerId;
  const restoreAttemptedRef = useRef(false);
  const [prefsRestored, setPrefsRestored] = useState(false);
  const lastPersistedRegistryRef = useRef("");
  const lastPersistedConfigRef = useRef({ registry: "", model: "", thinking: "" });
  const wsConnected = useWebSocketStore((state) => state.connectionState === "connected");
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
    () => deriveAgentActivity(messages, busy && messages.at(-1)?.role !== "assistant"),
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
  onStartedRef.current = onChatStarted;
  onUpdatedRef.current = onChatUpdated;

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
      setSessionCommands([]);
      setSessionUsage(null);
      setTurnStartedAt(null);
      setElapsedMs(0);
      lastSeq.current = 0;
      setRuntimeStatus("detached");
      setHasPersistenceHandle(false);
      setSessionConfigOptions([]);
    }
  }, [chatId]);

  const load = useCallback(async (id = activeChatId) => {
    if (!id) return;
    const snapshot = await agentChatApi.get(id);
    const meta = snapshot.meta;
    setTitle(meta.title?.trim() || null);
    setSupportsSteer(Boolean(meta.supports_steer));
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
    setSessionConfigOptions(meta.session_config_options ?? []);
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
    setModelId(meta.selected_model ?? "");
    setThinkingId(meta.selected_thinking ?? "");
    setModeId(meta.selected_mode ?? "");
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
      questions?: unknown;
      raw_input?: unknown;
      options?: Array<{ option_id: string; name: string; kind?: string }>;
    } | null;
    setPendingPermission(
      pending?.request_id
        ? {
            request_id: pending.request_id,
            tool: pending.tool ?? "",
            description: pending.description ?? "",
            content_markdown: pending.content_markdown ?? undefined,
            questions: pending.questions,
            raw_input: pending.raw_input,
            risk_level: "",
            options: (pending.options ?? []).map((option) => ({
              option_id: option.option_id,
              name: option.name,
              kind: option.kind || option.option_id,
            })),
          }
        : null,
    );
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
    setLoadingAgents(true);
    void Promise.all([
      agentApi.listRegistry(),
      agentChatApi.prefsGet().catch(() => ({ last_registry_id: null })),
    ]).then(([result, prefs]) => {
      const agents = result.agents ?? [];
      const installed = agents.filter((agent) => agent.installed);
      const installedIds = installed.map((agent) => agent.id);
      setInstalledAgents(installed);
      const lastRegistryId = pickInstalledRegistryId(
        installedIds,
        prefs.last_registry_id,
      );
      lastPersistedRegistryRef.current = lastRegistryId;
      const fallback =
        lastRegistryId ||
        readDefaultAgentRegistryId() ||
        installed[0]?.id ||
        agents[0]?.id ||
        "claude";
      setDefaultRegistryId(fallback);
      const isNewChat = !activeIdRef.current;
      const currentRegistry = pickInstalledRegistryId(
        installedIds,
        providerIdRef.current,
      );
      const appliedRegistry = isNewChat
        ? lastRegistryId || currentRegistry || installed[0]?.id || fallback
        : currentRegistry;
      setProviderIdState((current) => {
        if (isNewChat && lastRegistryId) return lastRegistryId;
        if (current && installed.some((agent) => agent.id === current)) return current;
        if (installed[0]) return installed[0].id;
        return current || fallback;
      });
      if (isNewChat && appliedRegistry) {
        const preferred = preferredConfigFromDefault(
          installed.find((agent) => agent.id === appliedRegistry)?.default_config,
        );
        lastPersistedConfigRef.current = {
          registry: appliedRegistry,
          model: preferred.modelId,
          thinking: preferred.thinkingId,
        };
        if (preferred.modelId) {
          setModelId((current) => current || preferred.modelId);
        }
        if (preferred.thinkingId) {
          setThinkingId((current) => current || preferred.thinkingId);
        }
      }
      setPrefsRestored(true);
      setLoadingAgents(false);
    }).catch(() => {
      const fallback = readDefaultAgentRegistryId() || "claude";
      setDefaultRegistryId((current) => current || fallback);
      setProviderIdState((current) => current || fallback);
      setPrefsRestored(true);
      setLoadingAgents(false);
    });
  }, [wsConnected]);

  useEffect(() => {
    return useWebSocketStore.getState().onEvent("agent_model_catalog_updated", (payload) => {
      const update = payload as { agent_id?: string; catalog?: AgentModelCatalog };
      if (update.agent_id && update.catalog && update.agent_id === providerIdRef.current) {
        setCatalog(update.catalog);
      }
    });
  }, []);

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
      if (payload.type === "turn_completed") {
        setBusy(false);
        setRunningTurnId(null);
        setPendingPermission(null);
        setTurnStartedAt(null);
      }
      if (payload.type === "usage_updated") {
        if (payload.session) setSessionUsage(payload.session);
      }
      if (payload.type === "permission_requested" && payload.request?.request_id) {
        setBusy(true);
        setPendingPermission({
          request_id: payload.request.request_id,
          tool: payload.request.tool ?? "",
          description: payload.request.description ?? "",
          content_markdown: payload.request.content_markdown,
          questions: payload.request.questions,
          raw_input: payload.request.raw_input,
          risk_level: "",
          options: (payload.request.options ?? []).map((option) => ({
            option_id: option.option_id,
            name: option.name,
            kind: option.kind || option.option_id,
          })),
        });
      }
      if (payload.type === "permission_resolved") {
        setPendingPermission(null);
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
        const fromOptions = (kind: string) =>
          payload.config_options?.find((row) => configKindMatches(row.id, row.category, kind))
            ?.current_value?.trim() ?? "";
        const model = payload.model?.trim() || fromOptions("model");
        if (model) setModelId(model);
        const thinking = payload.thinking?.trim() || fromOptions("thinking");
        if (thinking) setThinkingId(thinking);
        const mode = payload.mode?.trim() || fromOptions("mode");
        if (mode) setModeId(mode);
        if (payload.config_options?.length) {
          setSessionConfigOptions(payload.config_options);
        }
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
    let cancelled = false;
    void agentChatApi.catalogGet(providerId).then((next) => {
      if (!cancelled) setCatalog(next);
    });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const refreshEmptyCatalog = useCallback(() => {
    const id = providerIdRef.current;
    if (!id) return;
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
      return probingCatalog(id);
    });
    if (skip) return;
    void agentChatApi.catalogGet(id, true).then((next) => {
      if (providerIdRef.current === id) setCatalog(next);
    });
  }, []);

  useEffect(() => {
    if (!prefsRestored) return;
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
      installedAgents.find((agent) => agent.id === providerId)?.default_config,
    );
    setModeId((current) =>
      current || catalog.modes.find((mode) => mode.is_default)?.id || catalog.modes[0]?.id || "",
    );
    const resolvedModelId = defaultCatalogModelId(catalog, modelId || preferred.modelId);
    setModelId(resolvedModelId);
    setThinkingId((current) => {
      const choices = thinkingChoices(catalog, resolvedModelId);
      const preferredThinking = current || preferred.thinkingId;
      if (preferredThinking && choices.includes(preferredThinking)) return preferredThinking;
      return choices[0] || "";
    });
  }, [
    catalog,
    hasPersistenceHandle,
    installedAgents,
    messages.length,
    modelId,
    prefsRestored,
    providerId,
    runtimeStatus,
  ]);

  const persistNewSessionPreferences = useCallback((
    registryId: string,
    model: string,
    thinking: string,
  ) => {
    const registry = registryId.trim();
    if (!registry) return;
    if (lastPersistedRegistryRef.current !== registry) {
      lastPersistedRegistryRef.current = registry;
      void agentChatApi.prefsSet({ last_registry_id: registry }).catch(() => undefined);
    }
    const nextModel = model.trim();
    const nextThinking = thinking.trim();
    lastPersistedConfigRef.current = {
      registry,
      model: nextModel,
      thinking: nextThinking,
    };
    setInstalledAgents((current) =>
      current.map((agent) =>
        agent.id === registry
          ? {
              ...agent,
              default_config: {
                ...(agent.default_config || {}),
                ...(nextModel ? { model: nextModel } : {}),
                ...(nextThinking ? { thinking: nextThinking } : {}),
              },
            }
          : agent,
      ),
    );
    if (nextModel) {
      void agentApi.setDefaultConfig(registry, "model", nextModel).catch(() => undefined);
    }
    if (nextThinking) {
      void agentApi.setDefaultConfig(registry, "thinking", nextThinking).catch(() => undefined);
    }
  }, []);

  const persistConfig = useCallback(async (patch: {
    provider_id?: string;
    model?: string;
    thinking?: string;
    mode?: string;
  }) => {
    const id = activeChatId || activeIdRef.current;
    if (!id) return;
    if (!patch.provider_id && !patch.model && !patch.thinking && !patch.mode) return;
    const meta = await agentChatApi.configure(id, patch);
    setProviderIdState(meta.provider_id || "claude");
    setModelId(meta.selected_model ?? "");
    setThinkingId(meta.selected_thinking ?? "");
    setModeId(meta.selected_mode ?? "");
  }, [activeChatId]);

  const ensureCreatedChat = useCallback(async (input?: { title?: string | null }) => {
    const existing = activeIdRef.current.trim();
    if (existing) return existing;
    if (creatingChatRef.current) return creatingChatRef.current;
    const registry = providerId || defaultRegistryId || "claude";
    const pending = (async () => {
      persistNewSessionPreferences(registry, modelId, thinkingId);
      const created = await agentChatApi.create({
        provider_id: registry,
        model: modelId || null,
        thinking: thinkingId || null,
        mode: modeId || null,
        cwd: cwd || null,
        workspace_id: workspaceId,
        project_id: projectId,
        space_id: isolatedModal
          ? null
          : spaceIdForChatCreate(paintContextId, workspaceId || projectId),
        title: input?.title ?? null,
        origin: isolatedModal ? "quick" : "normal",
      });
      const id = created.id;
      activeIdRef.current = id;
      setActiveChatId(id);
      const nextTitle = created.title?.trim() || input?.title?.trim() || null;
      if (nextTitle) setTitle(nextTitle);
      onStartedRef.current?.(id, {
        title: nextTitle,
        cwd: created.cwd,
        providerId: registry,
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
    cwd,
    defaultRegistryId,
    isolatedModal,
    modeId,
    modelId,
    paintContextId,
    persistNewSessionPreferences,
    projectId,
    providerId,
    thinkingId,
    workspaceId,
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
          persistNewSessionPreferences(registry, modelId, thinkingId);
          const created = await agentChatApi.create({
            provider_id: registry,
            model: modelId || null,
            thinking: thinkingId || null,
            mode: modeId || null,
            cwd: cwd || null,
            workspace_id: workspaceId,
            project_id: projectId,
            space_id: isolatedModal
              ? null
              : spaceIdForChatCreate(paintContextId, workspaceId || projectId),
            title: item.sessionTitle ?? null,
            origin: isolatedModal ? "quick" : "normal",
          });
          id = created.id;
          pendingSendRef.current = { text, attachmentPaths: item.attachmentPaths ?? [] };
          activeIdRef.current = id;
          setActiveChatId(id);
          onStartedRef.current?.(id, {
            title: created.title?.trim() || item.sessionTitle || chatTitleFromPrompt(text) || null,
            cwd: created.cwd,
            providerId: item.registryId || providerId || defaultRegistryId || null,
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
        await persistConfig(pendingSessionConfigPatch(modelId, thinkingId, modeId));
        if (busy) {
          await agentChatApi.queueAdd(id, text, item.attachmentPaths);
        } else {
          await agentChatApi.send(id, text, item.attachmentPaths);
        }
      }
    };
    void drain();
  }, [
    activeChatId,
    busy,
    cwd,
    defaultRegistryId,
    instanceKey,
    isolatedModal,
    paintContextId,
    modeId,
    modelId,
    persistConfig,
    persistNewSessionPreferences,
    ensureCreatedChat,
    projectId,
    providerId,
    shiftQueuedAgentChatPrompt,
    thinkingId,
    messages.length,
    workspaceId,
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
            await persistConfig(pendingSessionConfigPatch(modelId, thinkingId, modeId));
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
        await persistConfig(pendingSessionConfigPatch(modelId, thinkingId, modeId));
        await agentChatApi.queueAdd(id, text, attachmentPaths);
      } else {
        await persistConfig(pendingSessionConfigPatch(modelId, thinkingId, modeId));
        await agentChatApi.send(id, text, attachmentPaths);
      }
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Could not send that message");
      throw error;
    }
  }, [
    activeChatId,
    busy,
    cwd,
    defaultRegistryId,
    isolatedModal,
    modeId,
    modelId,
    paintContextId,
    persistConfig,
    ensureCreatedChat,
    policy,
    projectId,
    providerId,
    runningTurnId,
    supportsSteer,
    thinkingId,
    transformPrompt,
    workspaceId,
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
    if (targetRegistryId) {
      setProviderIdState(targetRegistryId);
      setCatalog(null);
    }
    const preferred = preferredConfigFromDefault(
      installedAgents.find((agent) => agent.id === nextRegistry)?.default_config,
    );
    setModelId(preferred.modelId);
    setThinkingId(preferred.thinkingId);
    setModeId("");
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
    setSessionCommands([]);
    setSessionUsage(null);
    setTurnStartedAt(null);
    setElapsedMs(0);
    lastSeq.current = 0;
    setRuntimeStatus("detached");
    setHasPersistenceHandle(false);
    setSessionConfigOptions([]);
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

  const configOptions = useMemo(() => {
    const catalogOptions = catalogToConfigOptions(catalog, modelId, thinkingId, modeId);
    const advertised = advertisedOptionsToConfigOptions(sessionConfigOptions);
    const base = advertised.length > 0 ? advertised : catalogOptions;
    return overlayPendingConfigValues(base, { modelId, modeId, thinkingId });
  }, [catalog, modeId, modelId, sessionConfigOptions, thinkingId]);

  const setAgentDefaultConfig = useCallback((configId: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const registry = providerIdRef.current.trim();
    if (!registry) return;
    setInstalledAgents((current) => {
      const agent = current.find((item) => item.id === registry);
      if (agent?.default_config?.[configId] === trimmed) return current;
      return current.map((item) =>
        item.id === registry
          ? { ...item, default_config: { ...(item.default_config || {}), [configId]: trimmed } }
          : item,
      );
    });
    const key = configId === "model" || configId === "models"
      ? "model"
      : configId === "thinking" || configId === "think" || configId === "thought_level"
        ? "thinking"
        : null;
    if (
      key &&
      lastPersistedConfigRef.current.registry === registry &&
      lastPersistedConfigRef.current[key] === trimmed
    ) {
      return;
    }
    if (key) {
      lastPersistedConfigRef.current = {
        ...lastPersistedConfigRef.current,
        registry,
        [key]: trimmed,
      };
    }
    void agentApi.setDefaultConfig(registry, configId, trimmed).catch(() => undefined);
  }, []);

  const setConfigOption = useCallback((key: string, value: string) => {
    if (configKindMatches(key, undefined, "model")) {
      setModelId(value);
      return;
    }
    if (configKindMatches(key, undefined, "thinking")) {
      setThinkingId(value);
      return;
    }
    if (configKindMatches(key, undefined, "mode")) {
      setModeId(value);
    }
  }, []);

  const setProviderId = useCallback((next: string) => {
    if (agentLocked) return;
    setProviderIdState(next);
    setCatalog(null);
    const preferred = preferredConfigFromDefault(
      installedAgents.find((agent) => agent.id === next)?.default_config,
    );
    setModelId(preferred.modelId);
    setThinkingId(preferred.thinkingId);
    setModeId("");
    persistPreferredRegistry(next);
    if (activeIdRef.current) {
      void persistConfig({
        provider_id: next,
        ...(preferred.modelId ? { model: preferred.modelId } : {}),
        ...(preferred.thinkingId ? { thinking: preferred.thinkingId } : {}),
      });
    }
  }, [agentLocked, installedAgents, persistConfig, persistPreferredRegistry]);

  const activeAgent = installedAgents.find((agent) => agent.id === providerId) ?? installedAgents[0] ?? null;
  const registryId = activeAgent?.id || providerId;
  const cachedCommands = useAgentSlashCommandCache((state) => {
    const id = (providerId || defaultRegistryId).trim();
    if (!id) return EMPTY_AGENT_SLASH_COMMANDS;
    return state.byProviderId[id] ?? EMPTY_AGENT_SLASH_COMMANDS;
  });
  const availableCommands = resolveAgentSlashCommands(sessionCommands, cachedCommands);

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
    setSessionCommands([]);
    setSessionUsage(null);
    setTurnStartedAt(null);
    setElapsedMs(0);
    lastSeq.current = 0;
    setRuntimeStatus("detached");
    setHasPersistenceHandle(false);
    setSessionConfigOptions([]);
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

  const handleAskUserAnswers = useCallback((answers: Record<string, string | string[]>) => {
    if (!pendingPermission || !activeChatId) return;
    const allow = pendingPermission.options.find(
      (item) =>
        item.kind === "allow_once"
        || item.kind === "allow_always"
        || /allow|yes|submit|continue/i.test(item.option_id),
    );
    void agentChatApi.permissionRespond(
      activeChatId,
      pendingPermission.request_id,
      allow?.option_id ?? "allow_once",
      { answers },
    );
    setPendingPermission(null);
  }, [activeChatId, pendingPermission]);

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
    capabilities: {
      session_list: { supported: true, reason: null },
      session_resume: { supported: true, reason: null },
      session_close: { supported: false, reason: null },
      logout: { supported: false, reason: null },
      config_options: { supported: configOptions.length > 0, reason: null },
      session_info_update: { supported: true, reason: null },
      load_session: { supported: true, reason: null },
    },
    catalogModelsLoading: isCatalogModelsLoading(catalog, providerId),
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
    authRequest: null,
    selectedAuthMethodId: "",
    setSelectedAuthMethodId: () => undefined,
    clearAuthRequest: () => undefined,
    startSession: () => undefined,
    exportableMessages,
    userMessageIndices: ui.userMessageIndices,
    messageNavIndex: ui.messageNavIndex,
    setMessageNavIndex: ui.setMessageNavIndex,
    scrollToIndexRef: ui.scrollToIndexRef,
    handleSubmit,
    handleClose: () => undefined,
    handleLogoutAgent: async () => undefined,
    handlePermission,
    handleAskUserAnswers,
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
