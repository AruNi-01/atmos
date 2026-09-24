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
};

export type AgentSessionStatusListResponse = {
  sessions: AgentSessionStatusSnapshot[];
};

export type AgentSessionArchiveRequest = {
  session_id: string;
};
