export type AgentChatOrigin = "quick" | "normal";

export type AgentChatPrefs = {
  last_registry_id?: string | null;
};

export type AgentChatPrefsSetRequest = {
  last_registry_id?: string | null;
};

export type AgentChatCreateRequest = {
  workspace_id?: string | null;
  project_id?: string | null;
  space_id?: string | null;
  cwd?: string | null;
  provider_id: string;
  model?: string | null;
  thinking?: string | null;
  mode?: string | null;
  title?: string | null;
  origin?: AgentChatOrigin | null;
};

export type AgentChatListRequest = {
  workspace_id?: string | null;
  project_id?: string | null;
  cwd?: string | null;
  cursor?: string | null;
  limit?: number | null;
  all?: boolean | null;
  origin?: AgentChatOrigin | null;
};

export type AgentChatIdRequest = {
  chat_id: string;
};

export type AgentChatMessagesRequest = {
  chat_id: string;
  limit?: number | null;
};

export type AgentChatRenameRequest = {
  chat_id: string;
  title: string;
};

export type AgentChatConfigureRequest = {
  chat_id: string;
  provider_id?: string | null;
  model?: string | null;
  thinking?: string | null;
  mode?: string | null;
  permission_mode?: string | null;
};

export type AgentChatSubscribeRequest = {
  chat_id: string;
  after_sequence?: number | null;
};

export type AgentChatSendRequest = {
  chat_id: string;
  text: string;
  attachment_paths?: string[] | null;
};

export type AgentChatSteerRequest = {
  chat_id: string;
  expected_turn_id: string;
  text: string;
};

export type AgentChatQueueAddRequest = {
  chat_id: string;
  text: string;
  attachment_paths?: string[] | null;
};

export type AgentChatQueueUpdateRequest = {
  chat_id: string;
  item_id: string;
  text?: string | null;
  status?: string | null;
};

export type AgentChatQueueReorderRequest = {
  chat_id: string;
  item_ids: string[];
};

export type AgentChatQueueDeleteRequest = {
  chat_id: string;
  item_id: string;
};

export type AgentChatPermissionRespondRequest = {
  chat_id: string;
  request_id: string;
  option_id?: string | null;
  allowed?: boolean | null;
};

export type AgentChatSessionOpRespondRequest = {
  chat_id: string;
  request_id: string;
  option_id: string;
};

export type AgentModelCatalogGetRequest = {
  agent_id: string;
  refresh?: boolean | null;
};

export type Capability = "supported" | "unsupported";

export type AgentThinkingSupport =
  | { type: "none" }
  | { type: "enum"; arg?: string | null; options: string[] }
  | { type: "manual"; arg: string; placeholder?: string | null }
  | { type: "encoded_in_model" }
  | { type: "flag_only"; arg: string };

export type AgentIdentity = {
  id: string;
  name: string;
  version?: string | null;
};

export type AgentCapabilities = {
  steer: Capability;
  resume: Capability;
  permission: Capability;
  configure: Capability;
  fork: Capability;
  rewind: Capability;
};

export type AgentOptionSupport = {
  models: Capability;
  thinking: Capability;
  modes: Capability;
  permission_modes: Capability;
};

export type AgentDescriptor = {
  identity: AgentIdentity;
  capabilities: AgentCapabilities;
  support: AgentOptionSupport;
  supported_options: {
    models: Array<{
      id: string;
      label: string;
      group?: string | null;
      is_default?: boolean;
      thinking?: AgentThinkingSupport | null;
    }>;
    thinking?: AgentThinkingSupport;
    modes?: Array<{ id: string; label: string; is_default?: boolean }>;
    permission_modes?: Array<{ id: string; label: string; is_default?: boolean }>;
  };
  current_config: {
    model?: string | null;
    thinking?: string | null;
    mode?: string | null;
    permission_mode?: string | null;
  };
};

export type AgentChatMeta = {
  id: string;
  created_at: string;
  updated_at: string;
  deleted: boolean;
  title: string | null;
  cwd: string;
  workspace_id: string | null;
  project_id: string | null;
  space_id?: string | null;
  origin?: AgentChatOrigin | null;
  provider_id: string;
  last_message_at: string | null;
  last_event_seq: number;
  persistence_handle: string | null;
  runtime_status: string;
  available_commands?: Array<{
    name: string;
    description: string;
    hint?: string | null;
  }>;
  session_usage?: AgentSessionUsage | null;
  descriptor: AgentDescriptor;
  parent_chat_id?: string | null;
  rewind_view?: { until_turn_id: string } | null;
};

export type AgentSessionUsage = {
  used?: number | null;
  size?: number | null;
  cost?: {
    amount?: number | null;
    currency?: string | null;
  } | null;
};

export type AgentTurnUsage = {
  total_tokens?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  thought_tokens?: number | null;
  cached_read_tokens?: number | null;
  cached_write_tokens?: number | null;
};

export type AgentChatIndexEntry = {
  id: string;
  title: string | null;
  cwd: string;
  workspace_id: string | null;
  project_id: string | null;
  space_id?: string | null;
  origin?: AgentChatOrigin | null;
  provider_id: string;
  updated_at: string;
  last_message_at: string | null;
  deleted: boolean;
};

export type AgentChatListResponse = {
  items: AgentChatIndexEntry[];
};

export type AgentToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "web_search"
  | "execute"
  | "fetch"
  | "skill"
  | "subagent"
  | "other";

export type AgentToolStatus = "pending" | "running" | "completed" | "failed";

/** Internally tagged `{ type: kind, … }`. `other.value` is vendor JSON as-is. */
export type AgentToolParams =
  | { type: "read"; path: string; offset?: number | null; limit?: number | null }
  | { type: "edit"; path: string }
  | { type: "delete"; path: string }
  | { type: "move"; from: string; to: string }
  | { type: "search"; query: string; path?: string | null; glob?: string | null }
  | { type: "web_search"; query: string }
  | {
      type: "execute";
      command: string;
      cwd?: string | null;
      background: boolean;
      task_id?: string | null;
    }
  | { type: "fetch"; url: string }
  | { type: "skill"; skill: string }
  | { type: "subagent"; description: string; agent_type?: string | null }
  | { type: "other"; value: unknown };

export type AgentToolResult =
  | { type: "text"; text: string }
  | { type: "file_content"; path: string; text: string }
  | { type: "diff_stats"; path: string; additions: number; deletions: number }
  | { type: "execute"; output: string; exit_code?: number | null }
  | {
      type: "web_search";
      query: string;
      links: Array<{ url: string; title: string; snippet?: string | null }>;
    }
  | {
      type: "search_hits";
      query: string;
      hits: Array<{
        path: string;
        line?: number | null;
        snippet?: string | null;
      }>;
    }
  | {
      type: "web_fetch";
      url: string;
      title?: string | null;
      markdown?: string | null;
      text?: string | null;
    }
  | { type: "other"; value: unknown }
  | { type: "error"; message: string }
  | { type: "empty" };

export type AgentTool = {
  tool_call_id: string;
  name: string;
  title?: string | null;
  kind: AgentToolKind;
  status: AgentToolStatus;
  params: AgentToolParams;
  result?: AgentToolResult | null;
};

export type SessionLifecycleAction = "create" | "resume";
export type SessionLifecycleStatus = "running" | "completed" | "failed";
export type SessionHintTone = "info" | "warning" | "error";

export type SessionConfigValueChange = {
  from?: string | null;
  to: string;
};

export type AgentPart =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string; tool_call_id?: string; duration_ms?: number | null }
  | ({ type: "tool_call" } & AgentTool)
  | { type: "plan"; plan: unknown }
  | { type: "attachment"; path: string; name?: string | null }
  | { type: "error"; message: string }
  | {
      type: "session_lifecycle";
      action: SessionLifecycleAction;
      status: SessionLifecycleStatus;
      duration_ms?: number | null;
      error?: string | null;
    }
  | {
      type: "session_config_change";
      model?: SessionConfigValueChange | null;
      mode?: SessionConfigValueChange | null;
    }
  | {
      type: "session_hint";
      tone: SessionHintTone;
      kind: string;
    };

export type AgentMessage = {
  id: string;
  role: "user" | "assistant" | string;
  kind?: "normal" | "steer" | string;
  parts: AgentPart[];
  created_at?: string;
  streaming?: boolean;
  worked_ms?: number | null;
  thinking_ms?: number | null;
  completed_at?: string | null;
  usage?: AgentTurnUsage | null;
};

export type AgentQueueItem = {
  id: string;
  seq: number;
  status: string;
  prompt: string;
  display_prompt?: string | null;
  attachments?: string[];
};

export type AgentSessionOpKind = "fork" | "rewind";

export type AgentSessionOpOutcome = "applied" | "canceled" | "failed";

export type AgentSessionOpRequest = {
  request_id: string;
  kind: AgentSessionOpKind;
  title: string;
  options: Array<{ option_id: string; name: string; kind?: string }>;
};

export type AgentChatSnapshot = {
  meta: AgentChatMeta;
  messages: AgentMessage[];
  queue: AgentQueueItem[];
  pending_permission?: {
    request_id: string;
    tool: string;
    description: string;
    content_markdown?: string | null;
    options?: Array<{ option_id: string; name: string; kind?: string }>;
    status: string;
  } | null;
  pending_session_op?: AgentSessionOpRequest | null;
  running_turn_id?: string | null;
  running_turn_started_at?: string | null;
};

export type AgentChatTurnIdResponse = {
  turn_id: string;
};

export type AgentChatSubscribeResponse = {
  last_event_seq: number;
};

export type AgentChatPayload =
  | { type: "turn_started"; turn_id: string; created_at?: string | null }
  | {
      type: "user_message";
      turn_id: string;
      message_id: string;
      kind?: string;
      text: string;
      attachments?: string[];
      created_at?: string;
    }
  | { type: "assistant_message_delta"; message_id: string; delta: string; turn_id?: string }
  | { type: "assistant_message_completed"; message_id: string }
  | { type: "thinking_delta"; message_id: string; delta: string; turn_id?: string }
  | { type: "thinking_completed"; message_id: string; thinking_ms?: number | null }
  | {
      type: "tool_call_started" | "tool_call_updated" | "tool_call_completed";
      tool_call: AgentTool;
    }
  | {
      type: "tool_call_failed";
      tool_call: AgentTool;
      error?: string | null;
    }
  | { type: "plan_updated"; plan?: unknown; turn_id?: string }
  | {
      type: "permission_requested";
      request: {
        request_id: string;
        tool?: string;
        description?: string;
        content_markdown?: string;
        options?: Array<{ option_id: string; name: string; kind?: string }>;
      };
    }
  | { type: "permission_resolved"; request_id: string; option_id: string }
  | { type: "session_op_requested"; request: AgentSessionOpRequest }
  | {
      type: "session_op_resolved";
      request_id: string;
      option_id: string;
      outcome: AgentSessionOpOutcome;
      error?: string | null;
    }
  | { type: "session_forked"; parent_chat_id: string; chat_id: string }
  | { type: "rewind_view_updated"; until_turn_id: string | null }
  | {
      type: "turn_completed";
      turn_id: string;
      status?: string;
      worked_ms?: number | null;
      thinking_ms?: number | null;
      completed_at?: string | null;
      usage?: AgentTurnUsage | null;
      error?: string | null;
    }
  | {
      type: "usage_updated";
      session?: AgentSessionUsage | null;
      turn?: AgentTurnUsage | null;
    }
  | {
      type: "queue_updated";
      items: Array<{
        id: string;
        seq: number;
        status: string;
        prompt: string;
        display_prompt?: string | null;
        attachments?: string[];
      }>;
    }
  | { type: "runtime_status"; status?: string; persistence_handle?: string | null }
  | { type: "title_updated"; title?: string | null }
  | {
      type: "available_commands_updated";
      commands?: Array<{ name?: string; description?: string; hint?: string | null }>;
    }
  | { type: "config_updated"; descriptor: AgentDescriptor }
  | { type: "unknown"; event_type: string; payload: unknown }
  | {
      type: "session_lifecycle";
      turn_id: string;
      message_id: string;
      action: SessionLifecycleAction;
      status: SessionLifecycleStatus;
      duration_ms?: number | null;
      error?: string | null;
    }
  | {
      type: "session_config_change";
      turn_id: string;
      message_id: string;
      model?: SessionConfigValueChange | null;
      mode?: SessionConfigValueChange | null;
    }
  | {
      type: "session_hint";
      turn_id: string;
      message_id: string;
      tone: SessionHintTone;
      kind: string;
    };

/** Host event log item. Same tagged union the server emits on `agent_chat_event`. */
export type AgentEvent = AgentChatPayload;

export type AgentChatEvent = {
  chat_id: string;
  event_id: string;
  sequence: number;
  turn_id?: string | null;
  payload: AgentEvent;
};

export type AgentModelCatalog = {
  agent_id: string;
  status: "ok" | "unsupported" | "auth_required" | "error" | "probing";
  models: Array<{
    id: string;
    label: string;
    group?: string | null;
    is_default?: boolean;
    thinking?: AgentThinkingSupport | null;
  }>;
  modes: Array<{ id: string; label: string; is_default?: boolean }>;
  permission_modes?: Array<{ id: string; label: string; is_default?: boolean }>;
  thinking: AgentThinkingSupport;
  strategies_used: string[];
  fetched_at: string;
  source: "cache" | "live";
  message: string | null;
  commands?: Array<{
    name: string;
    description: string;
    hint?: string | null;
  }>;
};

export type AgentModelCatalogUpdated = {
  agent_id: string;
  catalog: AgentModelCatalog;
};
