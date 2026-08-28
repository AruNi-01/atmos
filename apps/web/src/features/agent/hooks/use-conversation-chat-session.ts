"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import {
  buildQueuedAgentPromptContent,
  getAgentPromptQueueKey,
  useDialogStore,
} from "@/app-shell/state/use-dialog-store";
import { conversationApi, type AgentModelCatalog } from "@/api/ws/conversation-api";
import { agentApi, type RegistryAgent } from "@/api/ws/agent-api";
import { agentApi as agentRestApi } from "@/api/rest-api";
import { agentBehaviourSettingsApi } from "@/api/ws/settings-api";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { DEFAULT_AGENT_CHAT_MODE } from "@/features/agent/types/index";
import type { ThreadEntry } from "@/features/agent/lib/agent/thread";
import {
  deriveAgentActivity,
  readDefaultAgentRegistryId,
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
  conversationEventFor,
  foldTurnsFromEvent,
  type ConversationClientEventPayload,
  type LiveTurn,
} from "@/features/agent/lib/conversation-events";
import { routeBusySubmit, resolveFollowupPolicy } from "@/features/agent/lib/followup-policy";
import {
  catalogToConfigOptions,
  conversationTitleFromPrompt,
  conversationsToHistoryRows,
  currentPlanFromEntries,
  queueToPrompts,
  turnsToThreadEntries,
  type ConversationHistoryRow,
} from "@/features/agent/lib/conversation-thread";

export type AgentChatSlashCommand = {
  name: string;
  description: string;
  hint?: string | null;
};

type SnapshotMeta = {
  title?: string | null;
  supports_steer?: boolean;
  runtime_status?: string;
  provider_id?: string;
  selected_model?: string | null;
  selected_thinking?: string | null;
  workspace_id?: string | null;
  project_id?: string | null;
  cwd?: string;
  last_event_seq?: number;
  available_commands?: AgentChatSlashCommand[];
};

export function useConversationChatSession({
  variant,
  mode = DEFAULT_AGENT_CHAT_MODE,
  active = true,
  contextOverride,
  transformPrompt,
  instanceKey = null,
  conversationId: conversationIdProp,
  onConversationStarted,
  onConversationUpdated,
  onOpenConversation,
}: UseAgentChatSessionOptions & {
  conversationId: string;
  onConversationStarted?: (id: string, meta?: {
    title?: string | null;
    cwd?: string;
    providerId?: string | null;
  }) => void;
  onConversationUpdated?: (id: string, meta: {
    title?: string | null;
    providerId?: string | null;
    cwd?: string;
  }) => void;
  onOpenConversation?: (id: string) => void;
}) {
  const conversationId = conversationIdProp.trim();
  const t = useTranslations("agent.chatSessionTypes");
  const urlContext = useContextParams();
  const { workspaceId: urlWorkspaceId, projectId: urlProjectId, effectiveContextId } =
    contextOverride ?? urlContext;
  const projects = useProjects();
  const isPanelOpen = variant === "modal" ? active : active;
  const chatMode = mode;

  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [runningTurnId, setRunningTurnId] = useState<string | null>(null);
  const [supportsSteer, setSupportsSteer] = useState(false);
  const [policy, setPolicy] = useState<"queue" | "steer">("queue");
  const [queue, setQueue] = useState<Array<{
    id: string;
    seq: number;
    status: string;
    prompt: string;
    display_prompt?: string | null;
    attachments?: string[];
  }>>([]);
  const [providerId, setProviderIdState] = useState("");
  const [activeConversationId, setActiveConversationId] = useState(conversationId);
  const [modelId, setModelId] = useState("");
  const [thinkingId, setThinkingId] = useState("");
  const [catalog, setCatalog] = useState<AgentModelCatalog | null>(null);
  const [installedAgents, setInstalledAgents] = useState<RegistryAgent[]>([]);
  const [defaultRegistryId, setDefaultRegistryId] = useState("");
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(urlWorkspaceId);
  const [projectId, setProjectId] = useState<string | null>(urlProjectId);
  const [cwd, setCwd] = useState("");
  const [title, setTitle] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState<ConversationHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isResumingHistory, setIsResumingHistory] = useState(true);
  const [headerHovered, setHeaderHovered] = useState(false);
  const [shouldScrambleAutoTitle, setShouldScrambleAutoTitle] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [availableCommands, setAvailableCommands] = useState<AgentChatSlashCommand[]>([]);
  const consumedPrompts = useRef(new Set<string>());
  const lastSeq = useRef(0);
  const stoppedRef = useRef(false);
  const pendingSendRef = useRef<{ text: string; attachmentPaths: string[] } | null>(null);
  const activeIdRef = useRef(conversationId);
  const agentLocked = Boolean(activeConversationId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);

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

  const entries = useMemo(() => turnsToThreadEntries(turns), [turns]);
  const currentPlan = useMemo(() => currentPlanFromEntries(entries), [entries]);
  const agentActivity = useMemo(
    () => deriveAgentActivity(entries, busy && entries.at(-1)?.role !== "assistant"),
    [busy, entries],
  );

  const conversationPropRef = useRef(conversationId);
  const onStartedRef = useRef(onConversationStarted);
  const onUpdatedRef = useRef(onConversationUpdated);
  onStartedRef.current = onConversationStarted;
  onUpdatedRef.current = onConversationUpdated;

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    const previous = conversationPropRef.current;
    conversationPropRef.current = conversationId;
    if (conversationId) {
      if (previous !== conversationId) setAvailableCommands([]);
      setActiveConversationId(conversationId);
      return;
    }
    if (previous && !conversationId) {
      setActiveConversationId("");
      setTurns([]);
      setTitle(null);
      setQueue([]);
      setBusy(false);
      setRunningTurnId(null);
      setPendingPermission(null);
      setAvailableCommands([]);
      lastSeq.current = 0;
    }
  }, [conversationId]);

  const load = useCallback(async (id = activeConversationId) => {
    if (!id) return;
    const snapshot = await conversationApi.get(id);
    const meta = snapshot.meta as SnapshotMeta;
    setTitle(meta.title?.trim() || null);
    setSupportsSteer(Boolean(meta.supports_steer));
    const nextTurns = ((snapshot.turns as LiveTurn[]) ?? []).map((turn) => ({
      ...turn,
      messages: turn.messages.map((message) => ({
        ...message,
        parts: message.parts ?? [],
      })),
    }));
    setTurns(nextTurns);
    setBusy(meta.runtime_status === "running_turn" || meta.runtime_status === "waiting_permission");
    const running = nextTurns.find(
      (turn) => turn.status === "running" || turn.status === "waiting_permission",
    );
    setRunningTurnId(running?.id ?? null);
    setQueue((snapshot.queue as typeof queue) ?? []);
    setProviderIdState(meta.provider_id || "claude");
    setModelId(meta.selected_model ?? "");
    setThinkingId(meta.selected_thinking ?? "");
    setWorkspaceId(meta.workspace_id ?? urlWorkspaceId);
    setProjectId(meta.project_id ?? urlProjectId);
    setCwd(meta.cwd ?? "");
    setAvailableCommands(
      (meta.available_commands ?? []).filter((command) => command.name.trim()),
    );
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
      options?: Array<{ option_id: string; name: string; kind?: string }>;
    } | null;
    setPendingPermission(
      pending?.request_id
        ? {
            request_id: pending.request_id,
            tool: pending.tool ?? "",
            description: pending.description ?? "",
            content_markdown: pending.content_markdown,
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
      const listed = await conversationApi.list({
        workspace_id: meta.workspace_id ?? null,
        project_id: meta.project_id ?? null,
      });
      setHistorySessions(conversationsToHistoryRows(listed.items ?? []));
    } finally {
      setHistoryLoading(false);
    }
    lastSeq.current = Number(meta.last_event_seq ?? 0);
    setHydrated(true);
    setIsResumingHistory(false);
  }, [activeConversationId, urlProjectId, urlWorkspaceId]);

  useEffect(() => {
    void agentBehaviourSettingsApi.get().then((settings) => {
      setPolicy(resolveFollowupPolicy(settings.followup_policy));
    });
    const policyTimer = window.setInterval(() => {
      void agentBehaviourSettingsApi.get().then((settings) => {
        setPolicy(resolveFollowupPolicy(settings.followup_policy));
      });
    }, 15_000);
    setLoadingAgents(true);
    void agentApi.listRegistry().then((result) => {
      const installed = (result.agents ?? []).filter((agent) => agent.installed);
      setInstalledAgents(installed);
      const fallback = readDefaultAgentRegistryId() || installed[0]?.id || "";
      setDefaultRegistryId(fallback);
      setProviderIdState((current) => current || fallback);
      setLoadingAgents(false);
    });
    const offCatalog = useWebSocketStore.getState().onEvent("agent_model_catalog_updated", (payload) => {
      const update = payload as { agent_id?: string; catalog?: AgentModelCatalog };
      if (update.agent_id && update.catalog && update.agent_id === providerId) {
        setCatalog(update.catalog);
      }
    });
    if (!activeConversationId) {
      setHydrated(true);
      setIsResumingHistory(false);
      return () => {
        offCatalog();
        window.clearInterval(policyTimer);
      };
    }
    setHydrated(false);
    setIsResumingHistory(true);
    const id = activeConversationId;
    void load(id).then(async () => {
      await conversationApi.subscribe(id, lastSeq.current);
      const pending = pendingSendRef.current;
      pendingSendRef.current = null;
      if (pending) {
        await conversationApi.send(id, pending.text, pending.attachmentPaths);
      }
    });
    const off = useWebSocketStore.getState().onEvent("conversation_event", (payload) => {
      const event = payload as ConversationClientEventPayload;
      if (!conversationEventFor(event, activeIdRef.current)) return;
      if (typeof event.sequence === "number") {
        if (event.sequence <= lastSeq.current) return;
        lastSeq.current = event.sequence;
      }
      setTurns((current) => foldTurnsFromEvent(current, event, activeIdRef.current));
      if (event.payload?.type === "turn_started") {
        setBusy(true);
        setRunningTurnId(event.payload.turn_id ?? null);
      }
      if (event.payload?.type === "turn_completed") {
        setBusy(false);
        setRunningTurnId(null);
        setPendingPermission(null);
      }
      if (event.payload?.type === "permission_requested" && event.payload.request?.request_id) {
        setBusy(true);
        setPendingPermission({
          request_id: event.payload.request.request_id,
          tool: event.payload.request.tool ?? "",
          description: event.payload.request.description ?? "",
          content_markdown: event.payload.request.content_markdown,
          risk_level: "",
          options: (event.payload.request.options ?? []).map((option) => ({
            option_id: option.option_id,
            name: option.name,
            kind: option.kind || option.option_id,
          })),
        });
      }
      if (event.payload?.type === "permission_resolved") {
        setPendingPermission(null);
      }
      if (event.payload?.type === "queue_updated" && event.payload.items) {
        setQueue(event.payload.items);
      }
      if (event.payload?.type === "available_commands_updated") {
        const commands = (event.payload.commands ?? []).flatMap((command) => {
          const name = command.name?.trim();
          if (!name) return [];
          return [{
            name,
            description: command.description?.trim() || name,
            hint: command.hint ?? null,
          }];
        });
        setAvailableCommands(commands);
      }
      if (event.payload?.type === "title_updated") {
        const nextTitle = (event.payload as { title?: string | null }).title;
        if (nextTitle) {
          setTitle(nextTitle);
          setShouldScrambleAutoTitle(true);
          onUpdatedRef.current?.(activeIdRef.current, { title: nextTitle });
        }
      }
      if (event.payload?.type === "runtime_status") {
        const status = (event.payload as { status?: string }).status;
        if (status === "detached" || status === "closed") {
          setBusy(false);
          setRunningTurnId(null);
          setPendingPermission(null);
        }
      }
    });
    return () => {
      off();
      offCatalog();
      window.clearInterval(policyTimer);
      void conversationApi.unsubscribe(id);
    };
  }, [activeConversationId, load, providerId]);

  useEffect(() => {
    if (!providerId) return;
    let cancelled = false;
    void conversationApi.catalogGet(providerId).then((next) => {
      if (!cancelled) setCatalog(next);
    });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  useEffect(() => {
    const key = getAgentPromptQueueKey(workspaceId, projectId, "default", instanceKey);
    const drain = async () => {
      const store = useDialogStore.getState();
      const queued = store.agentChatPromptQueues[key] ?? [];
      for (const item of queued) {
        if (consumedPrompts.current.has(item.id)) continue;
        consumedPrompts.current.add(item.id);
        shiftQueuedAgentChatPrompt(workspaceId, projectId, "default", instanceKey);
        const text = buildQueuedAgentPromptContent(item.prompt, item.attachmentPaths);
        if (!text.trim()) continue;
        if (!activeConversationId) continue;
        if (busy) {
          await conversationApi.queueAdd(activeConversationId, text, item.attachmentPaths);
        } else {
          await conversationApi.send(activeConversationId, text, item.attachmentPaths);
        }
      }
    };
    void drain();
  }, [activeConversationId, busy, instanceKey, projectId, shiftQueuedAgentChatPrompt, turns.length, workspaceId]);

  const persistConfig = useCallback(async (patch: {
    provider_id?: string;
    model?: string;
    thinking?: string;
  }) => {
    if (!activeConversationId) return;
    await conversationApi.configure(activeConversationId, patch);
    void load(activeConversationId);
  }, [activeConversationId, load]);

  const setEntries = useCallback<Dispatch<SetStateAction<ThreadEntry[]>>>(
    () => undefined,
    [],
  );

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
      let id = activeConversationId;
      if (!id) {
        const created = await conversationApi.create({
          provider_id: providerId || defaultRegistryId || "claude",
          model: modelId || null,
          thinking: thinkingId || null,
          cwd: cwd || null,
          workspace_id: workspaceId,
          project_id: projectId,
        });
        id = created.id;
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
        activeIdRef.current = id;
        setActiveConversationId(id);
        const promptTitle = conversationTitleFromPrompt(text);
        const nextTitle = created.title?.trim() || promptTitle || null;
        if (nextTitle) setTitle(nextTitle);
        onStartedRef.current?.(id, {
          title: nextTitle,
          cwd: created.cwd,
          providerId: providerId || defaultRegistryId || null,
        });
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
          await conversationApi.steer(id, runningTurnId, text);
        } else {
          await conversationApi.queueAdd(id, text, attachmentPaths);
        }
      } else {
        await conversationApi.send(id, text, attachmentPaths);
      }
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Could not send that message");
      throw error;
    }
  }, [
    activeConversationId,
    busy,
    cwd,
    defaultRegistryId,
    modelId,
    onConversationStarted,
    policy,
    projectId,
    providerId,
    runningTurnId,
    supportsSteer,
    thinkingId,
    transformPrompt,
    workspaceId,
  ]);

  const handleCreateNewSession = useCallback(async () => {
    onOpenConversation?.("");
  }, [onOpenConversation]);

  const handleSelectHistorySession = useCallback(async (row: ConversationHistoryRow) => {
    setHistoryOpen(false);
    onOpenConversation?.(row.conversation_id);
  }, [onOpenConversation]);

  const queuedPrompts = useMemo(
    () => queueToPrompts(queue, workspaceId, projectId),
    [projectId, queue, workspaceId],
  );

  const removeQueuedAgentChatPrompt = useCallback(async (id: string) => {
    if (!activeConversationId) return;
    await conversationApi.queueDelete(activeConversationId, id);
    removeDialogQueued(id);
    void load(activeConversationId);
  }, [activeConversationId, load, removeDialogQueued]);

  const updateQueuedAgentChatPrompt = useCallback(async (
    id: string,
    updates: { prompt: string },
  ) => {
    if (!activeConversationId) return;
    await conversationApi.queueUpdate(activeConversationId, id, { text: updates.prompt });
    updateDialogQueued(id, updates);
    void load(activeConversationId);
  }, [activeConversationId, load, updateDialogQueued]);

  const moveQueuedAgentChatPrompt = useCallback(async (id: string, toIndex: number) => {
    const ids = queue.map((item) => item.id);
    const fromIndex = ids.indexOf(id);
    if (fromIndex < 0) return;
    ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, id);
    if (!activeConversationId) return;
    await conversationApi.queueReorder(activeConversationId, ids);
    moveDialogQueued(id, toIndex);
    void load(activeConversationId);
  }, [activeConversationId, load, moveDialogQueued, queue]);

  const configOptions = useMemo(
    () => catalogToConfigOptions(catalog, modelId, thinkingId),
    [catalog, modelId, thinkingId],
  );

  const setConfigOption = useCallback((key: string, value: string) => {
    if (key === "model") {
      setModelId(value);
      if (activeConversationId) void persistConfig({ model: value, thinking: "" });
      return;
    }
    if (key === "thinking") {
      setThinkingId(value);
      if (activeConversationId) void persistConfig({ thinking: value });
    }
  }, [activeConversationId, persistConfig]);

  const setProviderId = useCallback((next: string) => {
    if (agentLocked) return;
    setProviderIdState(next);
  }, [agentLocked]);

  const setAgentDefaultConfig = useCallback((configId: string, value: string) => {
    setInstalledAgents((current) =>
      current.map((agent) =>
        agent.id === providerId
          ? { ...agent, default_config: { ...(agent.default_config || {}), [configId]: value } }
          : agent,
      ),
    );
  }, [providerId]);

  const activeAgent = installedAgents.find((agent) => agent.id === providerId) ?? installedAgents[0] ?? null;
  const registryId = activeAgent?.id || providerId;
  const localPath = useMemo(
    () => cwd || resolveAgentChatLocalPath(projects, effectiveContextId),
    [cwd, effectiveContextId, projects],
  );
  const exportableMessages = useMemo(() => buildAgentChatExportableMessages(entries), [entries]);
  const userEntryIndices = useMemo(
    () => entries.map((entry, index) => (entry.role === "user" ? index : -1)).filter((index) => index >= 0),
    [entries],
  );
  const ui = useAgentChatUiHandlers({
    conversationRef,
    displaySessionTitle: title,
    entries,
    exportableMessages,
    panelTitle: activeAgent?.name ?? "Agent Chat",
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
    if (!activeConversationId) return;
    void conversationApi.permissionRespond(
      activeConversationId,
      pendingPermission.request_id,
      option?.option_id ?? optionKind,
    );
    setPendingPermission(null);
  }, [activeConversationId, pendingPermission]);

  const sendCancel = useCallback(() => {
    stoppedRef.current = true;
    if (!activeConversationId) return;
    void conversationApi.cancel(activeConversationId);
  }, [activeConversationId]);

  return {
    isPanelOpen,
    isConnected: hydrated,
    isConnecting: !hydrated && isResumingHistory,
    connectionPhase: hydrated ? "connected" : "connecting_ws",
    error: sendError,
    conversationId: activeConversationId,
    followupPolicy: policy,
    supportsSteer,
    agentLocked,
    sessionCwd: cwd || null,
    availableCommands,
    entries,
    setEntries,
    currentPlan,
    pendingPermission,
    pendingPermissionMarkdown: pendingPermission?.content_markdown ?? null,
    agentActivity,
    waitingForResponse: busy,
    setWaitingForResponse: (value: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof value === "function" ? value(busy) : value;
      setBusy(next);
    },
    stoppedRef,
    isResumingHistory: isResumingHistory && turns.length === 0,
    isResumedSession: turns.length > 0,
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
    configOptions,
    setConfigOption,
    setProviderId,
    setAgentDefaultConfig,
    sessionUsage: null,
    historyOpen,
    setHistoryOpen,
    historySessions,
    historyHasMore: false,
    historyLoading,
    historyCursor: null,
    historyResumeUnsupportedReason: null,
    historyUnsupportedReason: null,
    loadHistorySessions: async () => {
      void load();
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
    canUseCurrentMode: Boolean(providerId),
    panelTitle: activeAgent?.name ?? "Agent Chat",
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
    headerHovered,
    setHeaderHovered,
    bottomRef,
    conversationRef,
    authRequest: null,
    selectedAuthMethodId: "",
    setSelectedAuthMethodId: () => undefined,
    clearAuthRequest: () => undefined,
    startSession: () => undefined,
    exportableMessages,
    userEntryIndices,
    messageNavIndex: ui.messageNavIndex,
    handleSubmit,
    handleClose: () => undefined,
    handleLogoutAgent: async () => undefined,
    handlePermission,
    handleCreateNewSession,
    handleSelectHistorySession,
    handleSelectMessage: ui.handleSelectMessage,
    handleSetDefaultAgent: ui.handleSetDefaultAgent,
    handleOpenNewSessionAgentsMenu: ui.handleOpenNewSessionAgentsMenu,
    handleScheduleCloseNewSessionAgentsMenu: ui.handleScheduleCloseNewSessionAgentsMenu,
    handleExportConversation: ui.handleExportConversation,
    persistHandoffSnapshot: async () => activeConversationId || null,
    restoreHandoffSnapshot: async () => true,
    sendCancel,
    disconnect: () => undefined,
  };
}
