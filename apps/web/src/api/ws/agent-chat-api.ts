import { wsRequest } from "@/api/ws/request";
import type {
  AgentOptionsSnapshot,
  AgentChatOrigin,
  AgentChatIndexEntry,
  AgentChatMeta,
  AgentChatPrefs,
  AgentChatPrefsSetRequest,
  AgentChatSnapshot,
  AgentChatEvent,
  AgentEvent,
  AgentMessage,
  AgentPart,
  AgentToolKind,
  AgentSessionUsage,
  AgentTurnUsage,
} from "@atmos/api-types/ws/dto/agent-chat";

export type {
  AgentOptionsSnapshot,
  AgentChatOrigin,
  AgentChatIndexEntry,
  AgentChatMeta,
  AgentChatPrefs,
  AgentChatPrefsSetRequest,
  AgentChatSnapshot,
  AgentChatEvent,
  AgentEvent,
  AgentMessage,
  AgentPart,
  AgentToolKind,
  AgentSessionUsage,
  AgentTurnUsage,
};

export const agentChatApi = {
  create: (input: {
    provider_id: string;
    workspace_id?: string | null;
    project_id?: string | null;
    space_id?: string | null;
    cwd?: string | null;
    model?: string | null;
    thinking?: string | null;
    mode?: string | null;
    title?: string | null;
    origin?: AgentChatOrigin | null;
  }) => wsRequest("agent_chat_create", input),
  list: (input: {
    workspace_id?: string | null;
    project_id?: string | null;
    cwd?: string | null;
    cursor?: string | null;
    limit?: number | null;
    all?: boolean | null;
    origin?: AgentChatOrigin | null;
  } = {}) => wsRequest("agent_chat_list", input),
  get: (chat_id: string) => wsRequest("agent_chat_get", { chat_id }),
  rename: (chat_id: string, title: string) =>
    wsRequest("agent_chat_rename", { chat_id, title }),
  configure: (
    chat_id: string,
    patch: {
      provider_id?: string | null;
      model?: string | null;
      thinking?: string | null;
      mode?: string | null;
      permission_mode?: string | null;
      fast?: string | null;
    },
  ) =>
    wsRequest("agent_chat_configure", {
      chat_id,
      provider_id: patch.provider_id ?? null,
      model: patch.model ?? null,
      thinking: patch.thinking ?? null,
      mode: patch.mode ?? null,
      permission_mode: patch.permission_mode ?? null,
      fast: patch.fast ?? null,
    }),
  delete: (chat_id: string) =>
    wsRequest("agent_chat_delete", { chat_id }),
  subscribe: (chat_id: string, after_sequence?: number | null) =>
    wsRequest("agent_chat_subscribe", { chat_id, after_sequence }),
  unsubscribe: (chat_id: string) =>
    wsRequest("agent_chat_unsubscribe", { chat_id }),
  send: (chat_id: string, text: string, attachment_paths?: string[]) =>
    wsRequest("agent_chat_send", {
      chat_id,
      text,
      attachment_paths: attachment_paths ?? null,
    }),
  steer: (chat_id: string, expected_turn_id: string, text: string) =>
    wsRequest("agent_chat_steer", { chat_id, expected_turn_id, text }),
  queueAdd: (chat_id: string, text: string, attachment_paths?: string[]) =>
    wsRequest("agent_chat_queue_add", {
      chat_id,
      text,
      attachment_paths: attachment_paths ?? null,
    }),
  cancel: (chat_id: string) =>
    wsRequest("agent_chat_cancel", { chat_id }),
  permissionRespond: (chat_id: string, request_id: string, option_id: string) =>
    wsRequest("agent_chat_permission_respond", {
      chat_id,
      request_id,
      option_id,
    }),
  sessionOpRespond: (chat_id: string, request_id: string, option_id: string) =>
    wsRequest("agent_chat_session_op_respond", {
      chat_id,
      request_id,
      option_id,
    }),
  queueUpdate: (
    chat_id: string,
    item_id: string,
    patch: { text?: string | null; status?: string | null },
  ) =>
    wsRequest("agent_chat_queue_update", {
      chat_id,
      item_id,
      text: patch.text ?? null,
      status: patch.status ?? null,
    }),
  queueReorder: (chat_id: string, item_ids: string[]) =>
    wsRequest("agent_chat_queue_reorder", { chat_id, item_ids }),
  queueDelete: (chat_id: string, item_id: string) =>
    wsRequest("agent_chat_queue_delete", { chat_id, item_id }),
  optionsGet: (agent_id: string, refresh?: boolean) =>
    wsRequest("agent_options_get", { agent_id, refresh: refresh ?? null }),
  prefsGet: () => wsRequest("agent_chat_prefs_get"),
  prefsSet: (input: AgentChatPrefsSetRequest) =>
    wsRequest("agent_chat_prefs_set", input),
};

