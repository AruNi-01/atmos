import type { AgentChatEvent, AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  formatWorkDuration,
  thinkingBlockDurationMs,
  thinkingDurationSeconds,
} from "./agent-chat-timing";
import { hasCollapsibleAssistantProcess } from "./assistant-process-parts";
import { classifyTranscriptPart, subagentChildParts } from "./classify";
import {
  preferredCollapsedToolTitle,
  presentAgentTool,
  type ParsedToolResult,
  type ToolPresentation,
} from "./present";
import {
  countToolGroupOverview,
  formatToolGroupOverview,
  segmentAssistantParts,
  sentenceCaseOverview,
  splitSegmentedAssistantParts,
  toolCallPartsFromGroup,
  type AssistantSegment,
  type ToolOverviewKind,
} from "./tool-group";
import {
  isHiddenTranscriptChromePart,
  isSubagentWaitTool,
  partParentToolCallId,
  type AgentToolCallPart,
} from "./tool-kind";
import { USER_MESSAGE_COLLAPSE_LINES } from "./user-message-collapse";
import f1 from "../fixtures/parity/F1.json";
import f2 from "../fixtures/parity/F2.json";
import f3 from "../fixtures/parity/F3.json";
import f4 from "../fixtures/parity/F4.json";
import f5 from "../fixtures/parity/F5.json";
import f6 from "../fixtures/parity/F6.json";
import f7 from "../fixtures/parity/F7.json";
import f8 from "../fixtures/parity/F8.json";
import f9 from "../fixtures/parity/F9.json";
import f10 from "../fixtures/parity/F10.json";
import f11 from "../fixtures/parity/F11.json";
import f12 from "../fixtures/parity/F12.json";
import f13 from "../fixtures/parity/F13.json";

/** Composer paste chip starts above this many lines. */
const PASTE_LINE_THRESHOLD = 10;
const TOOL_GROUP_JOIN = ", ";
const TOOL_GROUP_LOCALE = "en";

export const PARITY_FIXTURE_IDS = [
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  "F13",
] as const;

export type ParityTone = "warning" | "error" | "default";

export type ParityNode = {
  kind: string;
  label?: string;
  tone?: ParityTone;
  expanded?: boolean;
  children?: ParityNode[];
};

/** `none` keeps defaults. `process` opens process keys. `all` opens every key. A record opens listed keys. */
export type ParityExpand = "none" | "process" | "all" | Readonly<Record<string, boolean>>;

export type ParityCards = {
  plan?: { title?: string; body?: string };
  queue?: ReadonlyArray<{ id: string; prompt: string }>;
  background?: ReadonlyArray<{ id: string; command: string }>;
  subagents?: ReadonlyArray<{ id: string; title: string }>;
  goal?: { text?: string };
  workflow?: { text?: string };
  context?: { used: number; window?: number };
  permission?: {
    request_id?: string;
    tool?: string;
    description: string;
    status?: string;
    questions?: ReadonlyArray<{ id?: string; prompt: string }>;
    options?: ReadonlyArray<{ option_id?: string; name: string }>;
  };
};

/** `pending` is fixture-only. It is not an AgentMessage wire field. */
export type ParityMessage = AgentMessage & { pending?: boolean };

export type ParityFixture = {
  id: string;
  title: string;
  messages: ParityMessage[];
  cards?: ParityCards;
  script?: ReadonlyArray<{ atMs: number; event: AgentChatEvent }>;
};

export type ParityTreeOptions = {
  expand?: ParityExpand;
  cards?: ParityCards;
};

const RAW_FIXTURES: ReadonlyArray<readonly [string, unknown]> = [
  ["F1", f1],
  ["F2", f2],
  ["F3", f3],
  ["F4", f4],
  ["F5", f5],
  ["F6", f6],
  ["F7", f7],
  ["F8", f8],
  ["F9", f9],
  ["F10", f10],
  ["F11", f11],
  ["F12", f12],
  ["F13", f13],
];

function asFixture(value: unknown, fileId: string): ParityFixture {
  if (!value || typeof value !== "object") {
    throw new Error(`Fixture ${fileId} is not an object`);
  }
  const record = value as ParityFixture;
  if (record.id !== fileId) {
    throw new Error(`Fixture ${fileId} has id ${String(record.id)}`);
  }
  if (!Array.isArray(record.messages)) {
    throw new Error(`Fixture ${fileId} is missing messages`);
  }
  return record;
}

export const PARITY_FIXTURES: readonly ParityFixture[] = RAW_FIXTURES.map(([id, value]) =>
  asFixture(value, id),
);

export function parityFixtureById(id: string): ParityFixture | undefined {
  return PARITY_FIXTURES.find((fixture) => fixture.id === id);
}

function treeNode(
  kind: string,
  fields: {
    label?: string;
    tone?: ParityTone;
    expanded?: boolean;
    children?: Array<ParityNode | null>;
  } = {},
): ParityNode {
  const node: ParityNode = { kind };
  if (fields.label) node.label = fields.label;
  if (fields.tone) node.tone = fields.tone;
  if (fields.expanded != null) node.expanded = fields.expanded;
  const children = fields.children?.filter((child): child is ParityNode => child != null);
  if (children && children.length > 0) node.children = children;
  return node;
}

function keyOpen(expand: ParityExpand | undefined, key: string): boolean {
  if (expand == null || expand === "none") return false;
  if (expand === "all") return true;
  if (expand === "process") return key.startsWith("process:");
  return expand[key] === true;
}

function splitLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized) return [];
  const trimmed = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return trimmed.split("\n");
}

function firstLine(text: string): string {
  for (const line of splitLines(text)) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function inlineNodes(line: string): ParityNode[] {
  const found: Array<{ index: number; node: ParityNode }> = [];
  for (const match of line.matchAll(/`([^`\n]+)`/g)) {
    if (match.index == null || !match[1]) continue;
    found.push({ index: match.index, node: treeNode("code", { label: match[1] }) });
  }
  for (const match of line.matchAll(/https?:\/\/[^\s<>)\]]+/g)) {
    if (match.index == null) continue;
    found.push({
      index: match.index,
      node: treeNode("link", { label: match[0].replace(/[.,;:]+$/g, "") }),
    });
  }
  for (const match of line.matchAll(/(?:^|[^\w./-])(src(?:\/[\w.-]+)+)/g)) {
    if (match.index == null || !match[1]) continue;
    const path = match[1].replace(/\.+$/g, "");
    found.push({
      index: match.index + match[0].indexOf(match[1]),
      node: treeNode("path", { label: path }),
    });
  }
  found.sort((left, right) => left.index - right.index);
  return found.map((item) => item.node);
}

function splitTableRow(line: string): string[] {
  return line
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
}

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.+)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

/** Heading, list, table, code, mermaid, path, and link. Not a markdown renderer. */
function outlineText(text: string): ParityNode[] {
  const lines = splitLines(text);
  const nodes: ParityNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    const fence = /^```([^\s`]*)/.exec(trimmed);
    if (fence && trimmed.startsWith("```")) {
      const lang = (fence[1] ?? "").toLowerCase();
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) index += 1;
      if (index < lines.length) index += 1;
      nodes.push(
        lang === "mermaid"
          ? treeNode("mermaid", { label: "mermaid" })
          : treeNode("code", { label: fence[1] || "code" }),
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading?.[2]) {
      nodes.push(treeNode("heading", { label: heading[2].trim() }));
      nodes.push(...inlineNodes(line));
      index += 1;
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const items: string[] = [];
      const source: string[] = [];
      while (index < lines.length && LIST_ITEM.test(lines[index] ?? "")) {
        const current = lines[index] ?? "";
        source.push(current);
        const item = LIST_ITEM.exec(current);
        if (item?.[1]) items.push(item[1].trim());
        index += 1;
      }
      nodes.push(treeNode("list", { label: items.join(", ") }));
      for (const itemLine of source) nodes.push(...inlineNodes(itemLine));
      continue;
    }
    if (line.includes("|") && TABLE_SEPARATOR.test(lines[index + 1] ?? "")) {
      const header = splitTableRow(line);
      index += 2;
      while (
        index < lines.length &&
        (lines[index] ?? "").includes("|") &&
        (lines[index] ?? "").trim()
      ) {
        index += 1;
      }
      nodes.push(treeNode("table", { label: header.join(", ") }));
      continue;
    }
    if (trimmed) {
      nodes.push(treeNode("paragraph", { label: trimmed }));
      nodes.push(...inlineNodes(line));
    }
    index += 1;
  }
  return nodes;
}

function linkNodes(text: string): ParityNode[] {
  const nodes: ParityNode[] = [];
  for (const line of splitLines(text))
    nodes.push(...inlineNodes(line).filter((node) => node.kind === "link"));
  return nodes;
}

function toolGroupCountLabel(kind: ToolOverviewKind, count: number): string {
  const one = count === 1;
  switch (kind) {
    case "write":
      return one ? `${count} write` : `${count} writes`;
    case "command":
      return one ? `ran ${count} command` : `ran ${count} commands`;
    case "skill":
      return one ? `${count} skill` : `${count} skills`;
    case "subagent":
      return one ? `${count} subagent` : `${count} subagents`;
    case "other":
      return one ? `${count} tool` : `${count} tools`;
    case "fetch":
      return one ? `${count} fetch` : `${count} fetches`;
    case "search":
      return one ? `${count} search` : `${count} searches`;
    case "read":
      return one ? `${count} read` : `${count} reads`;
  }
}

function toolGroupLabel(parts: AgentPart[]): string {
  const counts = countToolGroupOverview(toolCallPartsFromGroup(parts));
  if (counts.length === 0) {
    return parts.some((part) => part.type === "thinking") ? "Thinking" : "Working";
  }
  return sentenceCaseOverview(
    formatToolGroupOverview(counts, toolGroupCountLabel, TOOL_GROUP_JOIN),
    TOOL_GROUP_LOCALE,
  );
}

function statsLabel(additions: number, deletions: number): string | null {
  if (additions <= 0 && deletions <= 0) return null;
  if (deletions > 0 && additions > 0) return `-${deletions} / +${additions}`;
  if (deletions > 0) return `-${deletions}`;
  return `+${additions}`;
}

function countPatchStats(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }
  return { additions, deletions };
}

function groupDiffLabel(parts: AgentPart[]): string | null {
  let additions = 0;
  let deletions = 0;
  for (const part of toolCallPartsFromGroup(parts)) {
    const presentation = presentAgentTool(part).presentation;
    if (presentation.kind === "diff_stats") {
      additions += presentation.additions;
      deletions += presentation.deletions;
    } else if (presentation.kind === "patch") {
      const stats = countPatchStats(presentation.patch);
      additions += stats.additions;
      deletions += stats.deletions;
    }
  }
  return statsLabel(additions, deletions);
}

function thinkingLabel(
  part: Extract<AgentPart, { type: "thinking" }>,
  message: ParityMessage,
): string {
  const seconds = thinkingDurationSeconds(
    thinkingBlockDurationMs(part, message.parts, message.thinking_ms),
  );
  if (seconds == null) return "Thinking";
  return `Thought for ${formatWorkDuration(seconds * 1000)}`;
}

function processLabel(message: ParityMessage): string {
  if (message.worked_ms != null && message.worked_ms > 0) {
    return `Worked for ${formatWorkDuration(message.worked_ms)}`;
  }
  return "Process";
}

function toolLabel(part: AgentToolCallPart, presented: ParsedToolResult): string {
  const presentation = presented.presentation;
  if (part.params?.type === "execute") return part.params.command;
  if (part.params?.type === "web_search" || part.params?.type === "search")
    return part.params.query;
  if (part.params?.type === "image_gen") return part.params.path || part.params.prompt;
  if (part.params?.type === "plan_document") return part.params.name?.trim() || "Plan";
  if (part.kind === "subagent" && part.params?.type === "subagent") return part.params.description;
  if (presentation.kind === "diff_stats") {
    const stats = statsLabel(presentation.additions, presentation.deletions);
    return [presented.path, stats].filter(Boolean).join(" ");
  }
  if (presented.path) return presented.path;
  return preferredCollapsedToolTitle(part, part.title?.trim() || part.name);
}

function presentationChildren(presentation: ToolPresentation): ParityNode[] {
  if (presentation.kind === "text" && presentation.text.trim()) {
    return [treeNode("text", { label: presentation.text })];
  }
  if (presentation.kind === "web_search") {
    return presentation.links.map((link) => treeNode("link", { label: link.url }));
  }
  if (presentation.kind === "search") {
    return presentation.hits.map((hit) => treeNode("path", { label: hit.path }));
  }
  return [];
}

function chromeTone(part: AgentPart): ParityTone | undefined {
  if (part.type === "error") return "error";
  if (part.type === "session_hint") {
    if (part.tone === "warning") return "warning";
    if (part.tone === "error") return "error";
    return "default";
  }
  if (part.type === "session_lifecycle") return part.status === "failed" ? "error" : "default";
  if (part.type === "session_config_change" || part.type === "permission") return "default";
  return undefined;
}

function projectTool(
  part: AgentToolCallPart,
  message: ParityMessage,
  messages: readonly ParityMessage[],
  opts: ParityTreeOptions | undefined,
): ParityNode {
  const presented = presentAgentTool(part);
  const children: Array<ParityNode | null> =
    part.kind === "subagent"
      ? subagentChildParts([...messages], part.tool_call_id).map((child) =>
          projectPart(child, message, messages, opts, 0),
        )
      : presentationChildren(presented.presentation);
  return treeNode(presented.presentation.kind, {
    label: toolLabel(part, presented),
    expanded: children.some((child) => child != null)
      ? keyOpen(opts?.expand, `tool:${part.tool_call_id}`)
      : undefined,
    children,
  });
}

function projectPart(
  part: AgentPart,
  message: ParityMessage,
  messages: readonly ParityMessage[],
  opts: ParityTreeOptions | undefined,
  origIndex: number,
): ParityNode | null {
  if (isHiddenTranscriptChromePart(part)) return null;
  if (part.type === "text") {
    if (!part.text.trim()) return null;
    return treeNode("text", { label: firstLine(part.text), children: outlineText(part.text) });
  }
  if (part.type === "thinking") {
    if (!part.text.trim()) return null;
    return treeNode("thinking", {
      label: thinkingLabel(part, message),
      expanded: keyOpen(opts?.expand, `thinking:${message.id}:${origIndex}`),
      children: outlineText(part.text),
    });
  }
  if (part.type === "tool_call") return projectTool(part, message, messages, opts);
  if (part.type === "error") {
    if (!part.message.trim()) return null;
    return treeNode("error", { label: part.message, tone: "error" });
  }
  if (
    part.type !== "session_lifecycle" &&
    part.type !== "session_config_change" &&
    part.type !== "session_hint" &&
    part.type !== "permission"
  ) {
    return null;
  }
  const classified = classifyTranscriptPart(part);
  const detail = classified.detail;
  if (detail.kind === "permission" && !detail.shownInTranscript) return null;
  if (detail.kind === "session_lifecycle") {
    const label = detail.error ? `${detail.label}: ${detail.error}` : detail.label;
    return treeNode(part.type, { label, tone: chromeTone(part) });
  }
  if (detail.kind === "session_config_change" || detail.kind === "session_hint") {
    return treeNode(part.type, { label: detail.label, tone: chromeTone(part) });
  }
  if (detail.kind === "permission") {
    return treeNode("permission", {
      label: detail.description || detail.tool,
      tone: "default",
      children: [
        detail.status ? treeNode("status", { label: detail.status }) : null,
        ...detail.questions.map((question) => treeNode("question", { label: question.prompt })),
        ...detail.options.map((option) => treeNode("option", { label: option.name })),
      ],
    });
  }
  return null;
}

function segmentStart(segment: AssistantSegment): number {
  return segment.type === "part" ? segment.origIndex : (segment.origIndexes[0] ?? 0);
}

function segmentsWithWaits(parts: AgentPart[], segments: AssistantSegment[]): AssistantSegment[] {
  const covered = new Set<number>();
  for (const segment of segments) {
    if (segment.type === "part") covered.add(segment.origIndex);
    else for (const index of segment.origIndexes) covered.add(index);
  }
  const merged = [...segments];
  parts.forEach((part, origIndex) => {
    if (covered.has(origIndex)) return;
    if (part.type !== "tool_call" || !isSubagentWaitTool(part) || partParentToolCallId(part))
      return;
    merged.push({ type: "part", part, origIndex });
  });
  merged.sort((left, right) => segmentStart(left) - segmentStart(right));
  return merged;
}

function projectSegment(
  segment: AssistantSegment,
  message: ParityMessage,
  messages: readonly ParityMessage[],
  opts: ParityTreeOptions | undefined,
): ParityNode | null {
  if (segment.type === "part") {
    return projectPart(segment.part, message, messages, opts, segment.origIndex);
  }
  const toolParts = toolCallPartsFromGroup(segment.parts);
  const groupKey = toolParts[0]?.tool_call_id ?? segment.origIndexes.join("-");
  const diff = groupDiffLabel(segment.parts);
  return treeNode("tool_group", {
    label: toolGroupLabel(segment.parts),
    expanded: keyOpen(opts?.expand, `group:${message.id}:${groupKey}`),
    children: [
      diff ? treeNode("diff_stats", { label: diff }) : null,
      ...segment.parts.map((part, index) =>
        projectPart(part, message, messages, opts, segment.origIndexes[index] ?? index),
      ),
    ],
  });
}

function projectAssistant(
  message: ParityMessage,
  messages: readonly ParityMessage[],
  opts: ParityTreeOptions | undefined,
): ParityNode[] {
  const segments = segmentsWithWaits(
    message.parts,
    segmentAssistantParts(message.parts, "compact"),
  );
  const { processSegments, tailSegments } = splitSegmentedAssistantParts(segments);
  const project = (list: AssistantSegment[]) =>
    list
      .map((segment) => projectSegment(segment, message, messages, opts))
      .filter((node): node is ParityNode => node != null);
  const canCollapse = hasCollapsibleAssistantProcess(message) && processSegments.length > 0;
  if (!canCollapse) return project([...processSegments, ...tailSegments]);
  return [
    treeNode("process", {
      label: processLabel(message),
      expanded: keyOpen(opts?.expand, `process:${message.id}`),
      children: project(processSegments),
    }),
    ...project(tailSegments),
  ];
}

function userText(message: ParityMessage): string {
  return message.parts
    .flatMap((part) => (part.type === "text" && part.text.trim() ? [part.text] : []))
    .join("\n");
}

function projectUser(
  message: ParityMessage,
  opts: ParityTreeOptions | undefined,
): ParityNode | null {
  const text = userText(message);
  const lines = splitLines(text);
  const attachments = message.parts.flatMap((part) =>
    part.type === "attachment"
      ? [treeNode("attachment", { label: part.name?.trim() || part.path })]
      : [],
  );
  const label = firstLine(text) || attachments[0]?.label || "";
  if (!label && attachments.length === 0 && !message.pending) return null;
  const collapsible = lines.length > USER_MESSAGE_COLLAPSE_LINES;
  return treeNode("user", {
    label,
    expanded: collapsible ? keyOpen(opts?.expand, `user-body:${message.id}`) : undefined,
    children: [
      lines.length > PASTE_LINE_THRESHOLD
        ? treeNode("paste", { label: `Pasted: ${lines.length} lines` })
        : null,
      ...linkNodes(text),
      ...attachments,
      message.pending ? treeNode("pending", { label: "Pending" }) : null,
      treeNode("user-meta", {
        label: "Meta",
        expanded: keyOpen(opts?.expand, `user-meta:${message.id}`),
      }),
    ],
  });
}

function permissionCardLabel(card: NonNullable<ParityCards["permission"]>): string {
  if (card.questions && card.questions.length > 0) return "Questions for you";
  return "Permission needed";
}

function projectCards(cards: ParityCards | undefined): ParityNode[] {
  if (!cards) return [];
  const nodes: ParityNode[] = [];
  if (cards.plan) {
    nodes.push(
      treeNode("plan", {
        label: "Plan",
        children: cards.plan.body ? [treeNode("text", { label: cards.plan.body })] : [],
      }),
    );
  }
  if (cards.queue) {
    nodes.push(
      treeNode("queue", {
        label: "Message Queue",
        children: cards.queue.map((item) => treeNode("item", { label: item.prompt })),
      }),
    );
  }
  if (cards.background) {
    nodes.push(
      treeNode("background", {
        label: "Background",
        children: cards.background.map((item) => treeNode("item", { label: item.command })),
      }),
    );
  }
  if (cards.subagents) {
    nodes.push(
      treeNode("subagents", {
        label: "Subagent Tasks",
        children: cards.subagents.map((item) => treeNode("item", { label: item.title })),
      }),
    );
  }
  if (cards.goal) {
    nodes.push(
      treeNode("goal", {
        label: "Goal",
        children: cards.goal.text ? [treeNode("text", { label: cards.goal.text })] : [],
      }),
    );
  }
  if (cards.workflow) {
    nodes.push(
      treeNode("workflow", {
        label: "Research",
        children: cards.workflow.text ? [treeNode("text", { label: cards.workflow.text })] : [],
      }),
    );
  }
  if (cards.context) {
    const windowLabel =
      cards.context.window != null
        ? `${cards.context.used} / ${cards.context.window}`
        : String(cards.context.used);
    nodes.push(
      treeNode("context", {
        label: "Context Usage",
        children: [treeNode("text", { label: windowLabel })],
      }),
    );
  }
  if (cards.permission) {
    const permission = cards.permission;
    nodes.push(
      treeNode("permission", {
        label: permissionCardLabel(permission),
        tone: "default",
        children: [
          permission.description ? treeNode("text", { label: permission.description }) : null,
          permission.status ? treeNode("status", { label: permission.status }) : null,
          ...(permission.questions ?? []).map((question) =>
            treeNode("question", { label: question.prompt }),
          ),
          ...(permission.options ?? []).map((option) => treeNode("option", { label: option.name })),
        ],
      }),
    );
  }
  return nodes;
}

/**
 * Ordered structural tree for one chat.
 * Density is compact. A settled process starts collapsed (`expanded: false`)
 * unless `opts.expand` opens `process:<messageId>`.
 */
export function projectParityTree(
  messages: readonly ParityMessage[],
  opts?: ParityTreeOptions,
): ParityNode[] {
  const nodes: ParityNode[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      const user = projectUser(message, opts);
      if (user) nodes.push(user);
      continue;
    }
    nodes.push(...projectAssistant(message, messages, opts));
  }
  nodes.push(...projectCards(opts?.cards));
  return nodes;
}
