import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentPlan } from "@/features/agent/lib/agent-chat-types";

/** Latest plan-document todos as AgentPlan-shaped entries (for ApprovalCard planIntent). */
export function planDocumentIntentFromMessages(messages: AgentMessage[]): AgentPlan | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (part.type !== "tool_call" || part.kind !== "plan_document") continue;
      if (part.params?.type !== "plan_document") continue;
      const entries = (part.params.todos ?? [])
        .map((todo) => {
          const content = todo.content?.trim() ?? "";
          if (!content) return null;
          return {
            content,
            priority: "medium",
            status: todo.status?.trim() || "pending",
          };
        })
        .filter((entry): entry is AgentPlan["entries"][number] => entry !== null);
      if (entries.length > 0) return { entries };
    }
  }
  return null;
}
