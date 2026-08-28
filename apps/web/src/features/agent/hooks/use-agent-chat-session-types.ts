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
} from "@/features/agent/hooks/use-agent-session";
import type { QueuedAgentPrompt } from "@/app-shell/state/use-dialog-store";
import type { AgentMessage, AgentSessionUsage } from "@atmos/api-types/ws/dto/agent-chat";
import { assistantCopyText } from "@/features/agent/lib/agent-chat-events";
import type { AgentChatMode } from "@/features/agent/types/index";
import type { Project } from "@/shared/types/domain";
import type { AgentActivity, PendingPermission } from "../lib/chat-helpers";
import type { CurrentView } from "@/shared/hooks/use-context-params";

export const DEFAULT_SESSION_TITLE = "新会话";

/** Chat pointer persisted by a host surface (e.g. canvas widget shape). */
export type AgentChatSessionBinding = {
  chatId?: string | null;
  registryId?: string | null;
  sessionCwd?: string | null;
};

export type AgentChatSurfaceVariant = "modal" | "sidebar" | "standalone" | "center";

export interface UseAgentChatSessionOptions {
  variant: AgentChatSurfaceVariant;
  mode: AgentChatMode;
  publishStatus: boolean;
  active?: boolean;
  historyListActive?: boolean;
  contextOverride?: {
    workspaceId: string | null;
    projectId: string | null;
    effectiveContextId: string | null;
    currentView: CurrentView;
  };
  transformPrompt?: (prompt: string) => string;
  /**
   * Isolates session storage / last-session / handoff from other chat panels.
   * Canvas agent-chat widgets pass `shapeId` (or instanceId) so each card and
   * each document keeps its own ACP session.
   */
  instanceKey?: string | null;
  /** Prefer restoring this binding (from persisted widget source) over UI prefs. */
  initialSessionBinding?: AgentChatSessionBinding | null;
  /** Called when the live chat binding changes (persist to document). */
  onSessionBindingChange?: (binding: {
    chatId: string | null;
    registryId: string | null;
    sessionCwd: string | null;
  }) => void;
}

export interface UseAgentChatSessionReturn {
  isPanelOpen: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  connectionPhase: string;
  error: string | null;
  chatId: string;
  sessionCwd: string | null;
  messages: AgentMessage[];
  setMessages: React.Dispatch<React.SetStateAction<AgentMessage[]>>;
  currentPlan: AgentPlan | null;
  pendingPermission: PendingPermission | null;
  pendingPermissionMarkdown: string | null;
  agentActivity: AgentActivity;
  waitingForResponse: boolean;
  setWaitingForResponse: React.Dispatch<React.SetStateAction<boolean>>;
  stoppedRef: React.MutableRefObject<boolean>;
  isResumingHistory: boolean;
  isResumedSession: boolean;
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
  persistPreferredRegistry: (registryId: string) => void;
  setAgentDefaultConfig: (configId: string, value: string) => void;
  sessionUsage: AgentSessionUsage | null;
  elapsedMs: number;
  historyOpen: boolean;
  setHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  historySessions: AgentChatSessionItem[];
  historyHasMore: boolean;
  historyLoading: boolean;
  historyCursor: string | null;
  historyResumeUnsupportedReason: string | null;
  historyUnsupportedReason: string | null;
  loadHistorySessions: (cursor?: string) => Promise<void>;
  projects: Project[];
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
  transcriptRef: React.RefObject<HTMLDivElement | null>;
  authRequest: {
    message?: string;
    methods: { id: string; name: string; description?: string }[];
  } | null;
  selectedAuthMethodId: string;
  setSelectedAuthMethodId: React.Dispatch<React.SetStateAction<string>>;
  clearAuthRequest: () => void;
  startSession: (opts?: { registryId?: string; authMethodId?: string }) => void;
  exportableMessages: ConversationMessage[];
  userMessageIndices: number[];
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
  handleSelectMessage: (messageIndex: number) => void;
  handleSetDefaultAgent: (agentId: string) => void;
  handleOpenNewSessionAgentsMenu: () => void;
  handleScheduleCloseNewSessionAgentsMenu: () => void;
  handleExportChat: () => void;
  persistHandoffSnapshot: () => Promise<string | null>;
  restoreHandoffSnapshot: (expectedChatId?: string | null) => Promise<boolean>;
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
  messages: AgentMessage[],
): ConversationMessage[] {
  return messages.flatMap<ConversationMessage>((message) => {
    if (message.role === "user") {
      const text = message.parts
        .filter((part): part is Extract<AgentMessage["parts"][number], { type: "text" }> => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();
      return text ? [{ role: "user", content: text }] : [];
    }

    const content = assistantCopyText(message).trim();
    return content ? [{ role: "assistant", content }] : [];
  });
}

type ConnectionPhaseTranslator = (key: string) => string;

export function getConnectionPhaseLabel(
  connectionPhase: string,
  t: ConnectionPhaseTranslator,
): string {
  switch (connectionPhase) {
    case "initializing":
      return t("connectionPhase.initializing");
    case "authenticating":
      return t("connectionPhase.authenticating");
    case "resuming_session":
      return t("connectionPhase.resumingSession");
    case "creating_session":
      return t("connectionPhase.creatingSession");
    case "connecting_ws":
      return t("connectionPhase.connectingWs");
    case "connected":
      return t("connectionPhase.connected");
    default:
      return t("connectionPhase.ready");
  }
}
