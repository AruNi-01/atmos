import { useLocalSearchParams } from "expo-router";
import { AgentChatSessionListScreen } from "@/features/agent-chat/AgentChatSessionListScreen";

export default function WorkspaceChatListRoute() {
  const params = useLocalSearchParams<{ workspaceId: string }>();
  return <AgentChatSessionListScreen workspaceId={firstParam(params.workspaceId)} />;
}

function firstParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ?? "";
}
