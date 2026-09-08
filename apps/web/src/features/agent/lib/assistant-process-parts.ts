import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";

export function isAssistantAnswerTextPart(part: AgentPart): boolean {
  return part.type === "text" && Boolean(part.text);
}

/** Trailing text after the last process part is the reply; earlier text stays in process. */
export function splitTrailingAnswer<T>(
  items: T[],
  isAnswer: (item: T) => boolean,
): { process: T[]; answer: T[] } {
  let lastProcess = -1;
  for (let index = 0; index < items.length; index += 1) {
    if (!isAnswer(items[index]!)) lastProcess = index;
  }
  if (lastProcess < 0) {
    return { process: [], answer: items };
  }
  const trailing = items.slice(lastProcess + 1);
  if (trailing.some(isAnswer)) {
    return { process: items.slice(0, lastProcess + 1), answer: trailing };
  }
  let firstProcess = 0;
  while (firstProcess < items.length && isAnswer(items[firstProcess]!)) firstProcess += 1;
  const hasLaterAnswer = items.slice(firstProcess).some(isAnswer);
  if (firstProcess > 0 && !hasLaterAnswer) {
    return { process: items.slice(firstProcess), answer: items.slice(0, firstProcess) };
  }
  return { process: items, answer: [] };
}

export function splitAssistantProcessParts(parts: AgentPart[]): {
  processParts: { part: AgentPart; origIndex: number }[];
  answerParts: { part: AgentPart; origIndex: number }[];
} {
  const items = parts.flatMap((part, origIndex) => (part ? [{ part, origIndex }] : []));
  const { process, answer } = splitTrailingAnswer(items, (item) => isAssistantAnswerTextPart(item.part));
  return { processParts: process, answerParts: answer };
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

/** When the turn first becomes collapsible, auto-collapse unless the user is inspecting. */
export function shouldAutoCollapseProcessOnSettle(userInspecting: boolean): boolean {
  return !userInspecting;
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
