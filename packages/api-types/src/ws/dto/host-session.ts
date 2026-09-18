import type { AgentMessage, GrokGoal, GrokWorkflow } from "./agent-chat";

export type HostSessionTag = "atmos_chat";

export type HostSessionResumeSupport = "supported" | "unsupported";

export type HostSessionListItem = {
  key: string;
  provider_id: string;
  native_id: string;
  title: string;
  cwd: string;
  project_name: string;
  started_at: string;
  updated_at: string;
  message_count: number | null;
  byte_size: number | null;
  model: string | null;
  tags: HostSessionTag[];
  atmos_chat_id: string | null;
  resume_chat: HostSessionResumeSupport;
  resume_tui: HostSessionResumeSupport;
  parent_native_id?: string | null;
};

export type HostSessionSortField = "started_at" | "updated_at" | "byte_size";
export type HostSessionSortOrder = "asc" | "desc";

export type HostSessionListRequest = {
  provider_id?: string | null;
  project?: string | null;
  query?: string | null;
  sort_field?: HostSessionSortField | null;
  sort_order?: HostSessionSortOrder | null;
  updated_after?: string | null;
  updated_before?: string | null;
  limit?: number | null;
  offset?: number | null;
  sync?: boolean | null;
};

export type HostSessionSearchHit = {
  session_key: string;
  root_session_key: string;
  kind: "title" | "user" | "assistant" | string;
  message_id: string | null;
  seq: number;
  snippet: string;
};

export type HostSessionSearchStatus = "indexing" | "ready";

export type HostSessionListResponse = {
  sessions: HostSessionListItem[];
  total: number;
  scanned_at: string;
  hits?: HostSessionSearchHit[];
  search_status?: HostSessionSearchStatus;
};

export type HostSessionGetRequest = {
  key: string;
};

export type HostSessionGetResponse = {
  session: HostSessionListItem;
  messages: AgentMessage[];
  grok_goal?: GrokGoal | null;
  grok_workflow?: GrokWorkflow | null;
};

export type HostSessionResumeChatRequest = {
  key: string;
};

export type HostSessionResumeChatResponse = {
  chat_id: string;
  created: boolean;
};

export type HostSessionResumeTuiRequest = {
  key: string;
};

export type HostSessionResumeTuiResponse = {
  workspace_id?: string | null;
  project_id?: string | null;
  terminal_id?: string | null;
  cwd: string;
  bin: string;
  args: string[];
};

export type HostSessionIndexUpdated = {
  scanned_at: string;
};
