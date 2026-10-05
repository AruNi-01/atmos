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

export type TerminalTitleUpdatedNotification = {
  workspace_id: string;
  tmux_window_name: string;
  tmux_window_index?: number | null;
  session_id: string;
  osc_title?: string | null;
  dynamic_title?: string | null;
  session_title?: string | null;
};

export type AgentStatusClearedNotification = {
  session_ids?: string[];
};

export type AgentOccupancy = "idle" | "running" | "permission_request";

export type AgentLiveKind =
  | "idle"
  | "thinking"
  | "streaming"
  | "working"
  | "tool"
  | "permission";

export type AgentPendingQuestion = {
  id: string;
  prompt: string;
  options?: string[];
};

export type AgentPendingOption = {
  option_id: string;
  name: string;
  kind: string;
};

export type AgentPendingPlanTodo = {
  id?: string | null;
  content: string;
  status?: string | null;
};

export type AgentPendingPermission = {
  request_id: string;
  tool: string;
  description: string;
  content_markdown?: string | null;
  options?: AgentPendingOption[];
  questions?: AgentPendingQuestion[];
  plan_todos?: AgentPendingPlanTodo[];
};

export type AgentToolLine = {
  name: string;
  detail: string;
  state: "pending" | "ok" | "error" | string;
  started_at: string;
  ended_at?: string | null;
  duration_ms?: number | null;
  repeat: number;
  /** Agent Chat tool kind (`edit`, `execute`, …). Missing on older snapshots. */
  kind?: string | null;
  /** Tool output text. Short bodies stay intact; very long bodies are clipped. */
  output?: string | null;
  /** Edit diff or patch. Present only when the payload carried one. */
  diff?: string | null;
  path?: string | null;
  old_content?: string | null;
  new_content?: string | null;
};

export type AgentTodoItem = {
  content: string;
  status: string;
};

export type AgentChildActivity = {
  child_id: string;
  name?: string | null;
  /** Subagent type from Agent Chat params or the hook payload. Not a merge key. */
  agent_type?: string | null;
  /** Subagent description. Separate from `agent_type`. Not a merge key. */
  description?: string | null;
  /** Child that spawned this one. Absent on a direct child of the lead. */
  parent_child_id?: string | null;
  state: AgentOccupancy;
  live_kind?: AgentLiveKind;
  current_tool?: AgentToolLine | null;
  recent_tools: AgentToolLine[];
  prompt?: string | null;
  /** Final answer text. Absent when the source never sent one. */
  reply?: string | null;
  started_at: string;
  last_event_at: string;
};

export type AgentTurn = {
  turn_id: number;
  prompt: string;
  started_at: string;
  ended_at?: string | null;
  tools: AgentToolLine[];
  todos: AgentTodoItem[];
  spawned_child_ids: string[];
  /** Final answer text for this turn. Absent when the source never sent one. */
  reply?: string | null;
};

export type AgentActivity = {
  session_id: string;
  tool: AgentToolType;
  context_id?: string | null;
  pane_id?: string | null;
  project_path?: string | null;
  terminal_kind?: string | null;
  side_chat_id?: string | null;
  source_pane_id?: string | null;
  surface?: AgentSurface;
  surface_id?: string | null;
  space_id?: string | null;
  provider_id?: string | null;
  /** Vendor session id (`session_id` / `sessionId`). Agent Sessions are keyed by this GUID. */
  native_session_id?: string | null;
  /** Host-session provider (`claude`, `grok`, …) for `native_session_id`. */
  host_provider_id?: string | null;
  last_state: AgentOccupancy;
  live_kind?: AgentLiveKind;
  pending_permission?: AgentPendingPermission | null;
  current_tool?: AgentToolLine | null;
  todos: AgentTodoItem[];
  children: AgentChildActivity[];
  turns: AgentTurn[];
  turns_omitted: number;
  current_turn_id?: number | null;
  last_file?: string | null;
  started_at: string;
  last_event_at: string;
};

export type AgentActivityClearedNotification = {
  session_ids?: string[];
};

export type AgentToolType =
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
  | "grok-build"
  | "agent";

export type AgentSurface = "terminal" | "chat";

export type AgentStatusChangedNotification = {
  session_id: string;
  tool: AgentToolType;
  state: AgentOccupancy;
  timestamp: string;
  project_path?: string | null;
  context_id?: string | null;
  pane_id?: string | null;
  terminal_kind?: string | null;
  side_chat_id?: string | null;
  source_pane_id?: string | null;
  hook_version?: number | null;
  surface?: AgentSurface;
  surface_id?: string | null;
  space_id?: string | null;
  provider_id?: string | null;
};

export type LocalModelStateNotification = {
  state: LocalModelStatus;
};

export type AgentNotifyReason = "permission_request" | "task_complete";

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
  surface?: string | null;
  surface_id?: string | null;
  space_id?: string | null;
  provider_id?: string | null;
  reason?: AgentNotifyReason | null;
};

/** Events that only tell the client to refetch; payload is unused. */
export type RefreshNotification = unknown;
