import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";

export function isAssistantAnswerTextPart(part: AgentPart): boolean {
  return part.type === "text" && Boolean(part.text);
}

/** Thinking / plan after a reply — not a new unit of tool work. */
export function isSoftAssistantProcessPart(part: AgentPart): boolean {
  return part.type === "thinking" || part.type === "plan";
}

export type AssistantAnswerLayout<T> = {
  process: T[];
  tail: T[];
};

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

/**
 * Work is everything through the last hard part (new tool / error / session chrome)
 * plus any thinking/plan that still comes before the next text — `tool → think → text`
 * is the usual close, so that think stays in the process fold.
 * Same-id tool progress is merged in place, so it never moves a tool after the reply.
 * From the first text after that point, think / plan / extra text stay visible in order.
 * A *new* tool after a text is continued work: that text stays in process.
 */
export function layoutAssistantAnswer<T>(
  items: T[],
  isAnswer: (item: T) => boolean,
  isSoftProcess: (item: T) => boolean,
): AssistantAnswerLayout<T> {
  const split = splitTrailingAnswer(items, isAnswer);
  if (split.answer.length === 0) {
    return { process: split.process, tail: [] };
  }

  let lastHard = -1;
  for (let index = 0; index < items.length; index += 1) {
    if (!isAnswer(items[index]!) && !isSoftProcess(items[index]!)) lastHard = index;
  }

  if (lastHard >= 0) {
    const after = items.slice(lastHard + 1);
    if (after.some(isAnswer)) {
      let firstText = 0;
      while (firstText < after.length && isSoftProcess(after[firstText]!)) firstText += 1;
      if (firstText < after.length && isAnswer(after[firstText]!)) {
        return {
          process: items.slice(0, lastHard + 1 + firstText),
          tail: after.slice(firstText),
        };
      }
      return { process: items.slice(0, lastHard + 1), tail: after };
    }
    return { process: split.process, tail: split.answer };
  }

  const firstAnswer = items.findIndex(isAnswer);
  if (firstAnswer < 0) return { process: split.process, tail: [] };
  return {
    process: items.slice(0, firstAnswer),
    tail: items.slice(firstAnswer),
  };
}

export function splitAssistantProcessParts(parts: AgentPart[]): {
  processParts: { part: AgentPart; origIndex: number }[];
  tailParts: { part: AgentPart; origIndex: number }[];
} {
  const items = parts.flatMap((part, origIndex) => (part ? [{ part, origIndex }] : []));
  const layout = layoutAssistantAnswer(
    items,
    (item) => isAssistantAnswerTextPart(item.part),
    (item) => isSoftAssistantProcessPart(item.part),
  );
  return {
    processParts: layout.process,
    tailParts: layout.tail,
  };
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

function isVisibleProcessPart(part: AgentPart): boolean {
  if (part.type === "plan" || part.type === "attachment") return false;
  if (part.type === "text") return Boolean(part.text);
  if (part.type === "thinking") return Boolean(part.text);
  if (part.type === "error") return Boolean(part.message);
  if (part.type === "tool_call") return true;
  return (
    part.type === "session_lifecycle"
    || part.type === "session_config_change"
    || part.type === "session_hint"
  );
}

export function hasCollapsibleAssistantProcess(message: AgentMessage): boolean {
  const hasRunningTool = message.parts.some(
    (part) => part.type === "tool_call" && part.status?.toLowerCase() === "running",
  );
  const { processParts, tailParts } = splitAssistantProcessParts(message.parts);
  return shouldCollapseAssistantProcess(
    message,
    hasRunningTool,
    processParts.some((item) => isVisibleProcessPart(item.part)),
    tailParts.some((item) => isAssistantAnswerTextPart(item.part)),
  );
}
