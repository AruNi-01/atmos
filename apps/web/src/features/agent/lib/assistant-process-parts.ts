import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";

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

export function isAssistantTurnSettled(message: Pick<AgentMessage, "streaming" | "completed_at" | "worked_ms">): boolean {
  if (message.streaming) return false;
  if (message.completed_at) return true;
  return message.worked_ms != null && message.worked_ms > 0;
}

export function shouldCollapseAssistantProcess(
  message: Pick<AgentMessage, "streaming" | "completed_at" | "worked_ms">,
  hasRunningTool: boolean,
  hasProcess: boolean,
  hasAnswer: boolean,
): boolean {
  if (!hasProcess || !hasAnswer || hasRunningTool) return false;
  return isAssistantTurnSettled(message);
}

export function hasCollapsibleAssistantProcess(message: AgentMessage): boolean {
  const hasRunningTool = message.parts.some(
    (part) => part.type === "tool_call" && part.status?.toLowerCase() === "running",
  );
  const { processParts, answerParts } = splitAssistantProcessParts(message.parts);
  return shouldCollapseAssistantProcess(
    message,
    hasRunningTool,
    processParts.length > 0,
    answerParts.length > 0,
  );
}
