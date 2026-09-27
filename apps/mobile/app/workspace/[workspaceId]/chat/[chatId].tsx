import { useLocalSearchParams } from "expo-router";
import { AgentChatThreadScreen } from "@/features/agent-chat/AgentChatThreadScreen";

export default function WorkspaceChatRoute() {
  const params = useLocalSearchParams<{ chatId: string; workspaceId: string }>();
  const workspaceId = firstParam(params.workspaceId);
  const chatId = firstParam(params.chatId);
  return <AgentChatThreadScreen chatId={chatId} workspaceId={workspaceId} />;
}

function firstParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ?? "";
}
