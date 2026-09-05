import type { AgentPart, AgentToolKind } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";

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
      parts: AgentToolCallPart[];
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

function isRenderedNonToolPart(part: AgentPart): boolean {
  if (part.type === "plan" || part.type === "attachment") return false;
  if (part.type === "text") return Boolean(part.text);
  if (part.type === "thinking") return Boolean(part.text);
  return part.type === "error" || part.type === "session_lifecycle" || part.type === "session_config_change" || part.type === "session_hint";
}

export function segmentAssistantParts(parts: AgentPart[]): AssistantSegment[] {
  const segments: AssistantSegment[] = [];
  let tools: { part: AgentToolCallPart; origIndex: number }[] = [];

  const flushTools = () => {
    if (tools.length >= 2) {
      segments.push({
        type: "tool_group",
        parts: tools.map((item) => item.part),
        origIndexes: tools.map((item) => item.origIndex),
      });
    } else {
      for (const item of tools) {
        segments.push({ type: "part", part: item.part, origIndex: item.origIndex });
      }
    }
    tools = [];
  };

  parts.forEach((part, origIndex) => {
    if (part.type === "tool_call") {
      tools.push({ part, origIndex });
      return;
    }
    if (!isRenderedNonToolPart(part)) return;
    flushTools();
    segments.push({ type: "part", part, origIndex });
  });
  flushTools();
  return segments;
}

export function splitSegmentedAssistantParts(segments: AssistantSegment[]): {
  processSegments: AssistantSegment[];
  answerSegments: AssistantSegment[];
} {
  const processSegments: AssistantSegment[] = [];
  const answerSegments: AssistantSegment[] = [];
  for (const segment of segments) {
    if (segment.type === "part" && segment.part.type === "text") {
      answerSegments.push(segment);
    } else {
      processSegments.push(segment);
    }
  }
  return { processSegments, answerSegments };
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

export function toolGroupHasRunning(parts: AgentToolCallPart[]): boolean {
  return parts.some((part) => (part.status ?? "").toLowerCase() === "running");
}
