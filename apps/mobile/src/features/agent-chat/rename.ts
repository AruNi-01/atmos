import type {
  AgentChatIdRequest,
  AgentChatRenameRequest,
} from "@atmos/api-types/ws/dto/agent-chat";

export function renameRequest(chatId: string, title: string): {
  action: "agent_chat_rename";
  input: AgentChatRenameRequest;
} {
  return {
    action: "agent_chat_rename",
    input: { chat_id: chatId, title },
  };
}

export function deleteRequest(chatId: string): {
  action: "agent_chat_delete";
  input: AgentChatIdRequest;
} {
  return {
    action: "agent_chat_delete",
    input: { chat_id: chatId },
  };
}
