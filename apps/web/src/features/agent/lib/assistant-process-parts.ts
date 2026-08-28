import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";

function isVisibleProcessPart(part: AgentPart): boolean {
  if (part.type === "plan" || part.type === "attachment") return false;
  if (part.type === "thinking") return Boolean(part.text);
  return part.type === "tool_call" || part.type === "error";
}

export function splitAssistantProcessParts(parts: AgentPart[]): {
  processParts: { part: AgentPart; origIndex: number }[];
  answerParts: { part: AgentPart; origIndex: number }[];
} {
  const processParts: { part: AgentPart; origIndex: number }[] = [];
  const answerParts: { part: AgentPart; origIndex: number }[] = [];
  parts.forEach((part, origIndex) => {
    if (!part) return;
    if (part.type === "text" && part.text) {
      answerParts.push({ part, origIndex });
      return;
    }
    processParts.push({ part, origIndex });
  });
  return { processParts, answerParts };
}
