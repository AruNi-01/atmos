import { useLocalSearchParams } from "expo-router";
import { AgentChatNewScreen } from "@/features/agent-chat/AgentChatNewScreen";

export default function NewChatRoute() {
  const params = useLocalSearchParams<{ workspaceId: string }>();
  return <AgentChatNewScreen workspaceId={firstParam(params.workspaceId)} />;
}

function firstParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ?? "";
}
