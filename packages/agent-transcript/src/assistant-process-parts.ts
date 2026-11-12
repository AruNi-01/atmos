import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { isHiddenGrokChromePart } from "./grok-chrome";
import { isHiddenTranscriptChromePart } from "./tool-kind";

export function isAssistantAnswerTextPart(part: AgentPart): boolean {
  return part.type === "text" && Boolean(part.text) && !part.parent_tool_call_id;
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
  return { process: items, answer: [] };
}

/**
 * Work is everything through the last hard part (new tool / error / session chrome)
 * plus any thinking/plan that still comes before the next text — `tool → think → text`
 * is the usual close, so that think stays in the process fold.
 * Same-id tool progress is merged in place, so it never moves a tool after the reply.
 * From the first text after that point, think / plan / extra text stay visible in order.
 * A *new* tool after a text is continued work: that text stays in process.
 * Both outputs are contiguous slices: folding must never reorder the transcript.
 */
export function layoutAssistantAnswer<T>(
  items: T[],
  isAnswer: (item: T) => boolean,
  isSoftProcess: (item: T) => boolean,
): AssistantAnswerLayout<T> {
  let lastHard = -1;
  for (let index = 0; index < items.length; index += 1) {
    if (!isAnswer(items[index]!) && !isSoftProcess(items[index]!)) lastHard = index;
  }

  const firstAnswer = items.findIndex((item, index) => index > lastHard && isAnswer(item));
  if (firstAnswer < 0) return { process: items, tail: [] };
  return {
    process: items.slice(0, firstAnswer),
    tail: items.slice(firstAnswer),
  };
}

export function splitAssistantProcessParts(parts: AgentPart[]): {
  processParts: { part: AgentPart; origIndex: number }[];
  tailParts: { part: AgentPart; origIndex: number }[];
} {
  const items = parts.flatMap((part, origIndex) =>
    part && !isHiddenGrokChromePart(part, parts) ? [{ part, origIndex }] : [],
  );
  const layout = layoutAssistantAnswer(
    items,
    (item) => isAssistantAnswerTextPart(item.part) || item.part.type === "permission",
    (item) => isSoftAssistantProcessPart(item.part),
  );
  return {
    processParts: layout.process,
    tailParts: layout.tail,
  };
}

export function isAssistantTurnSettled(
  message: Pick<AgentMessage, "streaming" | "completed_at" | "worked_ms">,
): boolean {
  if (message.streaming) return false;
  // Live `worked_ms` is the in-flight elapsed clock. After tools close, every
  // text/thinking part can be closed while the host turn is still running —
  // that gap is not a settled turn.
  return Boolean(message.completed_at);
}

export function shouldCollapseAssistantProcess(
  message: Pick<AgentMessage, "streaming" | "completed_at" | "worked_ms">,
  hasRunningTool: boolean,
  hasProcess: boolean,
  _hasAnswer: boolean,
): boolean {
  if (!hasProcess || hasRunningTool) return false;
  return isAssistantTurnSettled(message);
}

/** When the turn first becomes collapsible, auto-collapse unless the user is inspecting. */
export function shouldAutoCollapseProcessOnSettle(userInspecting: boolean): boolean {
  return !userInspecting;
}

function isVisibleProcessPart(part: AgentPart): boolean {
  if (isHiddenTranscriptChromePart(part)) return false;
  if (part.type === "text") return Boolean(part.text);
  if (part.type === "thinking") return Boolean(part.text);
  if (part.type === "error") return Boolean(part.message);
  if (part.type === "tool_call") return true;
  return (
    part.type === "session_lifecycle" ||
    part.type === "session_config_change" ||
    part.type === "session_hint"
  );
}

export function hasCollapsibleAssistantProcess(message: AgentMessage): boolean {
  const hasRunningTool = message.parts.some(
    (part) =>
      part.type === "tool_call" &&
      part.status?.toLowerCase() === "running" &&
      !isHiddenGrokChromePart(part, message.parts),
  );
  const { processParts, tailParts } = splitAssistantProcessParts(message.parts);
  return shouldCollapseAssistantProcess(
    message,
    hasRunningTool,
    processParts.some((item) => isVisibleProcessPart(item.part)),
    tailParts.some((item) => isAssistantAnswerTextPart(item.part)),
  );
}
