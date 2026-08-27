export type ConversationCreateRequest = {
  workspace_id?: string | null;
  project_id?: string | null;
  cwd?: string | null;
  provider_id: string;
  model?: string | null;
  thinking?: string | null;
  title?: string | null;
};

export type ConversationListRequest = {
  workspace_id?: string | null;
  project_id?: string | null;
  cwd?: string | null;
  cursor?: string | null;
  limit?: number | null;
};

export type ConversationIdRequest = {
  conversation_id: string;
};

export type ConversationMessagesRequest = {
  conversation_id: string;
  before_seq?: number | null;
  limit?: number | null;
};

export type ConversationRenameRequest = {
  conversation_id: string;
  title: string;
};

export type ConversationConfigureRequest = {
  conversation_id: string;
  provider_id?: string | null;
  model?: string | null;
  thinking?: string | null;
};

export type ConversationSubscribeRequest = {
  conversation_id: string;
  after_sequence?: number | null;
};

export type ConversationSendRequest = {
  conversation_id: string;
  text: string;
  attachment_paths?: string[] | null;
};

export type ConversationSteerRequest = {
  conversation_id: string;
  expected_turn_id: string;
  text: string;
};

export type ConversationQueueAddRequest = {
  conversation_id: string;
  text: string;
  attachment_paths?: string[] | null;
};

export type ConversationQueueUpdateRequest = {
  conversation_id: string;
  item_id: string;
  text?: string | null;
  status?: string | null;
};

export type ConversationQueueReorderRequest = {
  conversation_id: string;
  item_ids: string[];
};

export type ConversationQueueDeleteRequest = {
  conversation_id: string;
  item_id: string;
};

export type ConversationPermissionRespondRequest = {
  conversation_id: string;
  request_id: string;
  option_id?: string | null;
  allowed?: boolean | null;
};

export type AgentModelCatalogGetRequest = {
  agent_id: string;
  refresh?: boolean | null;
};

export type ConversationMeta = {
  id: string;
  created_at: string;
  updated_at: string;
  deleted: boolean;
  title: string | null;
  cwd: string;
  workspace_id: string | null;
  project_id: string | null;
  provider_id: string;
  last_message_at: string | null;
  last_event_seq: number;
  persistence_handle: string | null;
  runtime_status: string;
  selected_model: string | null;
  selected_thinking: string | null;
  selected_mode: string | null;
  supports_steer: boolean;
};

export type ConversationIndexEntry = {
  id: string;
  title: string | null;
  cwd: string;
  workspace_id: string | null;
  project_id: string | null;
  provider_id: string;
  updated_at: string;
  last_message_at: string | null;
  deleted: boolean;
};

export type ConversationListResponse = {
  items: ConversationIndexEntry[];
};

export type ConversationTurnIdResponse = {
  turn_id: string;
};

export type ConversationSubscribeResponse = {
  last_event_seq: number;
};

export type ConversationClientEvent = {
  conversation_id: string;
  event_id: string;
  sequence: number;
  payload: Record<string, unknown> & { type: string };
};

export type AgentModelCatalog = {
  agent_id: string;
  status: "ok" | "unsupported" | "auth_required" | "error" | "probing";
  models: Array<{
    id: string;
    label: string;
    group?: string | null;
    is_default?: boolean;
    thinking?: unknown;
  }>;
  modes: Array<{ id: string; label: string; is_default?: boolean }>;
  thinking: unknown;
  strategies_used: string[];
  fetched_at: string;
  source: "cache" | "live";
  message: string | null;
};

export type AgentModelCatalogUpdated = {
  agent_id: string;
  catalog: AgentModelCatalog;
};
