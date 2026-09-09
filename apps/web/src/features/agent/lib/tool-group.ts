import type { AgentPart, AgentToolKind } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import {
  isAssistantAnswerTextPart,
  splitTrailingAnswer,
} from "@/features/agent/lib/assistant-process-parts";
import {
  DEFAULT_TOOL_CALL_DENSITY,
  type ToolCallDensity,
} from "@/features/agent/lib/tool-call-density";

export type ToolOverviewKind =
  | "write"
  | "command"
  | "skill"
  | "subagent"
  | "other"
  | "fetch"
  | "search"
  | "read";

export type AssistantSegment =
  | { type: "part"; part: AgentPart; origIndex: number }
  | {
      type: "tool_group";
      parts: AgentPart[];
      origIndexes: number[];
    };

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

const OVERVIEW_TO_ICON_KIND: Record<ToolOverviewKind, AgentToolKind> = {
  write: "edit",
  command: "execute",
  skill: "skill",
  subagent: "subagent",
  other: "other",
  fetch: "fetch",
  search: "search",
  read: "read",
};

export function overviewKindForTool(kind: AgentToolKind | string | undefined): ToolOverviewKind {
  if (kind && kind in KIND_TO_OVERVIEW) {
    return KIND_TO_OVERVIEW[kind as AgentToolKind];
  }
  return "other";
}

export function iconKindForOverview(kind: ToolOverviewKind): AgentToolKind {
  return OVERVIEW_TO_ICON_KIND[kind];
}

function isVisibleTextPart(part: AgentPart): boolean {
  return part.type === "text" && Boolean(part.text);
}

function isSessionChromePart(part: AgentPart): boolean {
  return (
    part.type === "session_lifecycle"
    || part.type === "session_config_change"
    || part.type === "session_hint"
  );
}

function isRenderedNonToolPart(part: AgentPart): boolean {
  if (part.type === "plan" || part.type === "attachment") return false;
  if (part.type === "text") return Boolean(part.text);
  if (part.type === "thinking") return Boolean(part.text);
  if (part.type === "error") return Boolean(part.message);
  return isSessionChromePart(part);
}

function isFoldableProcessPart(part: AgentPart): boolean {
  if (part.type === "plan" || part.type === "attachment" || isVisibleTextPart(part)) return false;
  if (isSessionChromePart(part)) return false;
  if (part.type === "tool_call") return true;
  return isRenderedNonToolPart(part);
}

export function toolCallPartsFromGroup(parts: AgentPart[]): AgentToolCallPart[] {
  return parts.filter((part): part is AgentToolCallPart => part.type === "tool_call");
}

/** Write and command tools stay visible in detailed density. */
export function isDetailExpandedTool(part: AgentPart): boolean {
  if (part.type !== "tool_call") return false;
  const kind = overviewKindForTool(part.kind);
  return kind === "write" || kind === "command";
}

export function segmentAssistantParts(
  parts: AgentPart[],
  density: ToolCallDensity = DEFAULT_TOOL_CALL_DENSITY,
): AssistantSegment[] {
  const segments: AssistantSegment[] = [];
  let pending: { part: AgentPart; origIndex: number }[] = [];
  const flushPending = () => {
    if (pending.length >= 1) {
      segments.push({
        type: "tool_group",
        parts: pending.map((item) => item.part),
        origIndexes: pending.map((item) => item.origIndex),
      });
    }
    pending = [];
  };

  parts.forEach((part, origIndex) => {
    if (density === "compact") {
      if (isFoldableProcessPart(part)) {
        pending.push({ part, origIndex });
        return;
      }
      if (!isVisibleTextPart(part) && !isSessionChromePart(part)) return;
      flushPending();
      segments.push({ type: "part", part, origIndex });
      return;
    }

    if (part.type === "tool_call" || isRenderedNonToolPart(part)) {
      segments.push({ type: "part", part, origIndex });
    }
  });
  flushPending();
  return segments;
}

export function splitSegmentedAssistantParts(segments: AssistantSegment[]): {
  processSegments: AssistantSegment[];
  answerSegments: AssistantSegment[];
} {
  const { process, answer } = splitTrailingAnswer(
    segments,
    (segment) => segment.type === "part" && isAssistantAnswerTextPart(segment.part),
  );
  return { processSegments: process, answerSegments: answer };
}

export function countToolGroupOverview(
  parts: AgentToolCallPart[],
): { kind: ToolOverviewKind; count: number }[] {
  const counts = new Map<ToolOverviewKind, number>();
  for (const part of parts) {
    const kind = overviewKindForTool(part.kind);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return OVERVIEW_ORDER.flatMap((kind) => {
    const count = counts.get(kind) ?? 0;
    return count > 0 ? [{ kind, count }] : [];
  });
}

export function formatToolGroupOverview(
  counts: { kind: ToolOverviewKind; count: number }[],
  labelFor: (kind: ToolOverviewKind, count: number) => string,
  join: string,
): string {
  return counts.map((item) => labelFor(item.kind, item.count)).join(join);
}

export function sentenceCaseOverview(text: string, locale: string): string {
  if (!text) return text;
  if (locale.toLowerCase().startsWith("zh")) return text;
  const first = text.charAt(0);
  if (first.toLowerCase() === first.toUpperCase()) return text;
  return first.toUpperCase() + text.slice(1);
}

export function toolGroupHasRunning(parts: AgentPart[]): boolean {
  return toolCallPartsFromGroup(parts).some(
    (part) => (part.status ?? "").toLowerCase() === "running",
  );
}
