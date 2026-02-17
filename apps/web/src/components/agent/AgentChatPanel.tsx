"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import "streamdown/styles.css";
import { useContextParams } from "@/hooks/use-context-params";
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageContent,
  MessageResponse,
  Popover,
  PopoverContent,
  PopoverTrigger,
  PromptInput,
  PromptInputAddAttachmentsButton,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  ScrollArea,
  Shimmer,
  Skill,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolState,
  usePromptInputAttachments,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
} from "@workspace/ui";
import { Bot, ChevronDown, ChevronUp, Folder, History, Loader2, MessageSquare, Plus, Square, SquareCheck, X } from "lucide-react";
import { useProjectStore } from "@/hooks/use-project-store";
import { useDialogStore } from "@/hooks/use-dialog-store";
import { AgentIcon } from "./AgentIcon";
import { useAgentSession, type AgentServerMessage } from "@/hooks/use-agent-session";
import { agentApi } from "@/api/ws-api";
import { agentApi as agentRestApi, type AgentChatSessionItem } from "@/api/rest-api";
import { formatLocalDateTime } from "@atmos/shared";
import type { RegistryAgent } from "@/api/ws-api";

type ChatMessage =
  | { role: "user"; content: string; files?: (import("ai").FileUIPart & { id: string })[] }
  | { role: "assistant"; content: string; isStreaming?: boolean }
  | {
    role: "tool";
    tool_call_id: string;
    tool: string;
    description: string;
    status: string;
    raw_input?: unknown;
    raw_output?: unknown;
  };

interface PendingPermission {
  request_id: string;
  tool: string;
  description: string;
  risk_level: string;
}

const LAST_SESSION_STORAGE_KEY = "atmos.agent.last_session_by_context";
const DEFAULT_AGENT_STORAGE_KEY = "atmos.agent.default_registry_id";

function getSessionContextKey(workspaceId: string | null, projectId: string | null): string {
  if (workspaceId) return `workspace:${workspaceId}`;
  if (projectId) return `project:${projectId}`;
  return "temp";
}

function readLastSessionMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LAST_SESSION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function getLastSessionIdForContext(contextKey: string): string | null {
  const map = readLastSessionMap();
  return map[contextKey] ?? null;
}

function setLastSessionIdForContext(contextKey: string, sessionId: string): void {
  const map = readLastSessionMap();
  map[contextKey] = sessionId;
  localStorage.setItem(LAST_SESSION_STORAGE_KEY, JSON.stringify(map));
}

function clearLastSessionIdForContext(contextKey: string): void {
  const map = readLastSessionMap();
  if (!(contextKey in map)) return;
  delete map[contextKey];
  localStorage.setItem(LAST_SESSION_STORAGE_KEY, JSON.stringify(map));
}

function readDefaultAgentRegistryId(): string | null {
  try {
    const raw = localStorage.getItem(DEFAULT_AGENT_STORAGE_KEY);
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

function writeDefaultAgentRegistryId(registryId: string): void {
  try {
    if (!registryId) return;
    localStorage.setItem(DEFAULT_AGENT_STORAGE_KEY, registryId);
  } catch {
    // Ignore storage failure
  }
}

function toolStatusToState(status: string): ToolState {
  switch (status?.toLowerCase()) {
    case "running":
      return "input-available";
    case "completed":
      return "output-available";
    case "failed":
      return "output-error";
    default:
      return "output-available";
  }
}

function isSkillInvocation(raw_input?: unknown): raw_input is Record<string, unknown> & { skill?: string; command?: string } {
  if (!raw_input || typeof raw_input !== "object") return false;
  const o = raw_input as Record<string, unknown>;
  return "skill" in o && typeof o.skill === "string" && o.skill.length > 0;
}

function isSkillCommand(raw_input?: unknown): raw_input is Record<string, unknown> & { command: string } {
  if (!raw_input || typeof raw_input !== "object") return false;
  const o = raw_input as Record<string, unknown>;
  const cmd = o.command;
  return typeof cmd === "string" && (cmd.startsWith("agent-browser") || cmd.includes("skill"));
}

function getSkillName(raw_input: Record<string, unknown>): string {
  if (typeof raw_input.skill === "string" && raw_input.skill) return raw_input.skill;
  const cmd = raw_input.command;
  if (typeof cmd === "string" && cmd.startsWith("agent-browser")) return "agent-browser";
  return "Skill";
}

function ToolOrSkillMessage({
  tool,
  description,
  status,
  raw_input,
  raw_output,
}: {
  tool: string;
  description: string;
  status: string;
  raw_input?: unknown;
  raw_output?: unknown;
}) {
  const state = toolStatusToState(status);
  const isError = state === "output-error";
  const asSkill = isSkillInvocation(raw_input) || isSkillCommand(raw_input);

  // For tools: prefer description; avoid generic/status text
  const toolDisplayName =
    description &&
      description !== tool &&
      !/^(Processing|Executing|Running|Tool)\b/i.test(description)
      ? description
      : tool || "Tool";

  const skillName = asSkill && raw_input && typeof raw_input === "object"
    ? getSkillName(raw_input as Record<string, unknown>)
    : toolDisplayName;

  const output =
    raw_output !== undefined && raw_output !== null
      ? typeof raw_output === "string"
        ? raw_output
        : JSON.stringify(raw_output, null, 2)
      : !isError
        ? description || "Processing..."
        : undefined;

  const Wrapper = asSkill ? Skill : Tool;

  return (
    <Wrapper defaultOpen={false} className="w-full">
      <ToolHeader
        variant={asSkill ? "skill" : "tool"}
        state={state}
        title={asSkill ? `Skill: ${skillName}` : toolDisplayName}
      />
      <ToolContent>
        <ToolInput
          input={raw_input}
          label={asSkill ? "Args" : "Parameters"}
        />
        <ToolOutput
          output={output}
          errorText={isError ? (description || "Execution failed") : null}
        />
      </ToolContent>
    </Wrapper>
  );
}

function PromptInputAttachmentsSection() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <PromptInputHeader>
      <Attachments variant="inline">
        {attachments.files.map((a) => (
          <Attachment key={a.id} data={a} onRemove={() => attachments.remove(a.id)}>
            <AttachmentPreview />
            <AttachmentRemove />
          </Attachment>
        ))}
      </Attachments>
    </PromptInputHeader>
  );
}

export function AgentChatPanel() {
  const { workspaceId, projectId, effectiveContextId } = useContextParams();
  const { isAgentChatOpen, setAgentChatOpen } = useDialogStore();
  const [newSessionAgentsOpen, setNewSessionAgentsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [installedAgents, setInstalledAgents] = useState<RegistryAgent[]>([]);
  const [registryId, setRegistryId] = useState<string>("");
  const [defaultRegistryId, setDefaultRegistryId] = useState<string>("");
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const [messageNavIndex, setMessageNavIndex] = useState(-1);
  const lastStreamRef = useRef<string>("");
  const lastDeltaRef = useRef<string>("");
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState<AgentChatSessionItem[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isResumingHistory, setIsResumingHistory] = useState(false);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [headerHovered, setHeaderHovered] = useState(false);
  const [selectedAuthMethodId, setSelectedAuthMethodId] = useState<string>("");
  const { projects, fetchProjects } = useProjectStore();
  const restoreAttemptedRef = useRef(false);
  const autoResumeTriedRef = useRef<string | null>(null);
  const closeAgentsMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isAgentChatOpen && projects.length === 0) {
      fetchProjects();
    }
  }, [isAgentChatOpen, projects.length, fetchProjects]);

  const localPath = React.useMemo(() => {
    if (!effectiveContextId) return null;
    for (const p of projects) {
      const found = p.workspaces.find((w) => w.id === effectiveContextId);
      if (found) return found.localPath;
      if (p.id === effectiveContextId) return p.mainFilePath;
    }
    return null;
  }, [projects, effectiveContextId]);

  const handleMessage = useCallback((msg: AgentServerMessage) => {
    switch (msg.type) {
      case "stream":
        setWaitingForResponse(false);
        if (msg.role === "user") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "user") {
              return [
                ...prev.slice(0, -1),
                { ...last, content: `${last.content}${msg.delta}` },
              ];
            }
            return [
              ...prev,
              {
                role: "user" as const,
                content: msg.delta,
              },
            ];
          });
          break;
        }
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.isStreaming) {
            if (msg.delta === lastDeltaRef.current) return prev;
            lastDeltaRef.current = msg.delta;
            if (msg.delta) lastStreamRef.current += msg.delta;
            return [
              ...prev.slice(0, -1),
              { ...last, content: lastStreamRef.current, isStreaming: !msg.done },
            ];
          }
          lastDeltaRef.current = msg.delta;
          lastStreamRef.current = msg.delta;
          return [
            ...prev,
            {
              role: "assistant" as const,
              content: msg.delta,
              isStreaming: !msg.done,
            },
          ];
        });
        break;
      case "tool_call": {
        const id = msg.tool_call_id ?? "";
        const isTerminal = msg.status === "completed" || msg.status === "failed";
        setMessages((prev) => {
          // Finalize streaming assistant when a tool event arrives (backend rarely sends done: true)
          let next = prev;
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.isStreaming) {
            next = prev.map((m, i) =>
              i === prev.length - 1 && m.role === "assistant"
                ? { ...m, isStreaming: false }
                : m
            );
          }

          let idx = -1;
          if (id) {
            idx = next.findIndex(
              (m) => m.role === "tool" && m.tool_call_id === id
            );
          }
          // Fallback: when Completed/Failed but no match, try raw_input match then last Running
          if (idx < 0 && isTerminal) {
            const incoming = msg.raw_input as Record<string, unknown> | undefined;
            if (incoming && typeof incoming === "object") {
              const matchesInput = (m: { raw_input?: unknown }) => {
                const r = m.raw_input as Record<string, unknown> | undefined;
                if (!r || typeof r !== "object") return false;
                for (const k of ["file_path", "path", "url", "command"]) {
                  const a = incoming[k];
                  const b = r[k];
                  if (a != null && b != null && String(a) === String(b))
                    return true;
                }
                return false;
              };
              idx = next.findIndex(
                (m) =>
                  m.role === "tool" &&
                  m.status?.toLowerCase() === "running" &&
                  matchesInput(m)
              );
            }
            if (idx < 0) {
              for (let i = next.length - 1; i >= 0; i--) {
                const m = next[i];
                if (m.role === "tool" && m.status?.toLowerCase() === "running") {
                  idx = i;
                  break;
                }
              }
            }
          }
          if (idx >= 0) {
            return next.map((m, i) =>
              i === idx && m.role === "tool"
                ? {
                  ...m,
                  tool: msg.tool || m.tool,
                  description: msg.description || m.description,
                  status: msg.status,
                  raw_input: msg.raw_input ?? m.raw_input,
                  raw_output: msg.raw_output ?? m.raw_output,
                }
                : m
            );
          }
          return [
            ...next,
            {
              role: "tool" as const,
              tool_call_id: id,
              tool: msg.tool,
              description: msg.description,
              status: msg.status,
              raw_input: msg.raw_input,
              raw_output: msg.raw_output,
            },
          ];
        });
        break;
      }
      case "permission_request":
        setPendingPermission({
          request_id: msg.request_id,
          tool: msg.tool,
          description: msg.description,
          risk_level: msg.risk_level,
        });
        break;
      case "error":
        setWaitingForResponse(false);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant" as const,
            content: `Error: ${msg.message}`,
            isStreaming: false,
          },
        ]);
        break;
      case "session_ended":
        break;
    }
  }, []);

  const {
    sessionId,
    isConnecting,
    isConnected,
    connectionPhase,
    error,
    authRequest,
    sendPrompt,
    sendPermissionResponse,
    startSession,
    resumeSession,
    clearAuthRequest,
    disconnect,
    sessionCwd,
    sessionTitle: activeSessionTitle,
  } = useAgentSession({
    workspaceId,
    projectId,
    registryId,
    onMessage: handleMessage,
  });

  const loadHistorySessions = useCallback(
    async (cursor?: string) => {
      setHistoryLoading(true);
      try {
        const contextType =
          workspaceId != null ? "workspace" : projectId != null ? "project" : "temp";
        const contextGuid = workspaceId ?? projectId ?? undefined;
        const res = await agentRestApi.listSessions({
          context_type: contextType,
          context_guid: contextGuid,
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
    [workspaceId, projectId]
  );

  useEffect(() => {
    if (!historyOpen) return;
    setHistorySessions([]);
    setHistoryCursor(null);
    loadHistorySessions();
  }, [historyOpen, loadHistorySessions]);

  const skipNextAutoConnectRef = useRef(false);
  const contextKey = React.useMemo(
    () => getSessionContextKey(workspaceId, projectId),
    [workspaceId, projectId]
  );

  const handleSelectHistorySession = useCallback(
    async (s: AgentChatSessionItem) => {
      if (isConnecting) return;
      if (sessionId === s.guid && isConnected) {
        setHistoryOpen(false);
        return;
      }
      setHistoryOpen(false);
      skipNextAutoConnectRef.current = true;
      disconnect();
      setMessages([]);
      setPendingPermission(null);
      setRegistryId(s.registry_id);
      setSessionTitle(s.title || null);
      setIsResumingHistory(true);
      autoResumeTriedRef.current = null;
      try {
        const resumed = await resumeSession(s.guid);
        if (!resumed) {
          await startSession({
            workspaceId: s.context_type === "workspace" ? s.context_guid : null,
            projectId: s.context_type === "project" ? s.context_guid : null,
            registryId: s.registry_id,
          });
        }
      } finally {
        setIsResumingHistory(false);
        // Ensure auto-connect is not accidentally blocked afterwards
        skipNextAutoConnectRef.current = false;
      }
    },
    [disconnect, isConnected, isConnecting, resumeSession, sessionId, startSession]
  );

  const handleCreateNewSession = useCallback(async (targetRegistryId?: string) => {
    if (isConnecting) return;
    const nextRegistryId = targetRegistryId || defaultRegistryId || registryId;
    if (!nextRegistryId) return;
    skipNextAutoConnectRef.current = true;
    disconnect();
    setMessages([]);
    setPendingPermission(null);
    setSessionTitle(null);
    setRegistryId(nextRegistryId);
    restoreAttemptedRef.current = true;
    autoResumeTriedRef.current = null;
    clearLastSessionIdForContext(contextKey);
    try {
      await startSession({ registryId: nextRegistryId });
    } finally {
      // Avoid stale skip flag causing blank panel on next open
      skipNextAutoConnectRef.current = false;
    }
  }, [contextKey, defaultRegistryId, disconnect, isConnecting, registryId, startSession]);

  useEffect(() => {
    if (authRequest?.methods?.length) {
      setSelectedAuthMethodId(authRequest.methods[0].id);
    } else {
      setSelectedAuthMethodId("");
    }
  }, [authRequest]);

  useEffect(() => {
    if (!isAgentChatOpen) {
      restoreAttemptedRef.current = false;
      skipNextAutoConnectRef.current = false;
      setIsResumingHistory(false);
      autoResumeTriedRef.current = null;
      return;
    }
    if (isConnected || isConnecting) return;
    // Registry already loaded for this page lifetime; avoid repeated REST calls.
    if (installedAgents.length > 0 && registryId) return;
    setLoadingAgents(true);
    agentApi
      .listRegistry()
      .then(({ agents }) => {
        const installed = agents.filter((a) => a.installed);
        setInstalledAgents(installed);
        if (installed.length > 0) {
          const storedDefault = readDefaultAgentRegistryId();
          const hasStoredDefault = !!storedDefault && installed.some((a) => a.id === storedDefault);
          const resolvedDefault = hasStoredDefault ? (storedDefault as string) : installed[0].id;
          setDefaultRegistryId(resolvedDefault);
          if (resolvedDefault !== storedDefault) {
            writeDefaultAgentRegistryId(resolvedDefault);
          }
          const currentIsInstalled = installed.some((a) => a.id === registryId);
          if (!currentIsInstalled) setRegistryId(resolvedDefault);
        } else {
          setDefaultRegistryId("");
          setRegistryId("");
        }
      })
      .catch(() => {
        setInstalledAgents([]);
        setDefaultRegistryId("");
        setRegistryId("");
      })
      .finally(() => setLoadingAgents(false));
  }, [isAgentChatOpen, isConnected, isConnecting, installedAgents.length, registryId]);

  // Auto-connect when registryId is set, panel is open, and we have installed agents
  useEffect(() => {
    if (
      isAgentChatOpen &&
      registryId &&
      installedAgents.length > 0 &&
      !isConnected &&
      !isConnecting
    ) {
      if (skipNextAutoConnectRef.current) {
        skipNextAutoConnectRef.current = false;
        return;
      }
      // If we still have an in-memory session id (e.g. API hot-reload dropped WS),
      // always try to resume it first, and never auto-create a new session here.
      if (sessionId) {
        if (autoResumeTriedRef.current === sessionId) return;
        autoResumeTriedRef.current = sessionId;
        void resumeSession(sessionId);
        return;
      }
      if (!restoreAttemptedRef.current) {
        restoreAttemptedRef.current = true;
        const lastSessionId = getLastSessionIdForContext(contextKey);
        if (lastSessionId) {
          void (async () => {
            const resumed = await resumeSession(lastSessionId);
            if (!resumed) {
              clearLastSessionIdForContext(contextKey);
              // Do not auto-create a new session when resume fails.
              // This avoids duplicate "New chat" sessions during service restart/hot-reload.
            }
          })();
          return;
        }
      }
      autoResumeTriedRef.current = null;
      startSession();
    }
  }, [
    contextKey,
    isAgentChatOpen,
    registryId,
    installedAgents.length,
    isConnected,
    isConnecting,
    sessionId,
    resumeSession,
    startSession,
  ]);

  useEffect(() => {
    if (!sessionId) return;
    setLastSessionIdForContext(contextKey, sessionId);
  }, [contextKey, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setSessionTitle(null);
      return;
    }
    if (activeSessionTitle != null) {
      setSessionTitle(activeSessionTitle);
    }
  }, [sessionId, activeSessionTitle]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Indices of user messages only (for prev/next navigation)
  const userMessageIndices = React.useMemo(
    () => messages.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0),
    [messages]
  );

  const scrollToMessage = useCallback((messageIndex: number) => {
    const el = conversationRef.current?.querySelector(
      `[data-message-index="${messageIndex}"]`
    ) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    }
    setMessageNavIndex(messageIndex);
  }, []);

  const handlePrevMessage = useCallback(() => {
    if (userMessageIndices.length === 0) return;
    const currentIdx = userMessageIndices.indexOf(messageNavIndex);
    // When not focused on any user message, prev goes to last
    if (currentIdx < 0) {
      scrollToMessage(userMessageIndices[userMessageIndices.length - 1]);
      return;
    }
    if (currentIdx <= 0) return; // no loop at top
    scrollToMessage(userMessageIndices[currentIdx - 1]);
  }, [userMessageIndices, messageNavIndex, scrollToMessage]);

  const handleNextMessage = useCallback(() => {
    if (userMessageIndices.length === 0) return;
    const currentIdx = userMessageIndices.indexOf(messageNavIndex);
    // When not focused on any user message, next goes to first
    if (currentIdx < 0) {
      scrollToMessage(userMessageIndices[0]);
      return;
    }
    if (currentIdx >= userMessageIndices.length - 1) return; // no loop at bottom
    scrollToMessage(userMessageIndices[currentIdx + 1]);
  }, [userMessageIndices, messageNavIndex, scrollToMessage]);

  const handleSubmit = useCallback(
    async (message: { text: string; files?: import("ai").FileUIPart[] }) => {
      const text = message.text.trim();
      if (!text || !isConnected) return;
      if (messages.length === 0) {
        const title = text.slice(0, 512).trim() || "新会话";
        setSessionTitle(title);
        if (sessionId) {
          void agentRestApi.updateSessionTitle(sessionId, title).catch(() => {
            // Ignore title update failure; chat should continue.
          });
        }
      }
      lastDeltaRef.current = "";
      lastStreamRef.current = "";
      setWaitingForResponse(true);
      setMessages((prev) => [
        ...prev,
        {
          role: "user" as const,
          content: text,
          files: message.files?.map((f, i) => ({ ...f, id: `f-${Date.now()}-${i}` })),
        },
      ]);

      let finalPrompt = text;

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
          if (paths.length > 0) {
            const attachmentInfo = paths.map((p) => `- ${p}`).join("\n");
            finalPrompt = `${text}\n\n[Attached files have been saved to the following paths, please read them to understand the content:]\n${attachmentInfo}`;
          }
        } catch (err) {
          console.error("Failed to upload attachments:", err);
        }
      }

      sendPrompt(finalPrompt);
    },
    [isConnected, sendPrompt, localPath, sessionCwd, messages.length, sessionId]
  );

  const handleClose = useCallback(() => {
    // Keep in-memory session/messages for fast reopen within the same page lifetime.
    // Only hide the panel here; actual disconnect happens on unmount/refresh.
    setAgentChatOpen(false);
  }, [setAgentChatOpen]);

  const handlePermission = useCallback(
    (allowed: boolean) => {
      if (!pendingPermission) return;
      sendPermissionResponse(pendingPermission.request_id, allowed);
      setPendingPermission(null);
    },
    [pendingPermission, sendPermissionResponse]
  );

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

  if (!isAgentChatOpen) return null;

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

  const currentPhase = (() => {
    if (authRequest) {
      return {
        label: "Authenticate",
        detail: "Authentication required. Please choose an auth method to continue.",
      };
    }
    switch (connectionPhase) {
      case "initializing":
        return { label: "Initialize", detail: "Negotiating ACP protocol and capabilities." };
      case "authenticating":
        return { label: "Authenticate", detail: "Authenticating with the selected agent." };
      case "resuming_session":
        return { label: "Session load", detail: "Restoring the previous session context." };
      case "creating_session":
        return { label: "Session new", detail: "Creating a new ACP chat session." };
      case "connecting_ws":
        return { label: "Connect stream", detail: "Opening WebSocket for updates and prompts." };
      default:
        return { label: "Idle", detail: "Waiting to start ACP connection." };
    }
  })();
  const activeAgent = installedAgents.find((agent) => agent.id === registryId) ?? null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex w-[400px] flex-col rounded-xl border border-border bg-background shadow-lg"
      style={{ height: "min(560px, 70dvh)" }}
    >
      <div
        className="flex shrink-0 flex-col gap-1 border-b border-border px-4 py-3"
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
      >
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative size-5">
                <div
                  className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out ${
                    headerHovered
                      ? "translate-y-[-2px] scale-90 opacity-0"
                      : "translate-y-0 scale-100 opacity-100"
                  }`}
                >
                  <Bot className="size-4 shrink-0 text-foreground" />
                </div>
                <Popover open={newSessionAgentsOpen} onOpenChange={setNewSessionAgentsOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={() => void handleCreateNewSession()}
                      onMouseEnter={handleOpenNewSessionAgentsMenu}
                      onMouseLeave={handleScheduleCloseNewSessionAgentsMenu}
                      className={`absolute inset-0 flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-all duration-200 ease-out hover:bg-muted hover:text-foreground ${
                        headerHovered
                          ? "translate-y-0 scale-100 opacity-100"
                          : "translate-y-[2px] scale-90 opacity-0 pointer-events-none"
                      }`}
                      aria-label="New chat session"
                      title="New session (default agent)"
                    >
                      <Plus className="size-4 shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-72 p-1"
                    align="start"
                    onMouseEnter={handleOpenNewSessionAgentsMenu}
                    onMouseLeave={handleScheduleCloseNewSessionAgentsMenu}
                  >
                    <div className="px-2 py-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Create session with agent</p>
                    </div>
                    <div className="max-h-56 overflow-auto">
                      {installedAgents.length === 0 && (
                        <div className="px-2 py-3 text-xs text-muted-foreground">No installed agent</div>
                      )}
                      {installedAgents.map((agent) => {
                        const isDefault = agent.id === defaultRegistryId;
                        return (
                          <div
                            key={agent.id}
                            className="flex items-center justify-between gap-1 rounded-sm px-1 py-0.5 hover:bg-muted"
                          >
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
                              onClick={() => {
                                setNewSessionAgentsOpen(false);
                                void handleCreateNewSession(agent.id);
                              }}
                            >
                              <AgentIcon registryId={agent.id} name={agent.name} size={14} />
                              <span className="truncate">{agent.name}</span>
                            </button>
                            {isDefault ? (
                              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                Default
                              </span>
                            ) : (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSetDefaultAgent(agent.id);
                                      }}
                                      aria-label={`Set ${agent.name} as default agent`}
                                    >
                                      <SquareCheck className="size-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Set as default agent</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <span className="text-sm font-medium shrink-0">Agent Chat</span>
            </div>

            {(localPath ?? sessionCwd) && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="ml-2 flex min-w-0 max-w-[180px] cursor-help items-center gap-1.5 overflow-hidden rounded-md border border-border/50 bg-muted/40 px-2 py-0.5">
                      <Folder className="size-3 shrink-0 text-muted-foreground/70" />
                      <span
                        className="truncate select-none text-[10px] leading-none text-muted-foreground/80"
                        style={{ direction: "rtl", textAlign: "left" }}
                      >
                        {localPath ?? sessionCwd}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs break-all">
                    {!localPath && sessionCwd && (
                      <p className="mb-0.5 text-[11px] text-muted-foreground">Temp directory</p>
                    )}
                    <p className="text-[11px]">{localPath ?? sessionCwd}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="flex items-center gap-0.5">
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Chat history"
                    >
                      <History className="size-4" />
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Chat history</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <PopoverContent className="w-80 p-0" align="end">
              <div className="border-b border-border px-3 py-2">
                <p className="text-sm font-medium">Chat history</p>
              </div>
              <ScrollArea className="h-[280px]">
                {historyLoading && historySessions.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : historySessions.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No history yet
                  </div>
                ) : (
                  <div className="p-1">
                    {historySessions.map((s) => (
                      <button
                        key={s.guid}
                        type="button"
                        className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                        onClick={() => handleSelectHistorySession(s)}
                        disabled={isConnecting}
                      >
                        <span className="w-full truncate font-medium">
                          {s.title || "New chat"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatLocalDateTime(s.created_at)}
                        </span>
                      </button>
                    ))}
                    {historyHasMore && historyCursor && (
                      <button
                        type="button"
                        className="w-full rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
                        onClick={() => loadHistorySessions(historyCursor)}
                        disabled={historyLoading}
                      >
                        {historyLoading ? "Loading..." : "Load more"}
                      </button>
                    )}
                  </div>
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close chat"
          >
            <X className="size-4" />
          </button>
          </div>
        </div>
        {sessionTitle && (
          <div className="truncate text-xs text-muted-foreground" title={sessionTitle}>
            {sessionTitle}
          </div>
        )}
      </div>

      <div ref={conversationRef} className="min-h-0 flex-1 overflow-hidden">
        <Conversation className="min-h-0 h-full overflow-hidden">
          <ConversationContent className="gap-3 p-4!">
            {!isConnected && (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Current ACP stage
                </p>
                <p className="text-sm font-medium text-foreground">{currentPhase.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{currentPhase.detail}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {isConnecting || isResumingHistory ? connectionPhaseLabel : "Waiting to start..."}
                </p>
              </div>
            )}
            {(isConnecting || isResumingHistory) && (
              <div className="flex items-center justify-center py-6">
                <Shimmer duration={1.5}>
                  {isResumingHistory ? "Restoring session..." : connectionPhaseLabel}
                </Shimmer>
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {isConnected && messages.length === 0 && !isConnecting && !error && (
              <ConversationEmptyState
                icon={<MessageSquare className="size-12" />}
                title="Start a conversation"
                description="Type a message below to begin chatting"
              />
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                data-message-index={i}
                className={m.role === "tool" ? "w-full min-w-0" : undefined}
              >
                <Message from={m.role === "tool" ? "assistant" : m.role}>
                  <MessageContent>
                    {m.role === "user" && (
                      <>
                        {m.files && m.files.length > 0 && (
                          <Attachments variant="inline" className="mb-2">
                            {m.files.map((f) => (
                              <Attachment key={f.id} data={f}>
                                <AttachmentPreview />
                                <AttachmentRemove />
                              </Attachment>
                            ))}
                          </Attachments>
                        )}
                        {m.content}
                      </>
                    )}
                    {m.role === "assistant" && (
                      <MessageResponse
                        parseIncompleteMarkdown
                        animated={m.isStreaming}
                        caret={m.isStreaming ? "block" : undefined}
                      >
                        {m.content}
                      </MessageResponse>
                    )}
                    {m.role === "tool" && (
                      <ToolOrSkillMessage
                        tool={m.tool}
                        description={m.description}
                        status={m.status}
                        raw_input={m.raw_input}
                        raw_output={m.raw_output}
                      />
                    )}
                  </MessageContent>
                </Message>
              </div>
            ))}
            {waitingForResponse && (
              <div className="flex items-center gap-2 py-2">
                <Shimmer duration={1.5}>Generating response...</Shimmer>
              </div>
            )}
            <div ref={bottomRef} />
          </ConversationContent>
          <ConversationScrollButton className="absolute bottom-4 right-4" />
          {userMessageIndices.length >= 2 && (
            <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-0.5 rounded-sm border border-border/50 bg-background/80 py-1 shadow-sm backdrop-blur-sm dark:bg-background/60">
              <button
                type="button"
                onClick={handlePrevMessage}
                disabled={
                  userMessageIndices.length > 0 &&
                  userMessageIndices.indexOf(messageNavIndex) === 0
                }
                className="flex items-center justify-center rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                aria-label="Previous message"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMessage}
                disabled={
                  userMessageIndices.length > 0 &&
                  userMessageIndices.indexOf(messageNavIndex) >=
                  userMessageIndices.length - 1
                }
                className="flex items-center justify-center rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                aria-label="Next message"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
          )}
        </Conversation>
      </div>

      {pendingPermission && (
        <div className="shrink-0 border-t border-border p-3">
          <Confirmation
            approval={{ id: pendingPermission.request_id }}
            state="approval-requested"
            className="border-amber-500/50 bg-amber-500/10"
          >
            <ConfirmationRequest>
              <span className="font-medium">Permission requested</span>
              <p className="mt-1 text-sm text-muted-foreground">
                {pendingPermission.description}
              </p>
            </ConfirmationRequest>
            <ConfirmationActions>
              <ConfirmationAction
                variant="outline"
                onClick={() => handlePermission(false)}
              >
                Deny
              </ConfirmationAction>
              <ConfirmationAction onClick={() => handlePermission(true)}>
                Allow
              </ConfirmationAction>
            </ConfirmationActions>
          </Confirmation>
        </div>
      )}

      <div className="shrink-0 p-3">
        <PromptInput
          onSubmit={(msg) => handleSubmit({ text: msg.text, files: msg.files })}
          className="w-full"
          multiple
        >
          <PromptInputAttachmentsSection />
          <PromptInputBody>
            <PromptInputTextarea
              placeholder={isConnected ? "Type a message..." : "Select agent to connect"}
              disabled={!isConnected}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputAddAttachmentsButton />
              {loadingAgents ? (
                <div className="flex h-8 items-center gap-2 px-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  Loading
                </div>
              ) : installedAgents.length === 0 ? (
                <span className="px-2 text-xs text-muted-foreground">No agent</span>
              ) : (
                <div className="flex h-8 items-center gap-2 rounded-md border border-border/50 bg-muted/40 px-2 text-xs text-muted-foreground">
                  {activeAgent ? (
                    <>
                      <AgentIcon registryId={activeAgent.id} name={activeAgent.name} size={14} />
                      <span className="max-w-[120px] truncate">{activeAgent.name}</span>
                    </>
                  ) : (
                    <span className="max-w-[120px] truncate">Agent</span>
                  )}
                </div>
              )}
            </PromptInputTools>
            <PromptInputSubmit
              status={waitingForResponse ? "streaming" : undefined}
              onStop={
                waitingForResponse
                  ? () => {
                    disconnect();
                    setWaitingForResponse(false);
                  }
                  : undefined
              }
              disabled={!isConnected}
              size={waitingForResponse ? "sm" : "icon-sm"}
            >
              {waitingForResponse ? (
                <span className="flex items-center gap-1.5">
                  <Square className="size-4 shrink-0" />
                </span>
              ) : undefined}
            </PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      </div>
      <Dialog open={!!authRequest} onOpenChange={(open) => !open && clearAuthRequest()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agent authentication required</DialogTitle>
            <DialogDescription>
              {authRequest?.message || "This agent requires authentication before creating a session."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {authRequest?.methods.map((method) => {
              const checked = selectedAuthMethodId === method.id;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setSelectedAuthMethodId(method.id)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                >
                  <p className="text-sm font-medium">{method.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{method.description || method.id}</p>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => clearAuthRequest()}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!selectedAuthMethodId) return;
                clearAuthRequest();
                void startSession({ authMethodId: selectedAuthMethodId });
              }}
              disabled={!selectedAuthMethodId || isConnecting}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
