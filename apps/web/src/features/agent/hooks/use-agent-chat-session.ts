"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryState } from "nuqs";
import { useShallow } from "zustand/react/shallow";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { agentChatParams } from "@/shared/lib/nuqs/searchParams";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import {
  getAgentPromptQueueKey,
  useDialogStore,
  type QueuedAgentPrompt,
} from "@/app-shell/state/use-dialog-store";
import { useAgentChatUrl } from "@/features/agent/hooks/use-agent-chat-url";
import {
  useAgentSession,
  type AgentPlan,
} from "@/features/agent/hooks/use-agent-session";
import { agentApi } from "@/api/ws-api";
import type { RegistryAgent } from "@/api/ws-api";
import { DEFAULT_AGENT_CHAT_MODE } from "@/features/agent/types/index";
import {
  type ThreadEntry,
} from "@/features/agent/lib/agent/thread";
import {
  type PendingPermission,
  clearAgentLastSession,
  getSessionContextKey,
  readAgentLastSession,
  readDefaultAgentRegistryId,
  writeDefaultAgentRegistryId,
  deriveAgentActivity,
  writeAgentLastSession,
} from "../lib/chat-helpers";
import {
  buildAgentChatExportableMessages,
  DEFAULT_SESSION_TITLE,
  getConnectionPhaseLabel,
  resolveAgentChatLocalPath,
  type UseAgentChatSessionOptions,
  type UseAgentChatSessionReturn,
} from "./use-agent-chat-session-types";
import {
  getAgentChatSessionHandoffIdentity,
  readAgentChatSessionHandoff,
  subscribeAgentChatSessionHandoff,
  writeAgentChatSessionHandoff,
  type AgentChatSessionHandoffSnapshot,
} from "../lib/agent-chat-session-handoff";
import { useAgentChatMessageHandler } from "./use-agent-chat-message-handler";
import { useAcpSessionList } from "./use-acp-session-list";
import { useAgentChatHistoryHandlers } from "./use-agent-chat-history-handlers";
import { useAgentChatSubmitHandler } from "./use-agent-chat-submit-handler";
import { useAgentChatStatusPublisher } from "./use-agent-chat-status-publisher";
import { useAgentChatUiHandlers } from "./use-agent-chat-ui-handlers";

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useAgentChatSession({
  variant,
  mode = DEFAULT_AGENT_CHAT_MODE,
  publishStatus,
  active = true,
  historyListActive = false,
  contextOverride,
  transformPrompt,
  instanceKey = null,
  initialSessionBinding = null,
  onSessionBindingChange,
}: UseAgentChatSessionOptions): UseAgentChatSessionReturn {
  const t = useTranslations("agent.chatSessionTypes");
  const urlContext = useContextParams();
  const { workspaceId, projectId, effectiveContextId } = contextOverride ?? urlContext;
  const [isAgentChatOpen, setAgentChatOpen] = useAgentChatUrl();
  const [targetAgentId] = useQueryState("agent", agentChatParams.agent);
  const [targetSessionId] = useQueryState("session", agentChatParams.session);
  const [targetSessionCwd] = useQueryState("sessionCwd", agentChatParams.sessionCwd);
  const [targetHandoffToken] = useQueryState("handoffToken", agentChatParams.handoffToken);
  const {
    agentChatPromptQueues,
    enqueueAgentChatPrompt,
    removeQueuedAgentChatPrompt,
    updateQueuedAgentChatPrompt,
    moveQueuedAgentChatPrompt,
    clearAgentChatDraft,
  } = useDialogStore(
    useShallow((s) => ({
      agentChatPromptQueues: s.agentChatPromptQueues,
      enqueueAgentChatPrompt: s.enqueueAgentChatPrompt,
      removeQueuedAgentChatPrompt: s.removeQueuedAgentChatPrompt,
      updateQueuedAgentChatPrompt: s.updateQueuedAgentChatPrompt,
      moveQueuedAgentChatPrompt: s.moveQueuedAgentChatPrompt,
      clearAgentChatDraft: s.clearAgentChatDraft,
    })),
  );

  const isPanelOpen = variant === "modal" ? isAgentChatOpen : active;
  const chatMode = mode;
  const [entries, setEntries] = useState<ThreadEntry[]>([]);
  const [currentPlan, setCurrentPlan] = useState<AgentPlan | null>(null);
  const [installedAgents, setInstalledAgents] = useState<RegistryAgent[]>([]);
  const [registryId, setRegistryId] = useState<string>("");
  const [defaultRegistryId, setDefaultRegistryId] = useState<string>("");
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [hasLoadedAgents, setHasLoadedAgents] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isResumingHistory, setIsResumingHistory] = useState(false);
  const [isResumedSession, setIsResumedSession] = useState(false);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [sessionTitleSource, setSessionTitleSource] = useState<string | null>(null);
  const [isAutoGeneratingTitle, setIsAutoGeneratingTitle] = useState(false);
  const [shouldScrambleAutoTitle, setShouldScrambleAutoTitle] = useState(false);
  const [headerHovered, setHeaderHovered] = useState(false);
  const [selectedAuthMethodId, setSelectedAuthMethodId] = useState<string>("");
  const [activeSessionByContext, setActiveSessionByContext] = useState<Record<string, string>>(
    {}
  );
  const activeSessionByContextRef = useRef<Record<string, string>>({});
  const entriesByContextRef = useRef<Record<string, ThreadEntry[]>>({});
  const planByContextRef = useRef<Record<string, AgentPlan | null>>({});
  const sessionTitleByContextRef = useRef<Record<string, string | null>>({});
  const sessionTitleSourceByContextRef = useRef<Record<string, string | null>>({});
  const projects = useProjects();
  const restoreAttemptedRef = useRef(false);
  const autoResumeTriedRef = useRef<string | null>(null);
  const autoStartHandledRef = useRef(false);
  const handledDeepLinkRef = useRef<string | null>(null);
  const dispatchingQueuedPromptIdRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);
  const forcedDisconnectDoneRef = useRef(false);
  const connectedContextKeyRef = useRef<string | null>(null);
  const skipRestoreReplayRef = useRef(false);
  const lastAppliedHandoffIdentityRef = useRef<string | null>(null);
  const handoffTokenRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch projects when panel opens
  // ---------------------------------------------------------------------------
  // Projects are now loaded by the TanStack Query bootstrap; no manual fetch needed.

  const localPath = React.useMemo(
    () => resolveAgentChatLocalPath(projects, effectiveContextId),
    [projects, effectiveContextId],
  );

  useEffect(() => {
    handoffTokenRef.current = targetHandoffToken || handoffTokenRef.current;
  }, [targetHandoffToken]);

  const clearDeepLinkSessionParams = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("agent");
    url.searchParams.delete("session");
    url.searchParams.delete("sessionCwd");
    url.searchParams.delete("handoffToken");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const canUseCurrentMode = true;
  const sessionWorkspaceId = workspaceId;
  const sessionProjectId = projectId;
  const skipNextAutoConnectRef = useRef(false);
  const contextKey = React.useMemo(() => {
    const base = getSessionContextKey(sessionWorkspaceId, sessionProjectId, chatMode);
    const instance = instanceKey?.trim();
    return instance ? `instance:${instance}:${base}` : base;
  }, [chatMode, instanceKey, sessionProjectId, sessionWorkspaceId]);
  const queueKey = React.useMemo(
    () => getAgentPromptQueueKey(sessionWorkspaceId, sessionProjectId, chatMode, instanceKey),
    [sessionWorkspaceId, sessionProjectId, chatMode, instanceKey]
  );
  const queuedPrompts = useMemo(
    () => agentChatPromptQueues[queueKey] ?? [],
    [agentChatPromptQueues, queueKey]
  );
  const queuedPromptHead = queuedPrompts[0] ?? null;
  const {
    sessions: historySessions,
    setSessions: setHistorySessions,
    cursor: historyCursor,
    hasMore: historyHasMore,
    isLoading: historyLoading,
    resumeUnsupportedReason: historyResumeUnsupportedReason,
    unsupportedReason: historyUnsupportedReason,
    loadSessions: loadHistorySessions,
  } = useAcpSessionList({
    registryId,
    authMethodId: selectedAuthMethodId || null,
    enabled: historyOpen || historyListActive || variant === "standalone",
  });

  const { handleMessage, pendingPermissionMarkdown } = useAgentChatMessageHandler({
    entries,
    isResumingHistory,
    pendingPermission,
    sessionTitle,
    skipRestoreReplayRef,
    setCurrentPlan,
    setEntries,
    setHistorySessions,
    setIsAutoGeneratingTitle,
    setIsResumingHistory,
    setPendingPermission,
    setSessionTitle,
    setSessionTitleSource,
    setShouldScrambleAutoTitle,
    setWaitingForResponse,
    stoppedRef,
  });

  // ---------------------------------------------------------------------------
  // Agent session hook
  // ---------------------------------------------------------------------------
  const {
    sessionId,
    acpSessionId,
    isConnecting,
    isConnected,
    connectionPhase,
    error,
    authRequest,
    agentInfo,
    capabilities,
    sendPrompt,
    sendCancel,
    sendPermissionResponse,
    startSession,
    resumeSession,
    clearAuthRequest,
    disconnect,
    disconnectStashed,
    sessionCwd,
    sessionTitle: activeSessionTitle,
    configOptions,
    sessionUsage,
    setConfigOption,
    setAgentDefaultConfig,
    logoutAgent,
  } = useAgentSession({
    workspaceId: sessionWorkspaceId,
    projectId: sessionProjectId,
    registryId,
    onMessage: handleMessage,
  });

  useAgentChatStatusPublisher({
    installedAgentCount: installedAgents.length,
    isConnected,
    publishStatus,
    waitingForResponse,
  });

  const agentActivity = useMemo(
    () => deriveAgentActivity(entries, waitingForResponse),
    [entries, waitingForResponse]
  );

  const activeAgent = installedAgents.find((agent) => agent.id === registryId) ?? null;
  const displaySessionTitle =
    sessionTitle && sessionTitle !== DEFAULT_SESSION_TITLE ? sessionTitle : null;
  const panelTitle = activeAgent?.name ?? "Agent Chat";
  const exportableMessages = useMemo(
    () => buildAgentChatExportableMessages(entries),
    [entries],
  );

  const {
    handleExportConversation,
    handleOpenNewSessionAgentsMenu,
    handleScheduleCloseNewSessionAgentsMenu,
    handleSelectMessage,
    handleSetDefaultAgent,
    messageNavIndex,
    newSessionAgentsOpen,
    setNewSessionAgentsOpen,
    userEntryIndices,
  } = useAgentChatUiHandlers({
    conversationRef,
    displaySessionTitle,
    entries,
    exportableMessages,
    panelTitle,
    setDefaultRegistryId,
  });

  const buildHandoffSnapshot = useCallback((): AgentChatSessionHandoffSnapshot | null => {
    if (!contextKey || (!sessionId && !acpSessionId && entries.length === 0)) return null;
    return {
      version: 1,
      contextKey,
      registryId,
      runtimeSessionId: sessionId,
      acpSessionId,
      sessionCwd: sessionCwd ?? localPath,
      sessionTitle,
      sessionTitleSource,
      entries,
      currentPlan,
      pendingPermission,
      waitingForResponse,
      isResumedSession,
      isAutoGeneratingTitle,
      shouldScrambleAutoTitle,
      updatedAt: Date.now(),
    };
  }, [
    acpSessionId,
    contextKey,
    currentPlan,
    entries,
    isAutoGeneratingTitle,
    isResumedSession,
    localPath,
    pendingPermission,
    registryId,
    sessionCwd,
    sessionId,
    sessionTitle,
    sessionTitleSource,
    shouldScrambleAutoTitle,
    waitingForResponse,
  ]);

  const persistHandoffSnapshot = useCallback(async () => {
    const snapshot = buildHandoffSnapshot();
    if (!snapshot) return null;
    const token = await writeAgentChatSessionHandoff(snapshot, handoffTokenRef.current);
    if (token) {
      handoffTokenRef.current = token;
    }
    return token;
  }, [buildHandoffSnapshot]);

  const applyHandoffSnapshot = useCallback(
    (
      snapshot: AgentChatSessionHandoffSnapshot | null,
      expectedAcpSessionId?: string | null,
    ) => {
      if (!snapshot) return false;
      if (snapshot.contextKey !== contextKey) return false;
      if (expectedAcpSessionId && snapshot.acpSessionId !== expectedAcpSessionId) {
        return false;
      }

      const identity = getAgentChatSessionHandoffIdentity(snapshot);
      if (lastAppliedHandoffIdentityRef.current === identity) return false;
      lastAppliedHandoffIdentityRef.current = identity;
      skipRestoreReplayRef.current = Boolean(snapshot.acpSessionId);

      if (snapshot.registryId) {
        setRegistryId(snapshot.registryId);
      }
      if (snapshot.runtimeSessionId) {
        const nextMap = {
          ...activeSessionByContextRef.current,
          [contextKey]: snapshot.runtimeSessionId,
        };
        activeSessionByContextRef.current = nextMap;
        setActiveSessionByContext(nextMap);
      }
      setEntries(snapshot.entries);
      setCurrentPlan(snapshot.currentPlan);
      setPendingPermission(snapshot.pendingPermission);
      setSessionTitle(snapshot.sessionTitle);
      setSessionTitleSource(snapshot.sessionTitleSource);
      setIsAutoGeneratingTitle(snapshot.isAutoGeneratingTitle);
      setShouldScrambleAutoTitle(snapshot.shouldScrambleAutoTitle);
      setIsResumedSession(snapshot.isResumedSession);
      setWaitingForResponse(snapshot.waitingForResponse);
      stoppedRef.current = false;
      return true;
    },
    [contextKey],
  );

  const restoreHandoffSnapshot = useCallback(
    async (expectedAcpSessionId?: string | null) => {
      const token = handoffTokenRef.current || targetHandoffToken || null;
      return applyHandoffSnapshot(
        await readAgentChatSessionHandoff(contextKey, expectedAcpSessionId, token),
        expectedAcpSessionId,
      );
    },
    [applyHandoffSnapshot, contextKey, targetHandoffToken],
  );

  useEffect(() => {
    if (!isPanelOpen || !active || variant !== "standalone") return;
    const snapshot = buildHandoffSnapshot();
    if (!snapshot) return;
    const timeout = window.setTimeout(() => {
      void writeAgentChatSessionHandoff(snapshot, handoffTokenRef.current).then((token) => {
        if (token) {
          handoffTokenRef.current = token;
        }
      });
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [active, buildHandoffSnapshot, isPanelOpen, variant]);

  useEffect(() => {
    if (!isPanelOpen) return;
    return subscribeAgentChatSessionHandoff(contextKey, (snapshot) => {
      applyHandoffSnapshot(snapshot);
    });
  }, [applyHandoffSnapshot, contextKey, isPanelOpen]);

  const {
    handleSelectHistorySession: handleSelectHistorySessionBase,
  } = useAgentChatHistoryHandlers({
    autoResumeTriedRef,
    autoStartHandledRef,
    canUseCurrentMode,
    disconnect,
    isConnected,
    isConnecting,
    projectId: sessionProjectId,
    resumeSession,
    acpSessionId,
    setCurrentPlan,
    setEntries,
    setHistoryOpen,
    setIsAutoGeneratingTitle,
    setIsResumedSession,
    setIsResumingHistory,
    setPendingPermission,
    setRegistryId,
    setSessionTitle,
    setSessionTitleSource,
    setShouldScrambleAutoTitle,
    setWaitingForResponse,
    restoreAttemptedRef,
    skipNextAutoConnectRef,
    stoppedRef,
    workspaceId: sessionWorkspaceId,
  });

  const handleSelectHistorySession = useCallback(
    async (session: Parameters<typeof handleSelectHistorySessionBase>[0]) => {
      skipRestoreReplayRef.current = false;
      await handleSelectHistorySessionBase(session);
    },
    [handleSelectHistorySessionBase],
  );

  // ---------------------------------------------------------------------------
  // Context switching effects
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!sessionId || !isConnected) return;
    const prevMap = activeSessionByContextRef.current;
    if (prevMap[contextKey] === sessionId) return;
    const nextMap = { ...prevMap, [contextKey]: sessionId };
    activeSessionByContextRef.current = nextMap;
    setActiveSessionByContext(nextMap);
  }, [contextKey, sessionId, isConnected]);

  useEffect(() => {
    if (!isConnected || !acpSessionId || !registryId) return;
    const cwd = sessionCwd ?? localPath;
    writeAgentLastSession(contextKey, {
      registryId,
      acpSessionId,
      cwd,
      workspaceId: sessionWorkspaceId,
      projectId: sessionProjectId,
      updatedAt: Date.now(),
    });
    onSessionBindingChange?.({
      acpSessionId,
      registryId,
      sessionCwd: cwd,
    });
  }, [
    acpSessionId,
    contextKey,
    isConnected,
    localPath,
    onSessionBindingChange,
    registryId,
    sessionCwd,
    sessionProjectId,
    sessionWorkspaceId,
  ]);

  useEffect(() => {
    activeSessionByContextRef.current = activeSessionByContext;
  }, [activeSessionByContext]);

  useEffect(() => {
    entriesByContextRef.current[contextKey] = entries;
  }, [contextKey, entries]);

  useEffect(() => {
    planByContextRef.current[contextKey] = currentPlan;
  }, [contextKey, currentPlan]);

  useEffect(() => {
    sessionTitleByContextRef.current[contextKey] = sessionTitle;
  }, [contextKey, sessionTitle]);

  useEffect(() => {
    sessionTitleSourceByContextRef.current[contextKey] = sessionTitleSource;
  }, [contextKey, sessionTitleSource]);

  useEffect(() => {
    if (!isResumingHistory) {
      skipRestoreReplayRef.current = false;
    }
  }, [isResumingHistory]);

  useEffect(() => {
    if (!isConnected || !sessionId) {
      connectedContextKeyRef.current = null;
      return;
    }
    if (connectedContextKeyRef.current == null) {
      connectedContextKeyRef.current = contextKey;
      return;
    }
    if (connectedContextKeyRef.current === contextKey) return;

    connectedContextKeyRef.current = null;
    disconnect();
    setEntries([]);
    setCurrentPlan(null);
    setPendingPermission(null);
    setSessionTitle(null);
    setSessionTitleSource(null);
    setIsAutoGeneratingTitle(false);
    setShouldScrambleAutoTitle(false);
    setIsResumedSession(false);
    setWaitingForResponse(false);
    stoppedRef.current = false;
    restoreAttemptedRef.current = false;
    autoResumeTriedRef.current = null;
    autoStartHandledRef.current = false;
  }, [contextKey, disconnect, isConnected, sessionId]);

  // ---------------------------------------------------------------------------
  // Create / submit / close / permission
  // ---------------------------------------------------------------------------
  const handleCreateNewSession = useCallback(async (targetRegistryId?: string) => {
    if (isConnecting || !canUseCurrentMode) return;
    const nextRegistryId = targetRegistryId || defaultRegistryId || registryId;
    if (!nextRegistryId) return;
    skipNextAutoConnectRef.current = true;
    skipRestoreReplayRef.current = false;
    disconnectStashed(contextKey);
    disconnect();
    clearAgentLastSession(contextKey);
    setEntries([]);
    setCurrentPlan(null);
    setPendingPermission(null);
    setSessionTitle(null);
    setSessionTitleSource(null);
    setIsAutoGeneratingTitle(false);
    setShouldScrambleAutoTitle(false);
    setIsResumedSession(false);
    setWaitingForResponse(false);
    stoppedRef.current = false;
    setRegistryId(nextRegistryId);
    restoreAttemptedRef.current = true;
    autoResumeTriedRef.current = null;
    setActiveSessionByContext((prev) => {
      if (!(contextKey in prev)) return prev;
      const next = { ...prev };
      delete next[contextKey];
      return next;
    });
    try {
      await startSession({ registryId: nextRegistryId });
    } finally {
      skipNextAutoConnectRef.current = false;
    }
  }, [
    canUseCurrentMode,
    contextKey,
    defaultRegistryId,
    disconnect,
    disconnectStashed,
    isConnecting,
    registryId,
    startSession,
  ]);

  // ---------------------------------------------------------------------------
  // Auth method selection
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (authRequest?.methods?.length) {
      setSelectedAuthMethodId(authRequest.methods[0].id);
    } else {
      setSelectedAuthMethodId("");
    }
  }, [authRequest]);

  // ---------------------------------------------------------------------------
  // Refresh agents
  // ---------------------------------------------------------------------------
  const refreshAgents = useCallback(async () => {
    setLoadingAgents(true);
    try {
      const [{ agents }, { agents: customAgents }] = await Promise.all([
        agentApi.listRegistry(),
        agentApi.listCustomAgents(),
      ]);
      const installed = agents.filter((a) => a.installed);
      const customAsRegistry: RegistryAgent[] = customAgents.map((c) => ({
        id: c.name,
        name: c.name,
        version: "",
        description: `${c.command} ${c.args.join(" ")}`,
        repository: null,
        icon: null,
        cli_command: `${c.command} ${c.args.join(" ")}`,
        install_method: "custom",
        package: null,
        installed: true,
        default_config: c.default_config,
      }));
      const allInstalled = [...installed, ...customAsRegistry];
      setInstalledAgents(allInstalled);
      if (allInstalled.length > 0) {
        const storedDefault = readDefaultAgentRegistryId();
        const hasStoredDefault =
          !!storedDefault && allInstalled.some((a) => a.id === storedDefault);
        const resolvedDefault = hasStoredDefault
          ? (storedDefault as string)
          : allInstalled[0].id;
        setDefaultRegistryId(resolvedDefault);
        if (resolvedDefault !== storedDefault) {
          writeDefaultAgentRegistryId(resolvedDefault);
        }
        const currentIsInstalled = allInstalled.some((a) => a.id === registryId);
        if (!currentIsInstalled) setRegistryId(resolvedDefault);
      } else {
        setDefaultRegistryId("");
        setRegistryId("");
      }
    } finally {
      setHasLoadedAgents(true);
      setLoadingAgents(false);
    }
  }, [registryId]);

  useEffect(() => {
    if (!isPanelOpen) {
      if (variant === "modal") {
        return;
      }
      restoreAttemptedRef.current = false;
      skipNextAutoConnectRef.current = false;
      autoStartHandledRef.current = false;
      handledDeepLinkRef.current = null;
      setHasLoadedAgents(false);
      setIsResumingHistory(false);
      autoResumeTriedRef.current = null;
      connectedContextKeyRef.current = null;
      return;
    }
    if (loadingAgents || isConnecting) return;
    if (!hasLoadedAgents || (!registryId && installedAgents.length > 0)) {
      void refreshAgents();
    }
  }, [isPanelOpen, isConnecting, loadingAgents, hasLoadedAgents, installedAgents.length, registryId, refreshAgents, variant]);

  useEffect(() => {
    const targetKey = targetAgentId && targetSessionId
      ? `${targetAgentId}:${targetSessionId}`
      : null;
    if (!targetKey) {
      handledDeepLinkRef.current = null;
      return;
    }
    if (!isPanelOpen || !hasLoadedAgents || isConnecting || isResumingHistory) return;
    if (handledDeepLinkRef.current === targetKey) return;

    handledDeepLinkRef.current = targetKey;
    let cancelled = false;

    void (async () => {
      skipNextAutoConnectRef.current = true;
      disconnect();
      const restoredFromHandoff = await restoreHandoffSnapshot(targetSessionId);
      if (cancelled) return;
      if (!restoredFromHandoff) {
        skipRestoreReplayRef.current = false;
        setEntries([]);
        setCurrentPlan(null);
        setPendingPermission(null);
        setWaitingForResponse(false);
        setSessionTitle(null);
        setSessionTitleSource(null);
        setIsAutoGeneratingTitle(false);
        setShouldScrambleAutoTitle(false);
      }
      stoppedRef.current = false;
      setRegistryId(targetAgentId);
      setIsResumedSession(true);
      setIsResumingHistory(true);
      autoResumeTriedRef.current = null;
      restoreAttemptedRef.current = true;
      autoStartHandledRef.current = true;

      try {
        const success = await resumeSession({
          registryId: targetAgentId,
          acpSessionId: targetSessionId,
          cwd: targetSessionCwd || null,
          workspaceId: sessionWorkspaceId,
          projectId: sessionProjectId,
        });
        if (cancelled) return;
        if (success) {
          clearDeepLinkSessionParams();
        } else {
          setIsResumingHistory(false);
        }
      } catch {
        if (!cancelled) {
          setIsResumingHistory(false);
        }
      } finally {
        skipNextAutoConnectRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    disconnect,
    clearDeepLinkSessionParams,
    hasLoadedAgents,
    isConnecting,
    isPanelOpen,
    isResumingHistory,
    resumeSession,
    restoreHandoffSnapshot,
    sessionProjectId,
    sessionWorkspaceId,
    setEntries,
    targetAgentId,
    targetSessionCwd,
    targetSessionId,
  ]);

  // ---------------------------------------------------------------------------
  // Queued prompt dispatch
  // ---------------------------------------------------------------------------
  const sendQueuedPrompt = useCallback((item: QueuedAgentPrompt) => {
    const sent = sendPrompt(item.prompt);
    if (!sent) return false;

    removeQueuedAgentChatPrompt(item.id);
    dispatchingQueuedPromptIdRef.current = null;
    forcedDisconnectDoneRef.current = false;
    stoppedRef.current = false;
    setWaitingForResponse(true);
    setCurrentPlan(null);
    setEntries((prev) => [
      ...prev,
      {
        role: "user" as const,
        content: item.displayPrompt ?? item.prompt,
        files: item.files,
      },
    ]);

    if (item.sessionTitle && sessionId) {
      setSessionTitle(item.sessionTitle);
      setSessionTitleSource("user");
      setIsAutoGeneratingTitle(false);
      setShouldScrambleAutoTitle(false);
    }
    return true;
  }, [removeQueuedAgentChatPrompt, sendPrompt, sessionId]);

  useEffect(() => {
    if (!isPanelOpen || !isConnected || !queuedPromptHead?.forceNewSession) return;
    if (!canUseCurrentMode) return;
    if (agentActivity.busy || waitingForResponse || pendingPermission || isConnecting) return;
    if (forcedDisconnectDoneRef.current) return;

    dispatchingQueuedPromptIdRef.current = queuedPromptHead.id;
    forcedDisconnectDoneRef.current = true;
    skipRestoreReplayRef.current = false;
    disconnect();
    setEntries([]);
    setCurrentPlan(null);
    setPendingPermission(null);
    setSessionTitle(null);
    setSessionTitleSource(null);
    setIsAutoGeneratingTitle(false);
    setShouldScrambleAutoTitle(false);
    setIsResumedSession(false);
    setWaitingForResponse(false);
    stoppedRef.current = false;
    autoResumeTriedRef.current = null;
    autoStartHandledRef.current = false;
    restoreAttemptedRef.current = true;
  }, [
    agentActivity.busy,
    disconnect,
    canUseCurrentMode,
    isPanelOpen,
    isConnected,
    isConnecting,
    pendingPermission,
    queuedPromptHead,
    waitingForResponse,
  ]);

  // ---------------------------------------------------------------------------
  // Auto-connect / restore
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Prefer document-persisted binding (canvas widget) over UI-pref last session.
    const storedLast = readAgentLastSession(contextKey);
    const binding = initialSessionBinding;
    const lastSession =
      binding?.acpSessionId && binding.registryId
        ? {
            registryId: binding.registryId,
            acpSessionId: binding.acpSessionId,
            cwd: binding.sessionCwd ?? null,
            workspaceId: sessionWorkspaceId,
            projectId: sessionProjectId,
            updatedAt: Date.now(),
          }
        : storedLast;
    const lastSessionAgentInstalled = lastSession
      ? installedAgents.some((agent) => agent.id === lastSession.registryId)
      : false;
    const effectiveRegistryId =
      queuedPromptHead?.registryId ||
      (lastSessionAgentInstalled ? lastSession?.registryId : null) ||
      defaultRegistryId ||
      registryId;
    if (
      isPanelOpen &&
      effectiveRegistryId &&
      canUseCurrentMode &&
      installedAgents.length > 0 &&
      !isConnected &&
      !isConnecting
    ) {
      if (skipNextAutoConnectRef.current) {
        skipNextAutoConnectRef.current = false;
        return;
      }

      const forcedRegistryId = queuedPromptHead?.forceNewSession
        ? effectiveRegistryId
        : undefined;

      if (forcedRegistryId) {
        autoStartHandledRef.current = true;
        autoResumeTriedRef.current = null;
        skipRestoreReplayRef.current = false;
        setIsResumedSession(false);
        setEntries([]);
        setCurrentPlan(null);
        setPendingPermission(null);
        setSessionTitle(queuedPromptHead?.sessionTitle ?? null);
        setSessionTitleSource(queuedPromptHead?.sessionTitle ? "user" : null);
        setIsAutoGeneratingTitle(false);
        setShouldScrambleAutoTitle(false);
        if (registryId !== forcedRegistryId) {
          setRegistryId(forcedRegistryId);
        }
        setActiveSessionByContext((prev) => {
          if (!(contextKey in prev)) return prev;
          const next = { ...prev };
          delete next[contextKey];
          return next;
        });
        startSession({ registryId: forcedRegistryId });
        return;
      }

      if (!restoreAttemptedRef.current) {
        restoreAttemptedRef.current = true;
        autoStartHandledRef.current = true;
        autoResumeTriedRef.current = null;
        if (lastSessionAgentInstalled && lastSession?.acpSessionId) {
          void (async () => {
            const restoredFromHandoff = await restoreHandoffSnapshot(lastSession.acpSessionId);
            setIsResumedSession(true);
            setIsResumingHistory(true);
            if (!restoredFromHandoff) {
              skipRestoreReplayRef.current = false;
              setEntries([]);
              setCurrentPlan(null);
              setPendingPermission(null);
              setSessionTitle(null);
              setSessionTitleSource(null);
              setIsAutoGeneratingTitle(false);
              setShouldScrambleAutoTitle(false);
              setWaitingForResponse(false);
            }
            stoppedRef.current = false;
            if (registryId !== lastSession.registryId) {
              setRegistryId(lastSession.registryId);
            }
            const handleResumeFailure = () => {
              clearAgentLastSession(contextKey);
              setIsResumingHistory(false);
              setIsResumedSession(false);
              void startSession({ registryId: lastSession.registryId });
            };
            void resumeSession({
              registryId: lastSession.registryId,
              acpSessionId: lastSession.acpSessionId,
              cwd: lastSession.cwd,
              workspaceId: lastSession.workspaceId ?? sessionWorkspaceId,
              projectId: lastSession.projectId ?? sessionProjectId,
              authMethodId: selectedAuthMethodId || null,
            }).then((success) => {
              if (success) return;
              handleResumeFailure();
            }).catch(handleResumeFailure);
          })();
          return;
        }
        skipRestoreReplayRef.current = false;
        setIsResumedSession(false);
        startSession();
        return;
      }
      if (!autoStartHandledRef.current) {
        autoStartHandledRef.current = true;
        autoResumeTriedRef.current = null;
        skipRestoreReplayRef.current = false;
        setIsResumedSession(false);
        startSession();
      }
    }
  }, [
    activeSessionByContext,
    chatMode,
    contextKey,
    defaultRegistryId,
    canUseCurrentMode,
    initialSessionBinding,
    isPanelOpen,
    registryId,
    installedAgents,
    isConnected,
    isConnecting,
    resumeSession,
    restoreHandoffSnapshot,
    selectedAuthMethodId,
    startSession,
    sessionWorkspaceId,
    sessionProjectId,
    queuedPromptHead,
  ]);

  useEffect(() => {
    if (isConnected && sessionId) {
      autoResumeTriedRef.current = sessionId;
    }
  }, [isConnected, sessionId]);

  useEffect(() => {
    if (!isPanelOpen || !queuedPromptHead) {
      dispatchingQueuedPromptIdRef.current = null;
      return;
    }
    if (!isConnected || connectionPhase !== "connected") return;
    if (agentActivity.busy || waitingForResponse || pendingPermission || isConnecting) return;
    if (queuedPromptHead.forceNewSession && !forcedDisconnectDoneRef.current) return;

    dispatchingQueuedPromptIdRef.current = queuedPromptHead.id;
    const sent = sendQueuedPrompt(queuedPromptHead);
    if (!sent) {
      dispatchingQueuedPromptIdRef.current = null;
    }
  }, [
    agentActivity.busy,
    connectionPhase,
    isPanelOpen,
    isConnected,
    isConnecting,
    pendingPermission,
    queuedPromptHead,
    sendQueuedPrompt,
    waitingForResponse,
  ]);

  // ---------------------------------------------------------------------------
  // Title effects
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!sessionId) {
      setSessionTitle(null);
      setSessionTitleSource(null);
      setIsAutoGeneratingTitle(false);
      setShouldScrambleAutoTitle(false);
      return;
    }
    if (activeSessionTitle != null) {
      setSessionTitle(activeSessionTitle);
    }
  }, [sessionId, activeSessionTitle]);

  // ---------------------------------------------------------------------------
  // Submit / Close / Permission
  // ---------------------------------------------------------------------------
  const handleSubmit = useAgentChatSubmitHandler({
    canUseCurrentMode,
    chatMode,
    clearAgentChatDraft,
    enqueueAgentChatPrompt,
    entriesLength: entries.length,
    isConnected,
    instanceKey,
    localPath,
    queuedPromptCount: queuedPrompts.length,
    sessionCwd,
    sessionProjectId,
    sessionWorkspaceId,
    stoppedRef,
    transformPrompt,
    setIsAutoGeneratingTitle,
    setSessionTitle,
    setSessionTitleSource,
    setShouldScrambleAutoTitle,
  });

  const handleClose = useCallback(() => {
    if (variant !== "modal") {
      disconnect();
    }
    setAgentChatOpen(false);
  }, [disconnect, setAgentChatOpen, variant]);

  const handleLogoutAgent = useCallback(async () => {
    if (!registryId) return;
    const ok = await logoutAgent(sessionCwd ?? localPath, selectedAuthMethodId || null);
    if (!ok) return;
    clearAgentLastSession(contextKey);
    setEntries([]);
    setCurrentPlan(null);
    setPendingPermission(null);
    setSessionTitle(null);
    setSessionTitleSource(null);
    setIsAutoGeneratingTitle(false);
    setShouldScrambleAutoTitle(false);
    setIsResumedSession(false);
    setWaitingForResponse(false);
    stoppedRef.current = false;
    autoResumeTriedRef.current = null;
    restoreAttemptedRef.current = true;
    autoStartHandledRef.current = false;
  }, [
    localPath,
    contextKey,
    logoutAgent,
    registryId,
    selectedAuthMethodId,
    sessionCwd,
  ]);

  const handlePermission = useCallback(
    (optionKind: string) => {
      if (!pendingPermission) return;
      const allowed = optionKind.startsWith("allow");
      sendPermissionResponse(pendingPermission.request_id, allowed);
      setPendingPermission(null);
    },
    [pendingPermission, sendPermissionResponse]
  );

  const connectionPhaseLabel = getConnectionPhaseLabel(connectionPhase, t);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------
  return {
    isPanelOpen,

    isConnected,
    isConnecting,
    connectionPhase,
    error,
    sessionId,
    acpSessionId,
    sessionCwd,

    entries,
    setEntries,
    currentPlan,
    pendingPermission,
    pendingPermissionMarkdown,
    agentActivity,
    waitingForResponse,
    setWaitingForResponse,
    stoppedRef,
    isResumingHistory,
    isResumedSession,

    installedAgents,
    setInstalledAgents,
    activeAgent,
    registryId,
    defaultRegistryId,
    loadingAgents,
    agentInfo,
    capabilities,

    configOptions,
    setConfigOption,
    setAgentDefaultConfig,
    sessionUsage,

    historyOpen,
    setHistoryOpen,
    historySessions,
    historyHasMore,
    historyLoading,
    historyCursor,
    historyResumeUnsupportedReason,
    historyUnsupportedReason,
    loadHistorySessions,
    projects,

    sessionTitle,
    displaySessionTitle,
    sessionTitleSource,
    isAutoGeneratingTitle,
    shouldScrambleAutoTitle,
    setShouldScrambleAutoTitle,

    chatMode,
    localPath,
    sessionWorkspaceId,
    sessionProjectId,
    canUseCurrentMode,
    panelTitle,
    connectionPhaseLabel,

    queueKey,
    queuedPrompts,
    removeQueuedAgentChatPrompt,
    updateQueuedAgentChatPrompt: (id: string, updates: { prompt: string }) => updateQueuedAgentChatPrompt(id, updates),
    moveQueuedAgentChatPrompt,

    newSessionAgentsOpen,
    setNewSessionAgentsOpen,

    headerHovered,
    setHeaderHovered,

    bottomRef,
    conversationRef,

    authRequest,
    selectedAuthMethodId,
    setSelectedAuthMethodId,
    clearAuthRequest,
    startSession,

    exportableMessages,

    userEntryIndices,
    messageNavIndex,

    handleSubmit,
    handleClose,
    handleLogoutAgent,
    handlePermission,
    handleCreateNewSession,
    handleSelectHistorySession,
    handleSelectMessage,
    handleSetDefaultAgent,
    handleOpenNewSessionAgentsMenu,
    handleScheduleCloseNewSessionAgentsMenu,
    handleExportConversation,
    persistHandoffSnapshot,
    restoreHandoffSnapshot,

    sendCancel,
    disconnect,
  };
}
