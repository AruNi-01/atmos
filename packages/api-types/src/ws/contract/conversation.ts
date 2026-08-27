import type { WsOk } from "../dto/common";
import type {
  AgentModelCatalog,
  AgentModelCatalogGetRequest,
  ConversationCreateRequest,
  ConversationIdRequest,
  ConversationIndexEntry,
  ConversationListRequest,
  ConversationListResponse,
  ConversationMessagesRequest,
  ConversationMeta,
  ConversationPermissionRespondRequest,
  ConversationQueueAddRequest,
  ConversationQueueDeleteRequest,
  ConversationQueueReorderRequest,
  ConversationQueueUpdateRequest,
  ConversationRenameRequest,
  ConversationConfigureRequest,
  ConversationSendRequest,
  ConversationSteerRequest,
  ConversationSubscribeRequest,
  ConversationSubscribeResponse,
  ConversationTurnIdResponse,
} from "../dto/conversation";

export type ConversationContract = {
  conversation_create: {
    input: ConversationCreateRequest;
    output: ConversationMeta;
  };
  conversation_list: {
    input: ConversationListRequest;
    output: ConversationListResponse;
  };
  conversation_get: {
    input: ConversationIdRequest;
    output: Record<string, unknown>;
  };
  conversation_messages: {
    input: ConversationMessagesRequest;
    output: Record<string, unknown>;
  };
  conversation_rename: {
    input: ConversationRenameRequest;
    output: ConversationMeta;
  };
  conversation_configure: {
    input: ConversationConfigureRequest;
    output: ConversationMeta;
  };
  conversation_delete: { input: ConversationIdRequest; output: WsOk };
  conversation_subscribe: {
    input: ConversationSubscribeRequest;
    output: ConversationSubscribeResponse;
  };
  conversation_unsubscribe: { input: ConversationIdRequest; output: WsOk };
  conversation_send: {
    input: ConversationSendRequest;
    output: ConversationTurnIdResponse;
  };
  conversation_steer: {
    input: ConversationSteerRequest;
    output: ConversationTurnIdResponse;
  };
  conversation_queue_add: {
    input: ConversationQueueAddRequest;
    output: Record<string, unknown>;
  };
  conversation_queue_update: {
    input: ConversationQueueUpdateRequest;
    output: Record<string, unknown>;
  };
  conversation_queue_reorder: {
    input: ConversationQueueReorderRequest;
    output: { items: unknown[] };
  };
  conversation_queue_delete: {
    input: ConversationQueueDeleteRequest;
    output: WsOk;
  };
  conversation_cancel: { input: ConversationIdRequest; output: WsOk };
  conversation_permission_respond: {
    input: ConversationPermissionRespondRequest;
    output: WsOk;
  };
  agent_model_catalog_get: {
    input: AgentModelCatalogGetRequest;
    output: AgentModelCatalog;
  };
};

export type { ConversationIndexEntry };
