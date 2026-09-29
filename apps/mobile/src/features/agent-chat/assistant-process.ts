import type { AgentMessage, AgentPart, AgentToolKind } from "@atmos/api-types/ws/dto/agent-chat";
import { isHiddenTranscriptChromePart, isSubagentWaitTool, wireToolKind } from "./tool-kind";

export function isAssistantAnswerTextPart(part: AgentPart): boolean {
  return part.type === "text" && Boolean(part.text) && !part.parent_tool_call_id;
}

export function isSoftAssistantProcessPart(part: AgentPart): boolean {
  return part.type === "thinking" || part.type === "plan";
}

type Layout<T> = { process: T[]; tail: T[] };

function splitTrailingAnswer<T>(
  items: T[],
  isAnswer: (item: T) => boolean,
): { process: T[]; answer: T[] } {
  let lastProcess = -1;
  for (let index = 0; index < items.length; index += 1) {
    if (!isAnswer(items[index]!)) lastProcess = index;
  }
  if (lastProcess < 0) return { process: [], answer: items };
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

/** Same split as web: tools through the last hard step, plus thinking that still precedes the reply. */
export function layoutAssistantAnswer<T>(
  items: T[],
  isAnswer: (item: T) => boolean,
  isSoftProcess: (item: T) => boolean,
): Layout<T> {
  const split = splitTrailingAnswer(items, isAnswer);
  if (split.answer.length === 0) return { process: split.process, tail: [] };

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

function parentToolCallId(part: AgentPart): string | null {
  if (!("parent_tool_call_id" in part)) return null;
  const parent = part.parent_tool_call_id?.trim();
  return parent || null;
}

export function visibleTranscriptParts(parts: AgentPart[]): { part: AgentPart; index: number }[] {
  return parts.flatMap((part, index) => {
    if (!part || isHiddenTranscriptChromePart(part)) return [];
    if (parentToolCallId(part)) return [];
    if (part.type === "tool_call" && isSubagentWaitTool(part)) return [];
    return [{ part, index }];
  });
}

export function splitAssistantProcessParts(parts: AgentPart[]): {
  processParts: { part: AgentPart; index: number }[];
  tailParts: { part: AgentPart; index: number }[];
} {
  const items = visibleTranscriptParts(parts);
  const layout = layoutAssistantAnswer(
    items,
    (item) => isAssistantAnswerTextPart(item.part),
    (item) => isSoftAssistantProcessPart(item.part),
  );
  return { processParts: layout.process, tailParts: layout.tail };
}

export function isAssistantTurnSettled(
  message: Pick<AgentMessage, "streaming" | "completed_at">,
): boolean {
  if (message.streaming) return false;
  return Boolean(message.completed_at);
}

function isVisibleProcessPart(part: AgentPart): boolean {
  if (part.type === "text" || part.type === "thinking") return Boolean(part.text);
  if (part.type === "error") return Boolean(part.message);
  if (part.type === "tool_call") return true;
  return false;
}

export function shouldCollapseAssistantProcess(
  message: Pick<AgentMessage, "streaming" | "completed_at">,
  parts: AgentPart[],
): boolean {
  const running = parts.some(
    (part) => part.type === "tool_call" && (part.status ?? "").toLowerCase() === "running",
  );
  if (running) return false;
  const { processParts } = splitAssistantProcessParts(parts);
  const hasProcess = processParts.some((item) => isVisibleProcessPart(item.part));
  if (!hasProcess) return false;
  return isAssistantTurnSettled(message);
}

export type ToolOverviewKind = "write" | "command" | "skill" | "subagent" | "other" | "fetch" | "search" | "read";

const OVERVIEW_ORDER: readonly ToolOverviewKind[] = [
  "write",
  "command",
  "skill",
  "subagent",
  "other",
  "fetch",
  "search",
  "read",
];

const KIND_TO_OVERVIEW: Record<AgentToolKind, ToolOverviewKind> = {
  edit: "write",
  delete: "write",
  move: "write",
  execute: "command",
  skill: "skill",
  subagent: "subagent",
  mcp_list: "other",
  mcp_call: "other",
  other: "other",
  fetch: "fetch",
  search: "search",
  web_search: "search",
  read: "read",
  image_gen: "other",
  plan_document: "other",
};

function overviewKind(part: AgentPart): ToolOverviewKind | null {
  if (part.type !== "tool_call") return null;
  return KIND_TO_OVERVIEW[wireToolKind(part.kind)] ?? "other";
}

function overviewPhrase(kind: ToolOverviewKind, count: number): string {
  const many = count !== 1;
  switch (kind) {
    case "write":
      return many ? `${count} writes` : "1 write";
    case "command":
      return many ? `ran ${count} commands` : "ran 1 command";
    case "skill":
      return many ? `${count} skills` : "1 skill";
    case "subagent":
      return many ? `${count} subagents` : "1 subagent";
    case "fetch":
      return many ? `${count} fetches` : "1 fetch";
    case "search":
      return many ? `${count} searches` : "1 search";
    case "read":
      return many ? `${count} reads` : "1 read";
    case "other":
      return many ? `${count} tools` : "1 tool";
  }
}

export function toolGroupOverview(parts: AgentPart[]): string {
  const counts = new Map<ToolOverviewKind, number>();
  for (const part of parts) {
    const kind = overviewKind(part);
    if (!kind) continue;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return parts.some((part) => part.type === "thinking") ? "Thinking" : "Working";
  }
  const phrase = OVERVIEW_ORDER
    .flatMap((kind) => {
      const count = counts.get(kind) ?? 0;
      return count > 0 ? [overviewPhrase(kind, count)] : [];
    })
    .join(", ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

export type AssistantSegment =
  | { type: "part"; part: AgentPart; index: number }
  | { type: "tool_group"; parts: AgentPart[]; indexes: number[] };

function isFoldableProcessPart(part: AgentPart): boolean {
  if (part.type === "tool_call") return true;
  if (part.type === "thinking") return Boolean(part.text);
  if (part.type === "error") return Boolean(part.message);
  return false;
}

/** Compact density: consecutive tools and thinking share one summary row. */
export function segmentAssistantParts(parts: AgentPart[]): AssistantSegment[] {
  const segments: AssistantSegment[] = [];
  let pending: { part: AgentPart; index: number }[] = [];
  const flush = () => {
    if (pending.length === 1) {
      const [{ part, index }] = pending;
      segments.push({ type: "part", part, index });
    } else if (pending.length > 1) {
      segments.push({
        type: "tool_group",
        parts: pending.map((item) => item.part),
        indexes: pending.map((item) => item.index),
      });
    }
    pending = [];
  };

  for (const item of visibleTranscriptParts(parts)) {
    if (isFoldableProcessPart(item.part)) {
      pending.push(item);
      continue;
    }
    if (item.part.type === "text" && item.part.text) {
      flush();
      segments.push({ type: "part", part: item.part, index: item.index });
    }
  }
  flush();
  return segments;
}

function isAnswerSegment(segment: AssistantSegment): boolean {
  return segment.type === "part" && isAssistantAnswerTextPart(segment.part);
}

export function splitAssistantSegments(segments: AssistantSegment[]): {
  process: AssistantSegment[];
  tail: AssistantSegment[];
} {
  const layout = layoutAssistantAnswer(
    segments,
    isAnswerSegment,
    (segment) => segment.type === "part" && isSoftAssistantProcessPart(segment.part),
  );
  if (layout.tail.some(isAnswerSegment)) return layout;

  let lastText = -1;
  for (let index = layout.process.length - 1; index >= 0; index -= 1) {
    if (isAnswerSegment(layout.process[index]!)) {
      lastText = index;
      break;
    }
  }
  if (lastText < 0) return layout;
  const answer = layout.process[lastText]!;
  return {
    process: layout.process.filter((_, index) => index !== lastText),
    tail: [answer],
  };
}
