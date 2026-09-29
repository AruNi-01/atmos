export type AgentSessionSurface = "terminal" | "chat";

export type AgentSessionGroupKey = "permission" | "attention" | "running" | "done";

export type AgentSessionTool =
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

export type AgentSessionStatusSnapshot = {
  session_id: string;
  context_id: string | null;
  surface: AgentSessionSurface;
  surface_id: string | null;
  tool: AgentSessionTool | null;
  group_key: AgentSessionGroupKey;
  updated_at: string;
  project_path: string | null;
  /** Chat title. Empty for terminal rows. */
  title?: string | null;
};

export type AgentSessionStatusCounts = {
  permission: number;
  attention: number;
  running: number;
  done: number;
};

export type AgentSessionStatusListRequest = {
  limit?: number | null;
  cursor?: string | null;
};

export type AgentSessionStatusListResponse = {
  sessions: AgentSessionStatusSnapshot[];
  next_cursor: string | null;
  total: number;
  counts: AgentSessionStatusCounts;
};

export type AgentSessionArchiveRequest = {
  session_id: string;
};
