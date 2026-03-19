"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useContextParams } from "@/hooks/use-context-params";
import {
  messagesToMarkdown,
  type ConversationMessage,
} from "@workspace/ui";
import { useProjectStore } from "@/hooks/use-project-store";
import {
  buildQueuedAgentPromptContent,
  getAgentPromptQueueKey,
  useDialogStore,
  type QueuedAgentPrompt,
} from "@/hooks/use-dialog-store";
import { useAgentChatUrl } from "@/hooks/use-agent-chat-url";
import { useAgentChatStatusStore } from "@/hooks/use-agent-chat-status";
import {
  useAgentSession,
  type AgentServerMessage,
  type AgentPlan,
  type AgentConfigOption,
  type AgentUsage,
} from "@/hooks/use-agent-session";
import { agentApi } from "@/api/ws-api";
import { agentApi as agentRestApi, type AgentChatSessionItem } from "@/api/rest-api";
import type { RegistryAgent } from "@/api/ws-api";
import type { AgentChatMode } from "@/types/agent-chat";
import { DEFAULT_AGENT_CHAT_MODE } from "@/types/agent-chat";
import { useWikiExists, useWikiStore } from "@/hooks/use-wiki-store";
import {
  applyServerMessageToEntries,
  extractPlanMarkdown,
  getAssistantCopyText,
  isSwitchModePlanToolCall,
  type ThreadEntry,
} from "@/lib/agent/thread";
import {
  type PendingPermission,
  type AgentActivity,
  getSessionContextKey,
  readDefaultAgentRegistryId,
  writeDefaultAgentRegistryId,
  deriveAgentActivity,
  sanitizeConversationFilename,
  getLocalTimestampForFilename,
  downloadConversationMarkdown,
} from "./chat-helpers";

// Server-side default title assigned to new chat sessions (must match the
// backend constant in agent_chat_session_repo.rs / session_title.rs).
const DEFAULT_SESSION_TITLE = "新会话";

// ---------------------------------------------------------------------------
// Options & Return types
// ---------------------------------------------------------------------------

export interface UseAgentChatSessionOptions {
  variant: "modal" | "sidebar";
  mode: AgentChatMode;
  publishStatus: boolean;
}

export interface UseAgentChatSessionReturn {
  // Panel open
  isPanelOpen: boolean;

  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionPhase: string;
  error: string | null;
  sessionId: string | null;
  sessionCwd: string | null;

  // Session data
  entries: ThreadEntry[];
  setEntries: React.Dispatch<React.SetStateAction<ThreadEntry[]>>;
  currentPlan: AgentPlan | null;
  pendingPermission: PendingPermission | null;
  pendingPermissionMarkdown: string | null;
  agentActivity: AgentActivity;
  waitingForResponse: boolean;
  setWaitingForResponse: React.Dispatch<React.SetStateAction<boolean>>;
  stoppedRef: React.MutableRefObject<boolean>;
  isResumingHistory: boolean;
  isResumedSession: boolean;
  isManualLoadingMessages: boolean;

  // Agents
  installedAgents: RegistryAgent[];
  setInstalledAgents: React.Dispatch<React.SetStateAction<RegistryAgent[]>>;
  activeAgent: RegistryAgent | null;
  registryId: string;
  defaultRegistryId: string;
  loadingAgents: boolean;

  // Config
  configOptions: AgentConfigOption[];
  setConfigOption: (key: string, value: string) => void;
  setAgentDefaultConfig: (configId: string, value: string) => void;
  sessionUsage: AgentUsage | null;

  // History
  historyOpen: boolean;
  setHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  historySessions: AgentChatSessionItem[];
  historyHasMore: boolean;
  historyLoading: boolean;
  historyCursor: string | null;
  loadHistorySessions: (cursor?: string) => Promise<void>;

  // Title
  sessionTitle: string | null;
  displaySessionTitle: string | null;
  sessionTitleSource: string | null;
  isAutoGeneratingTitle: boolean;
  shouldScrambleAutoTitle: boolean;
  setShouldScrambleAutoTitle: React.Dispatch<React.SetStateAction<boolean>>;
  isEditingTitle: boolean;
  editingTitleValue: string;
  setEditingTitleValue: React.Dispatch<React.SetStateAction<string>>;

  // Context
  chatMode: AgentChatMode;
  localPath: string | null;
  wikiPath: string | null;
  sessionWorkspaceId: string | null;
  sessionProjectId: string | null;
  canUseCurrentMode: boolean;
  wikiAskAvailability: { enabled: boolean; reason: string | null };
  panelLabel: string;
  panelTitle: string;
  connectionPhaseLabel: string;

  // Queue
  queueKey: string;
  queuedPrompts: QueuedAgentPrompt[];
  removeQueuedAgentChatPrompt: (id: string) => void;
  updateQueuedAgentChatPrompt: (id: string, updates: { prompt: string }) => void;
  moveQueuedAgentChatPrompt: (id: string, toIndex: number) => void;

  // New session agents menu
  newSessionAgentsOpen: boolean;
  setNewSessionAgentsOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Layout refs
  headerHovered: boolean;
  setHeaderHovered: React.Dispatch<React.SetStateAction<boolean>>;

  // Refs
  bottomRef: React.RefObject<HTMLDivElement | null>;
  conversationRef: React.RefObject<HTMLDivElement | null>;
  titleInputRef: React.RefObject<HTMLInputElement | null>;

  // Auth
  authRequest: { message?: string; methods: { id: string; name: string; description?: string }[] } | null;
  selectedAuthMethodId: string;
  setSelectedAuthMethodId: React.Dispatch<React.SetStateAction<string>>;
  clearAuthRequest: () => void;
  startSession: (opts?: { registryId?: string; authMethodId?: string }) => void;

  // Export
  exportableMessages: ConversationMessage[];

  // Message navigation
  userEntryIndices: number[];
  messageNavIndex: number;

  // Actions
  handleSubmit: (message: { text: string; files?: import("ai").FileUIPart[] }) => Promise<void>;
  handleClose: () => void;
  handlePermission: (optionKind: string) => void;
  handleCreateNewSession: (targetRegistryId?: string) => Promise<void>;
  handleSelectHistorySession: (s: AgentChatSessionItem) => Promise<void>;
  handleManualLoadMessages: () => Promise<void>;
  handleStartEditTitle: () => void;
  handleFinishEditTitle: () => void;
  handleTitleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handlePrevMessage: () => void;
  handleNextMessage: () => void;
  handleSetDefaultAgent: (agentId: string) => void;
  handleOpenNewSessionAgentsMenu: () => void;
  handleScheduleCloseNewSessionAgentsMenu: () => void;
  handleExportConversation: () => void;

  // Send
  sendCancel: () => void;

  // Disconnect
  disconnect: () => void;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useAgentChatSession({
  variant,
  mode = DEFAULT_AGENT_CHAT_MODE,
  publishStatus,
}: UseAgentChatSessionOptions): UseAgentChatSessionReturn {
  const { workspaceId, projectId, effectiveContextId, currentView } = useContextParams();
  const [isAgentChatOpen, setAgentChatOpen] = useAgentChatUrl();
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

  const isPanelOpen = variant === "sidebar" ? true : isAgentChatOpen;
  const [newSessionAgentsOpen, setNewSessionAgentsOpen] = useState(false);
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
  const [messageNavIndex, setMessageNavIndex] = useState(-1);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState<AgentChatSessionItem[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isResumingHistory, setIsResumingHistory] = useState(false);
  const [isManualLoadingMessages, setIsManualLoadingMessages] = useState(false);
  const [isResumedSession, setIsResumedSession] = useState(false);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [sessionTitleSource, setSessionTitleSource] = useState<string | null>(null);
  const [isAutoGeneratingTitle, setIsAutoGeneratingTitle] = useState(false);
  const [shouldScrambleAutoTitle, setShouldScrambleAutoTitle] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState("");
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
  const dispatchingQueuedPromptIdRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);
  const forcedDisconnectDoneRef = useRef(false);
  const closeAgentsMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectedContextKeyRef = useRef<string | null>(null);
  const pendingStreamMessagesRef = useRef<AgentServerMessage[]>([]);
  const streamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Fetch projects when panel opens
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isPanelOpen && projects.length === 0) {
      fetchProjects();
    }
  }, [isPanelOpen, projects.length, fetchProjects]);

  const localPath = React.useMemo(() => {
    if (!effectiveContextId) return null;
    for (const p of projects) {
      const found = p.workspaces.find((w) => w.id === effectiveContextId);
      if (found) return found.localPath;
      if (p.id === effectiveContextId) return p.mainFilePath;
    }
    return null;
  }, [projects, effectiveContextId]);

  const parentProjectId = React.useMemo(() => {
    if (!workspaceId) return null;
    for (const p of projects) {
      if (p.workspaces.find((w) => w.id === workspaceId)) return p.id;
    }
    return null;
  }, [projects, workspaceId]);

  const wikiPath = React.useMemo(() => {
    if (!effectiveContextId) return null;
    for (const p of projects) {
      if (p.workspaces.find((w) => w.id === effectiveContextId)) return p.mainFilePath;
      if (p.id === effectiveContextId) return p.mainFilePath;
    }
    return null;
  }, [projects, effectiveContextId]);

  const wikiExists = useWikiExists(effectiveContextId);
  const checkWikiExists = useWikiStore((s) => s.checkWikiExists);
  const isProjectScopedView = currentView === "workspace" || currentView === "project";
  const hasBoundContext = workspaceId != null || projectId != null;
  const wikiAskAvailability = useMemo(() => {
    if (!hasBoundContext || !isProjectScopedView) {
      return { enabled: false, reason: "Only available in Project or Workspace" as const };
    }
    if (wikiExists !== true) {
      return { enabled: false, reason: "Generate Wiki first to use Wiki Ask" as const };
    }
    return { enabled: true, reason: null };
  }, [hasBoundContext, isProjectScopedView, wikiExists]);
  const canUseCurrentMode = chatMode !== "wiki_ask" || wikiAskAvailability.enabled;

  useEffect(() => {
    if (!effectiveContextId || !wikiPath || !isProjectScopedView) return;
    if (wikiExists !== null) return;
    void checkWikiExists(effectiveContextId, wikiPath);
  }, [checkWikiExists, effectiveContextId, isProjectScopedView, wikiPath, wikiExists]);

  const sessionWorkspaceId = chatMode === "wiki_ask" && workspaceId && parentProjectId
    ? null
    : workspaceId;
  const sessionProjectId = chatMode === "wiki_ask" && workspaceId && parentProjectId
    ? parentProjectId
    : projectId;

  // ---------------------------------------------------------------------------
  // Stream batching
  // ---------------------------------------------------------------------------
  const flushPendingStreamMessages = useCallback(() => {
    if (streamFlushTimerRef.current) {
      clearTimeout(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
    }
    if (pendingStreamMessagesRef.current.length === 0) return;
    const queued = pendingStreamMessagesRef.current;
    pendingStreamMessagesRef.current = [];
    setEntries((prev) => queued.reduce((acc, item) => applyServerMessageToEntries(acc, item), prev));
  }, []);

  const scheduleStreamFlush = useCallback(() => {
    if (streamFlushTimerRef.current) return;
    streamFlushTimerRef.current = setTimeout(() => {
      flushPendingStreamMessages();
    }, 48);
  }, [flushPendingStreamMessages]);

  useEffect(() => {
    return () => {
      if (streamFlushTimerRef.current) {
        clearTimeout(streamFlushTimerRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Message handler
  // ---------------------------------------------------------------------------
  const handleMessage = useCallback((msg: AgentServerMessage) => {
    switch (msg.type) {
      case "stream":
        if (stoppedRef.current) return;
        if (msg.done) {
          stoppedRef.current = false;
          setWaitingForResponse(false);
        }
        pendingStreamMessagesRef.current.push(msg);
        if (msg.done) {
          flushPendingStreamMessages();
        } else {
          scheduleStreamFlush();
        }
        break;
      case "tool_call":
        if (stoppedRef.current) return;
        flushPendingStreamMessages();
        setEntries((prev) => applyServerMessageToEntries(prev, msg));
        break;
      case "plan_update":
        if (stoppedRef.current) return;
        flushPendingStreamMessages();
        setCurrentPlan(msg.plan);
        setEntries((prev) => applyServerMessageToEntries(prev, msg));
        break;
      case "permission_request":
        flushPendingStreamMessages();
        setPendingPermission({
          request_id: msg.request_id,
          tool: msg.tool,
          description: msg.description,
          content_markdown: msg.content_markdown,
          risk_level: msg.risk_level,
          options: msg.options ?? [],
        });
        break;
      case "error":
        flushPendingStreamMessages();
        stoppedRef.current = false;
        setWaitingForResponse(false);
        setEntries((prev) => applyServerMessageToEntries(prev, msg));
        break;
      case "turn_end":
        flushPendingStreamMessages();
        stoppedRef.current = false;
        setWaitingForResponse(false);
        setEntries((prev) => applyServerMessageToEntries(prev, msg));
        break;
      case "usage_update":
        flushPendingStreamMessages();
        setEntries((prev) => {
          let changed = false;
          const next = prev.map((entry) => {
            if (entry.role !== "assistant" || !entry.isStreaming) return entry;
            const hasRunningTool = entry.blocks.some(
              (block) => block.type === "tool_call" && block.status === "running"
            );
            if (hasRunningTool) return entry;
            changed = true;
            return { ...entry, isStreaming: false };
          });
          if (changed) {
            stoppedRef.current = false;
            setWaitingForResponse(false);
          }
          return changed ? next : prev;
        });
        break;
      case "session_title_updated":
        setSessionTitle(msg.title);
        setSessionTitleSource(msg.title_source);
        setIsAutoGeneratingTitle(false);
        setShouldScrambleAutoTitle(msg.title_source === "auto");
        break;
      case "session_ended":
        flushPendingStreamMessages();
        stoppedRef.current = false;
        setWaitingForResponse(false);
        break;
      case "load_completed":
        flushPendingStreamMessages();
        stoppedRef.current = false;
        setWaitingForResponse(false);
        setIsResumingHistory(false);
        setEntries((prev) => {
          let changed = false;
          const next = prev.map((entry) => {
            if (entry.role === "assistant" && entry.isStreaming) {
              changed = true;
              return { ...entry, isStreaming: false };
            }
            return entry;
          });
          return changed ? next : prev;
        });
        break;
    }
  }, [flushPendingStreamMessages, scheduleStreamFlush]);

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
  } = useAgentSession({
    workspaceId: sessionWorkspaceId,
    projectId: sessionProjectId,
    registryId,
    mode: chatMode,
    onMessage: handleMessage,
  });

  useEffect(() => {
    if (canUseCurrentMode || !isConnected) return;
    disconnect();
    setWaitingForResponse(false);
    setPendingPermission(null);
    stoppedRef.current = false;
  }, [canUseCurrentMode, disconnect, isConnected]);

  // ---------------------------------------------------------------------------
  // Publish status to global store
  // ---------------------------------------------------------------------------
  const setStatusHasAgents = useAgentChatStatusStore((s) => s.setHasInstalledAgents);
  const setStatusConnected = useAgentChatStatusStore((s) => s.setIsConnected);
  const setStatusBusy = useAgentChatStatusStore((s) => s.setIsBusy);
  useEffect(() => {
    if (!publishStatus) return;
    setStatusHasAgents(installedAgents.length > 0);
  }, [installedAgents.length, publishStatus, setStatusHasAgents]);
  useEffect(() => {
    if (!publishStatus) return;
    setStatusConnected(isConnected);
  }, [isConnected, publishStatus, setStatusConnected]);
  useEffect(() => {
    if (!publishStatus) return;
    setStatusBusy(waitingForResponse);
  }, [waitingForResponse, publishStatus, setStatusBusy]);

  const agentActivity = useMemo(
    () => deriveAgentActivity(entries, waitingForResponse),
    [entries, waitingForResponse]
  );

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------
  const loadHistorySessions = useCallback(
    async (cursor?: string) => {
      setHistoryLoading(true);
      try {
        const contextType =
          sessionWorkspaceId != null ? "workspace" : sessionProjectId != null ? "project" : "temp";
        const contextGuid = sessionWorkspaceId ?? sessionProjectId ?? undefined;
        const res = await agentRestApi.listSessions({
          context_type: contextType,
          context_guid: contextGuid,
          mode: chatMode,
          limit: 20,
          cursor,
        });
        if (cursor) {
          setHistorySessions((prev) => [...prev, ...res.items]);
        } else {
          setHistorySessions(res.items);
        }
        setHistoryCursor(res.next_cursor);
        setHistoryHasMore(res.has_more);
      } catch {
        setHistorySessions([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [sessionWorkspaceId, sessionProjectId, chatMode]
  );

  useEffect(() => {
    if (!historyOpen) return;
    setHistorySessions([]);
    setHistoryCursor(null);
    loadHistorySessions();
  }, [historyOpen, loadHistorySessions]);

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
    setIsEditingTitle(false);
    setIsResumedSession(false);
    setWaitingForResponse(false);
    stoppedRef.current = false;
    restoreAttemptedRef.current = false;
    autoResumeTriedRef.current = null;
    autoStartHandledRef.current = false;
  }, [contextKey, disconnect, isConnected, sessionId]);

  // ---------------------------------------------------------------------------
  // Select / create / manual load sessions
  // ---------------------------------------------------------------------------
  const handleSelectHistorySession = useCallback(
    async (s: AgentChatSessionItem) => {
      if (isConnecting || !canUseCurrentMode) return;
      if (sessionId === s.guid && isConnected) {
        setHistoryOpen(false);
        return;
      }
      setHistoryOpen(false);
      skipNextAutoConnectRef.current = true;
      disconnect();
      setEntries([]);
      setCurrentPlan(null);
      setPendingPermission(null);
      setWaitingForResponse(false);
      stoppedRef.current = false;
      setRegistryId(s.registry_id);
      setSessionTitle(s.title || null);
      setSessionTitleSource(s.title_source ?? null);
      setIsAutoGeneratingTitle(false);
      setShouldScrambleAutoTitle(false);
      setIsResumedSession(true);
      setActiveSessionByContext((prev) => ({ ...prev, [contextKey]: s.guid }));
      setIsResumingHistory(true);
      autoResumeTriedRef.current = null;
      try {
        const success = await resumeSession(s.guid);
        if (!success) {
          setIsResumingHistory(false);
        }
      } catch {
        setIsResumingHistory(false);
      } finally {
        skipNextAutoConnectRef.current = false;
      }
    },
    [canUseCurrentMode, contextKey, disconnect, isConnected, isConnecting, resumeSession, sessionId]
  );

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
    setIsEditingTitle(false);
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
  }, [canUseCurrentMode, contextKey, defaultRegistryId, disconnect, disconnectStashed, isConnecting, registryId, startSession]);

  const handleManualLoadMessages = useCallback(async () => {
    const targetSessionId = sessionId;
    if (!targetSessionId || isConnecting || isResumingHistory) return;

    setIsManualLoadingMessages(true);
    try {
      setIsResumingHistory(true);
      setIsResumedSession(true);
      skipNextAutoConnectRef.current = true;
      disconnect();
      setEntries([]);
      setCurrentPlan(null);
      setPendingPermission(null);
      const success = await resumeSession(targetSessionId);
      if (!success) {
        setIsResumingHistory(false);
      }
    } catch {
      setIsResumingHistory(false);
    } finally {
      skipNextAutoConnectRef.current = false;
      setIsManualLoadingMessages(false);
    }
  }, [disconnect, isConnecting, isResumingHistory, resumeSession, sessionId]);

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

  // ---------------------------------------------------------------------------
  // Queued prompt dispatch
  // ---------------------------------------------------------------------------
  const sendQueuedPrompt = useCallback((item: QueuedAgentPrompt) => {
    let finalPrompt = item.prompt;
    if (item.mode === "wiki_ask") {
      finalPrompt = `You are in Wiki Ask mode. Prioritize information from the project's generated wiki content under .atmos/wiki. If the wiki does not contain enough context, state that clearly.\n\nUser question:\n${item.prompt}`;
    }

    const sent = sendPrompt(finalPrompt);
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
      void agentRestApi.updateSessionTitle(sessionId, item.sessionTitle).catch(() => { });
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
        const cachedSessionId =
          activeSessionByContextRef.current[contextKey] ?? activeSessionByContext[contextKey];
        if (cachedSessionId) {
          if (autoResumeTriedRef.current === cachedSessionId) return;
          autoResumeTriedRef.current = cachedSessionId;
          setIsResumedSession(true);
          autoStartHandledRef.current = true;
          void (async () => {
            setIsResumingHistory(true);
            const success = await resumeSession(cachedSessionId);
            if (!success) {
              setIsResumingHistory(false);
              setIsResumedSession(false);
              setActiveSessionByContext((prev) => {
                if (prev[contextKey] !== cachedSessionId) return prev;
                const next = { ...prev };
                delete next[contextKey];
                return next;
              });
              autoStartHandledRef.current = false;
              autoResumeTriedRef.current = null;
              startSession();
            }
          })();
          return;
        }
        void (async () => {
          try {
            const contextType = sessionWorkspaceId != null ? "workspace" : sessionProjectId != null ? "project" : "temp";
            const contextGuid = sessionWorkspaceId ?? sessionProjectId ?? undefined;
            const res = await agentRestApi.listSessions({
              context_type: contextType,
              context_guid: contextGuid,
              mode: chatMode,
              limit: 1,
            });
            const latestSession = res.items[0];
            if (latestSession) {
              if (autoResumeTriedRef.current === latestSession.guid) return;
              autoResumeTriedRef.current = latestSession.guid;
              setIsResumedSession(true);
              setRegistryId(latestSession.registry_id);
              setSessionTitle(latestSession.title ?? null);
              setSessionTitleSource(latestSession.title_source ?? null);
              setIsAutoGeneratingTitle(false);
              setShouldScrambleAutoTitle(false);
              autoStartHandledRef.current = true;
              setIsResumingHistory(true);
              const success = await resumeSession(latestSession.guid);
              if (!success) {
                setIsResumingHistory(false);
                setIsResumedSession(false);
                autoStartHandledRef.current = false;
                autoResumeTriedRef.current = null;
                startSession();
              }
            } else {
              autoStartHandledRef.current = true;
              autoResumeTriedRef.current = null;
              setIsResumedSession(false);
              startSession();
            }
          } catch {
            autoStartHandledRef.current = true;
            autoResumeTriedRef.current = null;
            setIsResumedSession(false);
            startSession();
          }
        })();
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

  const handleStartEditTitle = useCallback(() => {
    if (!sessionTitle) return;
    setEditingTitleValue(sessionTitle);
    setIsEditingTitle(true);
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }, [sessionTitle]);

  const handleFinishEditTitle = useCallback(() => {
    setIsEditingTitle(false);
    const trimmed = editingTitleValue.trim();
    if (!trimmed || trimmed === sessionTitle) return;
    setSessionTitle(trimmed);
    setSessionTitleSource("user");
    setIsAutoGeneratingTitle(false);
    setShouldScrambleAutoTitle(false);
    if (sessionId) {
      void agentRestApi.updateSessionTitle(sessionId, trimmed).catch(() => { });
    }
  }, [editingTitleValue, sessionTitle, sessionId]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleFinishEditTitle();
    } else if (e.key === "Escape") {
      setIsEditingTitle(false);
    }
  }, [handleFinishEditTitle]);

  // ---------------------------------------------------------------------------
  // Message navigation
  // ---------------------------------------------------------------------------
  const userEntryIndices = React.useMemo(
    () => entries.map((e, i) => (e.role === "user" ? i : -1)).filter((i) => i >= 0),
    [entries]
  );

  const scrollToMessage = useCallback((messageIndex: number) => {
    const el = conversationRef.current?.querySelector(
      `[data-entry-index="${messageIndex}"]`
    ) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    }
    setMessageNavIndex(messageIndex);
  }, []);

  const handlePrevMessage = useCallback(() => {
    if (userEntryIndices.length === 0) return;
    const currentIdx = userEntryIndices.indexOf(messageNavIndex);
    if (currentIdx < 0) {
      scrollToMessage(userEntryIndices[userEntryIndices.length - 1]);
      return;
    }
    if (currentIdx <= 0) return;
    scrollToMessage(userEntryIndices[currentIdx - 1]);
  }, [userEntryIndices, messageNavIndex, scrollToMessage]);

  const handleNextMessage = useCallback(() => {
    if (userEntryIndices.length === 0) return;
    const currentIdx = userEntryIndices.indexOf(messageNavIndex);
    if (currentIdx < 0) {
      scrollToMessage(userEntryIndices[0]);
      return;
    }
    if (currentIdx >= userEntryIndices.length - 1) return;
    scrollToMessage(userEntryIndices[currentIdx + 1]);
  }, [userEntryIndices, messageNavIndex, scrollToMessage]);

  // ---------------------------------------------------------------------------
  // Submit / Close / Permission
  // ---------------------------------------------------------------------------
  const handleSubmit = useCallback(
    async (message: { text: string; files?: import("ai").FileUIPart[] }) => {
      const text = message.text.trim();
      if (!text || !isConnected || !canUseCurrentMode) return;
      stoppedRef.current = false;
      const displayFiles = message.files?.map((f, i) => ({ ...f, id: `f-${Date.now()}-${i}` }));
      let sessionTitleForPrompt: string | undefined;
      if (entries.length === 0 && queuedPrompts.length === 0) {
        if (chatMode === "wiki_ask") {
          const projName = (wikiPath ?? localPath)?.split("/").pop() ?? "Project";
          const now = new Date();
          const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          sessionTitleForPrompt = `${projName}_WikiAsk_${ts}`;
          setSessionTitle(sessionTitleForPrompt);
          setSessionTitleSource("user");
          setIsAutoGeneratingTitle(false);
          setShouldScrambleAutoTitle(false);
        } else {
          setSessionTitle(null);
          setSessionTitleSource("auto");
          setIsAutoGeneratingTitle(true);
          setShouldScrambleAutoTitle(false);
        }
      }
      let finalPrompt = text;
      let attachmentPaths: string[] | undefined;

      const uploadPath = localPath ?? sessionCwd;
      if (message.files && message.files.length > 0 && uploadPath) {
        try {
          const { paths } = await agentRestApi.uploadAttachments(
            uploadPath,
            message.files.map((f) => ({
              url: f.url,
              filename: f.filename,
              mediaType: f.mediaType,
            }))
          );
          attachmentPaths = paths.length > 0 ? paths : undefined;
          finalPrompt = buildQueuedAgentPromptContent(text, attachmentPaths);
        } catch (err) {
          console.error("Failed to upload attachments:", err);
        }
      }

      enqueueAgentChatPrompt({
        prompt: finalPrompt,
        displayPrompt: text,
        attachmentPaths,
        files: displayFiles,
        workspaceId: sessionWorkspaceId,
        projectId: sessionProjectId,
        mode: chatMode,
        sessionTitle: sessionTitleForPrompt,
        origin: "panel",
      });
      clearAgentChatDraft(sessionWorkspaceId, sessionProjectId, chatMode);
    },
    [
      chatMode,
      canUseCurrentMode,
      clearAgentChatDraft,
      enqueueAgentChatPrompt,
      entries.length,
      isConnected,
      localPath,
      queuedPrompts.length,
      sessionCwd,
      sessionProjectId,
      sessionWorkspaceId,
      wikiPath,
    ]
  );

  const handleClose = useCallback(() => {
    setAgentChatOpen(false);
  }, [setAgentChatOpen]);

  const handlePermission = useCallback(
    (optionKind: string) => {
      if (!pendingPermission) return;
      const allowed = optionKind.startsWith("allow");
      sendPermissionResponse(pendingPermission.request_id, allowed);
      setPendingPermission(null);
    },
    [pendingPermission, sendPermissionResponse]
  );

  const pendingPermissionMarkdown = useMemo(() => {
    if (!pendingPermission) return null;
    if (pendingPermission.content_markdown?.trim()) {
      return pendingPermission.content_markdown;
    }

    for (let entryIdx = entries.length - 1; entryIdx >= 0; entryIdx--) {
      const entry = entries[entryIdx];
      if (entry.role !== "assistant") continue;
      for (let blockIdx = entry.blocks.length - 1; blockIdx >= 0; blockIdx--) {
        const block = entry.blocks[blockIdx];
        if (block.type !== "tool_call") continue;
        if (!isSwitchModePlanToolCall(block)) continue;
        const markdown = extractPlanMarkdown(block.raw_input);
        if (markdown) return markdown;
      }
    }

    return null;
  }, [entries, pendingPermission]);

  // ---------------------------------------------------------------------------
  // New-session agents menu
  // ---------------------------------------------------------------------------
  const clearCloseAgentsMenuTimer = useCallback(() => {
    if (closeAgentsMenuTimerRef.current) {
      clearTimeout(closeAgentsMenuTimerRef.current);
      closeAgentsMenuTimerRef.current = null;
    }
  }, []);

  const handleOpenNewSessionAgentsMenu = useCallback(() => {
    clearCloseAgentsMenuTimer();
    setNewSessionAgentsOpen(true);
  }, [clearCloseAgentsMenuTimer]);

  const handleScheduleCloseNewSessionAgentsMenu = useCallback(() => {
    clearCloseAgentsMenuTimer();
    closeAgentsMenuTimerRef.current = setTimeout(() => {
      setNewSessionAgentsOpen(false);
    }, 120);
  }, [clearCloseAgentsMenuTimer]);

  const handleSetDefaultAgent = useCallback((agentId: string) => {
    setDefaultRegistryId(agentId);
    writeDefaultAgentRegistryId(agentId);
  }, []);

  useEffect(() => {
    return () => clearCloseAgentsMenuTimer();
  }, [clearCloseAgentsMenuTimer]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const activeAgent = installedAgents.find((agent) => agent.id === registryId) ?? null;
  const displaySessionTitle =
    sessionTitle && sessionTitle !== DEFAULT_SESSION_TITLE ? sessionTitle : null;
  const panelLabel = chatMode === "wiki_ask" ? "Wiki Ask" : "Chat";
  const panelTitle = activeAgent?.name ?? (variant === "sidebar" ? "Wiki Ask" : "Agent Chat");

  const exportableMessages = useMemo<ConversationMessage[]>(
    () =>
      entries.flatMap<ConversationMessage>((entry) => {
        if (entry.role === "user") {
          const content = entry.content.trim();
          return content ? [{ role: "user", content }] : [];
        }

        const content = getAssistantCopyText(entry).trim();
        return content ? [{ role: "assistant", content }] : [];
      }),
    [entries],
  );

  const handleExportConversation = useCallback(() => {
    if (exportableMessages.length === 0) return;

    const timestamp = getLocalTimestampForFilename();
    const markdown = messagesToMarkdown(exportableMessages);
    downloadConversationMarkdown(
      `${sanitizeConversationFilename(displaySessionTitle ?? panelTitle ?? "conversation")}-${timestamp}.md`,
      markdown,
    );
  }, [displaySessionTitle, exportableMessages, panelTitle]);

  const connectionPhaseLabel = (() => {
    switch (connectionPhase) {
      case "initializing":
        return "Initializing ACP connection...";
      case "authenticating":
        return "Authenticating with agent...";
      case "resuming_session":
        return "Restoring ACP session...";
      case "creating_session":
        return "Creating ACP session...";
      case "connecting_ws":
        return "Connecting to chat stream...";
      case "connected":
        return "Connected";
      default:
        return "Ready to connect";
    }
  })();

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
    isManualLoadingMessages,

    installedAgents,
    setInstalledAgents,
    activeAgent,
    registryId,
    defaultRegistryId,
    loadingAgents,

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
    loadHistorySessions,

    sessionTitle,
    displaySessionTitle,
    sessionTitleSource,
    isAutoGeneratingTitle,
    shouldScrambleAutoTitle,
    setShouldScrambleAutoTitle,
    isEditingTitle,
    editingTitleValue,
    setEditingTitleValue,

    chatMode,
    localPath,
    wikiPath,
    sessionWorkspaceId,
    sessionProjectId,
    canUseCurrentMode,
    wikiAskAvailability,
    panelLabel,
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
    titleInputRef,

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
    handlePermission,
    handleCreateNewSession,
    handleSelectHistorySession,
    handleManualLoadMessages,
    handleStartEditTitle,
    handleFinishEditTitle,
    handleTitleKeyDown,
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
