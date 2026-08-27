import { wsRequest } from "@/api/ws/request";
import type {
  AgentModelCatalog,
  ConversationIndexEntry,
  ConversationMeta,
} from "@atmos/api-types/ws/dto/conversation";

export type { AgentModelCatalog, ConversationIndexEntry, ConversationMeta };

export const conversationApi = {
  create: (input: {
    provider_id: string;
    workspace_id?: string | null;
    project_id?: string | null;
    cwd?: string | null;
    model?: string | null;
    thinking?: string | null;
    title?: string | null;
  }) => wsRequest("conversation_create", input),
  list: (input: {
    workspace_id?: string | null;
    project_id?: string | null;
    cwd?: string | null;
  } = {}) => wsRequest("conversation_list", input),
  get: (conversation_id: string) => wsRequest("conversation_get", { conversation_id }),
  rename: (conversation_id: string, title: string) =>
    wsRequest("conversation_rename", { conversation_id, title }),
  configure: (
    conversation_id: string,
    patch: {
      provider_id?: string | null;
      model?: string | null;
      thinking?: string | null;
    },
  ) =>
    wsRequest("conversation_configure", {
      conversation_id,
      provider_id: patch.provider_id ?? null,
      model: patch.model ?? null,
      thinking: patch.thinking ?? null,
    }),
  delete: (conversation_id: string) =>
    wsRequest("conversation_delete", { conversation_id }),
  subscribe: (conversation_id: string, after_sequence?: number | null) =>
    wsRequest("conversation_subscribe", { conversation_id, after_sequence }),
  unsubscribe: (conversation_id: string) =>
    wsRequest("conversation_unsubscribe", { conversation_id }),
  send: (conversation_id: string, text: string, attachment_paths?: string[]) =>
    wsRequest("conversation_send", {
      conversation_id,
      text,
      attachment_paths: attachment_paths ?? null,
    }),
  steer: (conversation_id: string, expected_turn_id: string, text: string) =>
    wsRequest("conversation_steer", { conversation_id, expected_turn_id, text }),
  queueAdd: (conversation_id: string, text: string, attachment_paths?: string[]) =>
    wsRequest("conversation_queue_add", {
      conversation_id,
      text,
      attachment_paths: attachment_paths ?? null,
    }),
  cancel: (conversation_id: string) =>
    wsRequest("conversation_cancel", { conversation_id }),
  permissionRespond: (conversation_id: string, request_id: string, option_id: string) =>
    wsRequest("conversation_permission_respond", {
      conversation_id,
      request_id,
      option_id,
    }),
  queueUpdate: (
    conversation_id: string,
    item_id: string,
    patch: { text?: string | null; status?: string | null },
  ) =>
    wsRequest("conversation_queue_update", {
      conversation_id,
      item_id,
      text: patch.text ?? null,
      status: patch.status ?? null,
    }),
  queueReorder: (conversation_id: string, item_ids: string[]) =>
    wsRequest("conversation_queue_reorder", { conversation_id, item_ids }),
  queueDelete: (conversation_id: string, item_id: string) =>
    wsRequest("conversation_queue_delete", { conversation_id, item_id }),
  catalogGet: (agent_id: string, refresh?: boolean) =>
    wsRequest("agent_model_catalog_get", { agent_id, refresh: refresh ?? null }),
};

export type ConversationListRow = ConversationIndexEntry;
export type ConversationSummary = ConversationMeta;
export type ModelCatalog = AgentModelCatalog;
