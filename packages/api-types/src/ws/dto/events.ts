import type { LocalModelStatus } from "./local-model";

/** Notification payloads that are not already in a domain DTO module. */

export type GitCommitMessageChunkNotification = {
  stream_id?: string;
  chunk?: string;
  done?: boolean;
  error?: string | null;
};

export type LlmProviderTestChunkNotification = {
  stream_id?: string;
  chunk?: string;
  done?: boolean;
  error?: string | null;
};

export type AgentHookSessionsClearedNotification = {
  session_ids?: string[];
};

export type AgentHookState = "idle" | "running" | "permission_request";

export type AgentHookToolType =
  | "claude-code"
  | "codex"
  | "cursor"
  | "gemini"
  | "antigravity"
  | "factory-droid"
  | "kiro"
  | "opencode"
  | "ampcode"
  | "pi"
  | "hermes"
  | "grok-build";

export type AgentHookStateNotification = {
  session_id: string;
  tool: AgentHookToolType;
  state: AgentHookState;
  timestamp: string;
  project_path?: string | null;
  context_id?: string | null;
  pane_id?: string | null;
  terminal_kind?: string | null;
  side_chat_id?: string | null;
  source_pane_id?: string | null;
  hook_version?: number | null;
};

export type LocalModelStateNotification = {
  state: LocalModelStatus;
};

export type AgentNotificationPayload = {
  title: string;
  body: string;
  tool: string;
  state: string;
  session_id: string;
  project_path?: string | null;
  context_id?: string | null;
  pane_id?: string | null;
  side_chat_id?: string | null;
  source_pane_id?: string | null;
};

/** Events that only tell the client to refetch; payload is unused. */
export type RefreshNotification = unknown;
