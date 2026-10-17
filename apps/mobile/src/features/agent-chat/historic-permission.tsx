import { View } from "react-native";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { AgentChatPermissionCard } from "./AgentChatPermissionCard";

export function HistoricPermission({ part }: { part: Extract<AgentPart, { type: "permission" }> }) {
  if (part.request.status === "pending") return null;
  return (
    <View style={{ minWidth: 0, paddingVertical: 4 }}>
      <AgentChatPermissionCard onRespond={() => undefined} readOnly request={part.request} />
    </View>
  );
}
