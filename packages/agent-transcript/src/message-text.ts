import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";

export function textFromParts(parts: AgentPart[]): string {
  return parts
    .filter(
      (part): part is Extract<AgentPart, { type: "text" }> =>
        part.type === "text" && !part.parent_tool_call_id,
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function assistantCopyText(message: AgentMessage): string {
  return message.parts
    .flatMap((part) => {
      if (part.type === "text" && part.text.trim() && !part.parent_tool_call_id) {
        return [part.text.trim()];
      }
      if (part.type === "error" && part.message.trim()) return [part.message.trim()];
      return [];
    })
    .join("\n\n")
    .trim();
}
