import type { WsEmpty, WsOk } from "../dto/common";
import type {
  AgentModelCatalog,
  AgentModelCatalogGetRequest,
  AgentChatPrefs,
  AgentChatPrefsSetRequest,
  AgentChatCreateRequest,
  AgentChatIdRequest,
  AgentChatIndexEntry,
  AgentChatListRequest,
  AgentChatListResponse,
  AgentChatMessagesRequest,
  AgentChatMeta,
  AgentChatSnapshot,
  AgentMessage,
  AgentChatPermissionRespondRequest,
  AgentChatQueueAddRequest,
  AgentChatQueueDeleteRequest,
  AgentChatQueueReorderRequest,
  AgentChatQueueUpdateRequest,
  AgentChatRenameRequest,
  AgentChatConfigureRequest,
  AgentChatSendRequest,
  AgentChatSteerRequest,
  AgentChatSubscribeRequest,
  AgentChatSubscribeResponse,
  AgentChatTurnIdResponse,
} from "../dto/agent-chat";

export type AgentChatContract = {
  agent_chat_create: {
    input: AgentChatCreateRequest;
    output: AgentChatMeta;
  };
  agent_chat_list: {
    input: AgentChatListRequest;
    output: AgentChatListResponse;
  };
  agent_chat_get: {
    input: AgentChatIdRequest;
    output: AgentChatSnapshot;
  };
  agent_chat_messages: {
    input: AgentChatMessagesRequest;
    output: { messages: AgentMessage[] };
  };
  agent_chat_rename: {
    input: AgentChatRenameRequest;
    output: AgentChatMeta;
  };
  agent_chat_configure: {
    input: AgentChatConfigureRequest;
    output: AgentChatMeta;
  };
  agent_chat_delete: { input: AgentChatIdRequest; output: WsOk };
  agent_chat_subscribe: {
    input: AgentChatSubscribeRequest;
    output: AgentChatSubscribeResponse;
  };
  agent_chat_unsubscribe: { input: AgentChatIdRequest; output: WsOk };
  agent_chat_send: {
    input: AgentChatSendRequest;
    output: AgentChatTurnIdResponse;
  };
  agent_chat_steer: {
    input: AgentChatSteerRequest;
    output: AgentChatTurnIdResponse;
  };
  agent_chat_queue_add: {
    input: AgentChatQueueAddRequest;
    output: Record<string, unknown>;
  };
  agent_chat_queue_update: {
    input: AgentChatQueueUpdateRequest;
    output: Record<string, unknown>;
  };
  agent_chat_queue_reorder: {
    input: AgentChatQueueReorderRequest;
    output: { items: unknown[] };
  };
  agent_chat_queue_delete: {
    input: AgentChatQueueDeleteRequest;
    output: WsOk;
  };
  agent_chat_cancel: { input: AgentChatIdRequest; output: WsOk };
  agent_chat_permission_respond: {
    input: AgentChatPermissionRespondRequest;
    output: WsOk;
  };
  agent_model_catalog_get: {
    input: AgentModelCatalogGetRequest;
    output: AgentModelCatalog;
  };
  agent_chat_prefs_get: { input: WsEmpty; output: AgentChatPrefs };
  agent_chat_prefs_set: {
    input: AgentChatPrefsSetRequest;
    output: AgentChatPrefs;
  };
};

export type { AgentChatIndexEntry };
