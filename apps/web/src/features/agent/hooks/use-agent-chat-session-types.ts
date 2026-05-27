"use client";

import type React from "react";
import type { ConversationMessage } from "@workspace/ui";
import type {
  AgentCapabilities,
  AgentChatSessionItem,
  AgentImplementationInfo,
} from "@/api/rest-api";
import type { RegistryAgent } from "@/api/ws-api";
import type {
  AgentConfigOption,
  AgentPlan,
  AgentUsage,
} from "@/features/agent/hooks/use-agent-session";
import type { QueuedAgentPrompt } from "@/app-shell/state/use-dialog-store";
import type { ThreadEntry } from "@/features/agent/lib/agent/thread";
import { getAssistantCopyText } from "@/features/agent/lib/agent/thread";
import type { AgentChatMode } from "@/features/agent/types/index";
import type { Project } from "@/shared/types/domain";
import type { AgentActivity, PendingPermission } from "../lib/chat-helpers";

// Display fallback before an ACP agent reports a title through session_info_update.
export const DEFAULT_SESSION_TITLE = "新会话";

export interface UseAgentChatSessionOptions {
  variant: "modal" | "sidebar";
  mode: AgentChatMode;
  publishStatus: boolean;
  active?: boolean;
}

export interface UseAgentChatSessionReturn {
  isPanelOpen: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  connectionPhase: string;
  error: string | null;
  sessionId: string | null;
  sessionCwd: string | null;
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
  installedAgents: RegistryAgent[];
  setInstalledAgents: React.Dispatch<React.SetStateAction<RegistryAgent[]>>;
  activeAgent: RegistryAgent | null;
  registryId: string;
  defaultRegistryId: string;
  loadingAgents: boolean;
  agentInfo: AgentImplementationInfo | null;
  capabilities: AgentCapabilities | null;
  configOptions: AgentConfigOption[];
  setConfigOption: (key: string, value: string) => void;
  setAgentDefaultConfig: (configId: string, value: string) => void;
  sessionUsage: AgentUsage | null;
  historyOpen: boolean;
  setHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  historySessions: AgentChatSessionItem[];
  historyHasMore: boolean;
  historyLoading: boolean;
  historyCursor: string | null;
  historyResumeUnsupportedReason: string | null;
  historyUnsupportedReason: string | null;
  loadHistorySessions: (cursor?: string) => Promise<void>;
  sessionTitle: string | null;
  displaySessionTitle: string | null;
  sessionTitleSource: string | null;
  isAutoGeneratingTitle: boolean;
  shouldScrambleAutoTitle: boolean;
  setShouldScrambleAutoTitle: React.Dispatch<React.SetStateAction<boolean>>;
  chatMode: AgentChatMode;
  localPath: string | null;
  sessionWorkspaceId: string | null;
  sessionProjectId: string | null;
  canUseCurrentMode: boolean;
  panelLabel: string;
  panelTitle: string;
  connectionPhaseLabel: string;
  queueKey: string;
  queuedPrompts: QueuedAgentPrompt[];
  removeQueuedAgentChatPrompt: (id: string) => void;
  updateQueuedAgentChatPrompt: (id: string, updates: { prompt: string }) => void;
  moveQueuedAgentChatPrompt: (id: string, toIndex: number) => void;
  newSessionAgentsOpen: boolean;
  setNewSessionAgentsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  headerHovered: boolean;
  setHeaderHovered: React.Dispatch<React.SetStateAction<boolean>>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  conversationRef: React.RefObject<HTMLDivElement | null>;
  authRequest: {
    message?: string;
    methods: { id: string; name: string; description?: string }[];
  } | null;
  selectedAuthMethodId: string;
  setSelectedAuthMethodId: React.Dispatch<React.SetStateAction<string>>;
  clearAuthRequest: () => void;
  startSession: (opts?: { registryId?: string; authMethodId?: string }) => void;
  exportableMessages: ConversationMessage[];
  userEntryIndices: number[];
  messageNavIndex: number;
  handleSubmit: (message: {
    text: string;
    files?: import("ai").FileUIPart[];
  }) => Promise<void>;
  handleClose: () => void;
  handleLogoutAgent: () => Promise<void>;
  handlePermission: (optionKind: string) => void;
  handleCreateNewSession: (targetRegistryId?: string) => Promise<void>;
  handleSelectHistorySession: (s: AgentChatSessionItem) => Promise<void>;
  handleManualLoadMessages: () => Promise<void>;
  handlePrevMessage: () => void;
  handleNextMessage: () => void;
  handleSetDefaultAgent: (agentId: string) => void;
  handleOpenNewSessionAgentsMenu: () => void;
  handleScheduleCloseNewSessionAgentsMenu: () => void;
  handleExportConversation: () => void;
  sendCancel: () => void;
  disconnect: () => void;
}

export function resolveAgentChatLocalPath(
  projects: Project[],
  effectiveContextId: string | null | undefined,
): string | null {
  if (!effectiveContextId) return null;
  for (const project of projects) {
    const workspace = project.workspaces.find((item) => item.id === effectiveContextId);
    if (workspace) return workspace.localPath;
    if (project.id === effectiveContextId) return project.mainFilePath;
  }
  return null;
}

export function resolveAgentChatParentProjectId(
  projects: Project[],
  workspaceId: string | null | undefined,
): string | null {
  if (!workspaceId) return null;
  for (const project of projects) {
    if (project.workspaces.some((workspace) => workspace.id === workspaceId)) {
      return project.id;
    }
  }
  return null;
}

export function resolveAgentChatWikiPath(
  projects: Project[],
  effectiveContextId: string | null | undefined,
): string | null {
  if (!effectiveContextId) return null;
  for (const project of projects) {
    if (project.workspaces.some((workspace) => workspace.id === effectiveContextId)) {
      return project.mainFilePath;
    }
    if (project.id === effectiveContextId) return project.mainFilePath;
  }
  return null;
}

export function buildAgentChatExportableMessages(
  entries: ThreadEntry[],
): ConversationMessage[] {
  return entries.flatMap<ConversationMessage>((entry) => {
    if (entry.role === "user") {
      const content = entry.content.trim();
      return content ? [{ role: "user", content }] : [];
    }

    const content = getAssistantCopyText(entry).trim();
    return content ? [{ role: "assistant", content }] : [];
  });
}

export function getConnectionPhaseLabel(connectionPhase: string): string {
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
}
