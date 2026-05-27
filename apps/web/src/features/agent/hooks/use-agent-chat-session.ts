"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryState } from "nuqs";
import { useShallow } from "zustand/react/shallow";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { agentChatParams } from "@/shared/lib/nuqs/searchParams";
import { useProjectStore } from "@/features/project/store/use-project-store";
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
  getSessionContextKey,
  readDefaultAgentRegistryId,
  writeDefaultAgentRegistryId,
  deriveAgentActivity,
} from "../lib/chat-helpers";
import {
  buildAgentChatExportableMessages,
  DEFAULT_SESSION_TITLE,
  getConnectionPhaseLabel,
  resolveAgentChatLocalPath,
  type UseAgentChatSessionOptions,
  type UseAgentChatSessionReturn,
} from "./use-agent-chat-session-types";
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
  transformPrompt,
}: UseAgentChatSessionOptions): UseAgentChatSessionReturn {
  const { workspaceId, projectId, effectiveContextId, currentView } = useContextParams();
  const [isAgentChatOpen, setAgentChatOpen] = useAgentChatUrl();
  const [targetAgentId] = useQueryState("agent", agentChatParams.agent);
  const [targetSessionId] = useQueryState("session", agentChatParams.session);
  const [targetSessionCwd] = useQueryState("sessionCwd", agentChatParams.sessionCwd);
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

  const isPanelOpen = variant === "sidebar" ? active : isAgentChatOpen;
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
  const projects = useProjectStore(s => s.projects);
  const fetchProjects = useProjectStore(s => s.fetchProjects);
  const restoreAttemptedRef = useRef(false);
  const autoResumeTriedRef = useRef<string | null>(null);
  const autoStartHandledRef = useRef(false);
  const handledDeepLinkRef = useRef<string | null>(null);
  const dispatchingQueuedPromptIdRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);
  const forcedDisconnectDoneRef = useRef(false);
  const connectedContextKeyRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch projects when panel opens
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isPanelOpen && projects.length === 0) {
      fetchProjects();
    }
  }, [isPanelOpen, projects.length, fetchProjects]);

  const localPath = React.useMemo(
    () => resolveAgentChatLocalPath(projects, effectiveContextId),
    [projects, effectiveContextId],
  );
  const shouldScopeHistoryToCwd = currentView === "workspace" || currentView === "project";
  const historyCwd = shouldScopeHistoryToCwd ? localPath : null;

  const clearDeepLinkSessionParams = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("agent");
    url.searchParams.delete("session");
    url.searchParams.delete("sessionCwd");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const canUseCurrentMode = true;
  const sessionWorkspaceId = workspaceId;
  const sessionProjectId = projectId;
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
    cwd: historyCwd,
    authMethodId: selectedAuthMethodId || null,
    enabled: historyOpen && (!shouldScopeHistoryToCwd || Boolean(historyCwd)),
  });

  const { handleMessage, pendingPermissionMarkdown } = useAgentChatMessageHandler({
    entries,
    pendingPermission,
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
    handleNextMessage,
    handleOpenNewSessionAgentsMenu,
    handlePrevMessage,
    handleScheduleCloseNewSessionAgentsMenu,
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

  // ---------------------------------------------------------------------------
  // Context key / queue
  // ---------------------------------------------------------------------------
  const skipNextAutoConnectRef = useRef(false);
  const contextKey = React.useMemo(
    () => getSessionContextKey(sessionWorkspaceId, sessionProjectId, chatMode),
    [sessionWorkspaceId, sessionProjectId, chatMode]
  );
  const queueKey = React.useMemo(
    () => getAgentPromptQueueKey(sessionWorkspaceId, sessionProjectId, chatMode),
    [sessionWorkspaceId, sessionProjectId, chatMode]
  );
  const queuedPrompts = useMemo(
    () => agentChatPromptQueues[queueKey] ?? [],
    [agentChatPromptQueues, queueKey]
  );
  const queuedPromptHead = queuedPrompts[0] ?? null;

  const {
    handleSelectHistorySession,
  } = useAgentChatHistoryHandlers({
    autoResumeTriedRef,
    autoStartHandledRef,
    canUseCurrentMode,
    disconnect,
    isConnected,
    isConnecting,
    projectId: sessionProjectId,
    resumeSession,
    sessionId,
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
    disconnectStashed(contextKey);
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
  }, [isPanelOpen, isConnecting, loadingAgents, hasLoadedAgents, installedAgents.length, registryId, refreshAgents]);

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
    skipNextAutoConnectRef.current = true;
    disconnect();
    setEntries([]);
    setCurrentPlan(null);
    setPendingPermission(null);
    setWaitingForResponse(false);
    stoppedRef.current = false;
    setRegistryId(targetAgentId);
    setSessionTitle(null);
    setSessionTitleSource(null);
    setIsAutoGeneratingTitle(false);
    setShouldScrambleAutoTitle(false);
    setIsResumedSession(true);
    setIsResumingHistory(true);
    autoResumeTriedRef.current = null;
    restoreAttemptedRef.current = true;
    autoStartHandledRef.current = true;

    void resumeSession({
      registryId: targetAgentId,
      acpSessionId: targetSessionId,
      cwd: targetSessionCwd || null,
      workspaceId: sessionWorkspaceId,
      projectId: sessionProjectId,
    })
      .then((success) => {
        if (success) {
          clearDeepLinkSessionParams();
        } else {
          setIsResumingHistory(false);
        }
      })
      .catch(() => {
        setIsResumingHistory(false);
      })
      .finally(() => {
        skipNextAutoConnectRef.current = false;
      });
  }, [
    disconnect,
    clearDeepLinkSessionParams,
    hasLoadedAgents,
    isConnecting,
    isPanelOpen,
    isResumingHistory,
    resumeSession,
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
    const effectiveRegistryId = queuedPromptHead?.registryId || defaultRegistryId || registryId;
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
        setIsResumedSession(false);
        startSession();
        return;
      }
      if (!autoStartHandledRef.current) {
        autoStartHandledRef.current = true;
        autoResumeTriedRef.current = null;
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
    isPanelOpen,
    sessionProjectId,
    registryId,
    installedAgents.length,
    isConnected,
    isConnecting,
    resumeSession,
    startSession,
    sessionWorkspaceId,
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
    disconnect();
    setAgentChatOpen(false);
  }, [disconnect, setAgentChatOpen]);

  const handleLogoutAgent = useCallback(async () => {
    if (!registryId) return;
    const ok = await logoutAgent(sessionCwd ?? localPath, selectedAuthMethodId || null);
    if (!ok) return;
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

  const connectionPhaseLabel = getConnectionPhaseLabel(connectionPhase);

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
    handlePrevMessage,
    handleNextMessage,
    handleSetDefaultAgent,
    handleOpenNewSessionAgentsMenu,
    handleScheduleCloseNewSessionAgentsMenu,
    handleExportConversation,

    sendCancel,
    disconnect,
  };
}
