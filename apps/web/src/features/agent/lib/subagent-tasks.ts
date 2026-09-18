import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { isGrokChromeRosterSubagent, isGrokChromeSubagent } from "@/features/agent/lib/grok-chrome";
import {
  isActiveToolStatus,
  isSubagentWaitTool,
  type AgentToolCallPart,
} from "@/features/agent/lib/agent-tool-kind";
import { deriveAgentActivity, type AgentActivity } from "@/features/agent/lib/chat-helpers";
import { promptToCompleteMs } from "@/features/agent/lib/agent-chat-timing";
import { isNestedSubagentChild } from "@/features/agent/lib/tool-group";

export type SubagentTaskStatus = "running" | "completed" | "failed";

export type CurrentTurnSubagentTasks = {
  items: AgentToolCallPart[];
  tools: AgentToolCallPart[];
};

const EMPTY_TASKS: CurrentTurnSubagentTasks = { items: [], tools: [] };

function lastUserIndex(messages: AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    if (isClaudeTaskNotificationText(userMessageText(message))) continue;
    return index;
  }
  return -1;
}

function userMessageText(message: AgentMessage): string {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
}

/** Claude injects this as a real user turn when a Task finishes; it is not a new prompt. */
export function isClaudeTaskNotificationText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("<task-notification>") || trimmed.includes("<task-notification>");
}

export function subagentDescription(part: AgentToolCallPart): string {
  return part.params?.type === "subagent" ? part.params.description.trim() : "";
}

export function subagentPrompt(part: AgentToolCallPart): string {
  if (part.params?.type !== "subagent") return "";
  return part.params.prompt?.trim() || "";
}

export function subagentAgentType(part: AgentToolCallPart): string | null {
  if (part.params?.type !== "subagent") return null;
  return part.params.agent_type?.trim() || null;
}

export function titleCaseSubagentType(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function displaySubagentType(
  part: AgentToolCallPart,
  fallbackType = "Subagent",
): string {
  const raw = subagentAgentType(part);
  if (!raw) return fallbackType;
  return titleCaseSubagentType(raw);
}

export function subagentTaskSummary(part: AgentToolCallPart): string {
  return subagentDescription(part) || part.title?.trim() || part.name.trim();
}

export function formatSubagentTaskLine(
  part: AgentToolCallPart,
  fallbackType = "Subagent",
): string {
  const type = displaySubagentType(part, fallbackType);
  const summary = subagentTaskSummary(part);
  return summary ? `${type} - ${summary}` : type;
}

/** Claude/Grok dispatch chrome — not the child's answer. */
export function isSubagentDispatchAckText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith("Async agent launched successfully.")
    || trimmed.includes("This tool result is internal metadata")
    || trimmed.includes("The agent is working in the background.")
    || trimmed.startsWith("Subagent started in background.")
    || trimmed.includes("moved to the background to keep the conversation responsive")
    || trimmed.startsWith("The task is working in the background.")
  );
}

export function subagentResultText(part: AgentToolCallPart): string | null {
  if (part.result?.type === "text" && part.result.text.trim()) {
    return isSubagentDispatchAckText(part.result.text) ? null : part.result.text;
  }
  if (part.result?.type === "error" && part.result.message.trim()) {
    return isSubagentDispatchAckText(part.result.message) ? null : part.result.message;
  }
  return null;
}

export function subagentTaskStatus(part: AgentToolCallPart): SubagentTaskStatus {
  const status = (part.status ?? "").trim().toLowerCase();
  if (status === "failed" || status === "error") return "failed";
  if (isActiveToolStatus(status)) return "running";
  return "completed";
}

export type SubagentCardMode = "live" | "transcript";

function topLevelSubagentItems(
  tools: AgentToolCallPart[],
  allTools: AgentToolCallPart[],
  excludeIds?: Iterable<string>,
): AgentToolCallPart[] {
  return tools.filter(
    (part) =>
      part.kind === "subagent"
      && !isNestedSubagentChild(part, allTools)
      && !isGrokChromeRosterSubagent(part, excludeIds),
  );
}

/** Cards that sit under an assistant message. Live current-turn rows stay in the overlay. */
export function inlineSubagentTasksByMessageId(
  messages: AgentMessage[],
  options?: { mode?: SubagentCardMode; excludeIds?: Iterable<string> },
): Map<string, AgentToolCallPart[]> {
  const mode = options?.mode ?? "live";
  const lastUser = lastUserIndex(messages);
  const allTools = collectToolCalls(messages);
  const out = new Map<string, AgentToolCallPart[]>();

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    if (mode === "live" && index > lastUser) continue;

    const turnTools: AgentToolCallPart[] = [];
    const seen = new Set<string>();
    for (const part of message.parts) {
      if (part.type !== "tool_call") continue;
      if (seen.has(part.tool_call_id)) continue;
      seen.add(part.tool_call_id);
      turnTools.push(part);
    }
    const items = topLevelSubagentItems(turnTools, allTools, options?.excludeIds);
    if (items.length === 0) continue;
    out.set(message.id, items);
  }
  return out;
}

export function currentTurnSubagentTasks(
  messages: AgentMessage[],
  options?: { followUpPending?: boolean; excludeIds?: Iterable<string> },
): CurrentTurnSubagentTasks {
  const start = lastUserIndex(messages) + 1;
  const tools: AgentToolCallPart[] = [];
  const seen = new Set<string>();
  const excludeIds = options?.excludeIds;

  for (let index = start; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== "tool_call") continue;
      if (seen.has(part.tool_call_id)) continue;
      seen.add(part.tool_call_id);
      if (isGrokChromeRosterSubagent(part, excludeIds)) continue;
      tools.push(part);
    }
  }

  if (tools.length === 0) return EMPTY_TASKS;

  const items = topLevelSubagentItems(tools, tools, excludeIds);
  if (items.length === 0) return EMPTY_TASKS;
  // A queued/next-round prompt dismisses finished rows. Running ones stay until they settle.
  const visible = options?.followUpPending
    ? items.filter((part) => subagentTaskStatus(part) === "running")
    : items;
  if (visible.length === 0) return EMPTY_TASKS;
  return { items: visible, tools };
}

export function collectToolCalls(messages: AgentMessage[]): AgentToolCallPart[] {
  const tools: AgentToolCallPart[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== "tool_call") continue;
      if (seen.has(part.tool_call_id)) continue;
      seen.add(part.tool_call_id);
      tools.push(part);
    }
  }
  return tools;
}

export function findSubagentToolCall(
  messages: AgentMessage[],
  toolCallId: string,
): AgentToolCallPart | null {
  for (const part of collectToolCalls(messages)) {
    if (part.tool_call_id === toolCallId && part.kind === "subagent") return part;
  }
  return null;
}

export function descendantToolCalls(
  tools: AgentToolCallPart[],
  ancestorId: string,
): AgentToolCallPart[] {
  const ids = new Set<string>([ancestorId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const tool of tools) {
      if (ids.has(tool.tool_call_id)) continue;
      // Parent wait/poll chrome is not child work, even when parented to the spawn.
      if (isSubagentWaitTool(tool)) continue;
      if (tool.parent_tool_call_id && ids.has(tool.parent_tool_call_id)) {
        ids.add(tool.tool_call_id);
        grew = true;
      }
    }
  }
  return tools.filter((tool) => tool.tool_call_id !== ancestorId && ids.has(tool.tool_call_id));
}

function stripSelectedParent(part: AgentPart, selectedId: string): AgentPart {
  if (!("parent_tool_call_id" in part) || part.parent_tool_call_id !== selectedId) {
    return part;
  }
  const next = { ...part };
  delete next.parent_tool_call_id;
  return next;
}

function usableTimestamp(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2000) return undefined;
  return value;
}

function hostAssistantForTool(
  messages: AgentMessage[],
  toolCallId: string,
): AgentMessage | undefined {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    if (message.parts.some((part) => part.type === "tool_call" && part.tool_call_id === toolCallId)) {
      return message;
    }
  }
  return undefined;
}

function precedingUserCreatedAt(
  messages: AgentMessage[],
  host: AgentMessage | undefined,
): string | undefined {
  if (!host) return undefined;
  const index = messages.indexOf(host);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const created = usableTimestamp(messages[cursor]?.created_at);
    if (messages[cursor]?.role === "user" && created) return created;
  }
  return undefined;
}

function nestedThinkingMs(parts: AgentPart[]): number {
  let total = 0;
  for (const part of parts) {
    if (part.type !== "thinking") continue;
    if (part.duration_ms != null && part.duration_ms > 0) total += part.duration_ms;
  }
  return total;
}

export function messagesForSubagent(
  messages: AgentMessage[],
  toolCallId: string,
): AgentMessage[] | null {
  const parent = findSubagentToolCall(messages, toolCallId);
  if (!parent) return null;

  const descendants = new Set(
    descendantToolCalls(collectToolCalls(messages), toolCallId).map((tool) => tool.tool_call_id),
  );
  const prompt = isGrokChromeSubagent(parent)
    ? subagentPrompt(parent)
    : (subagentPrompt(parent) || subagentDescription(parent) || subagentTaskSummary(parent));
  const result = subagentResultText(parent);
  const running = subagentTaskStatus(parent) === "running";
  const parts: AgentPart[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type === "tool_call") {
        if (part.tool_call_id === toolCallId) continue;
        if (isSubagentWaitTool(part)) continue;
        if (!descendants.has(part.tool_call_id)) continue;
        parts.push(stripSelectedParent(part, toolCallId));
        continue;
      }
      if ((part.type === "text" || part.type === "thinking") && part.parent_tool_call_id === toolCallId) {
        if (part.type === "text" && isSubagentDispatchAckText(part.text)) continue;
        parts.push(stripSelectedParent(part, toolCallId));
      }
    }
  }

  if (result) {
    const already = parts.some(
      (part) => part.type === "text" && part.text.trim() === result.trim(),
    );
    if (!already) parts.push({ type: "text", text: result });
  }

  const host = hostAssistantForTool(messages, toolCallId);
  const userAt = precedingUserCreatedAt(messages, host);
  const createdAt = usableTimestamp(host?.created_at) ?? userAt;
  const thinkingMs = nestedThinkingMs(parts);
  const completedAt = running
    ? undefined
    : (usableTimestamp(host?.completed_at) ?? createdAt ?? "completed");
  const spanMs = running ? undefined : promptToCompleteMs(userAt ?? createdAt, completedAt);
  const hostWorked = host?.worked_ms != null && host.worked_ms > 0 ? host.worked_ms : undefined;
  const workedMs = running
    ? undefined
    : (spanMs ?? (thinkingMs > 0 ? thinkingMs : hostWorked));

  const projected: AgentMessage[] = [];
  if (prompt.trim()) {
    projected.push({
      id: `subagent:${toolCallId}:user`,
      role: "user",
      parts: [{ type: "text", text: prompt }],
      created_at: userAt ?? createdAt,
    });
  }
  projected.push({
    id: `subagent:${toolCallId}:assistant`,
    role: "assistant",
    parts,
    streaming: running,
    created_at: createdAt,
    thinking_ms: thinkingMs > 0 ? thinkingMs : undefined,
    worked_ms: workedMs,
    completed_at: completedAt,
  });
  return projected;
}

export function subagentElapsedMs(
  projected: AgentMessage[] | null | undefined,
  now = Date.now(),
): number {
  if (!projected?.length) return 0;
  const user = projected.find((message) => message.role === "user");
  const assistant = projected.find((message) => message.role === "assistant");
  if (assistant?.streaming) {
    const start = Date.parse(user?.created_at ?? assistant.created_at ?? "");
    if (!Number.isNaN(start) && start > 0) return Math.max(0, now - start);
    return 0;
  }
  if (assistant?.worked_ms != null && assistant.worked_ms > 0) return assistant.worked_ms;
  return promptToCompleteMs(user?.created_at, assistant?.completed_at) ?? 0;
}

export function subagentChildActivity(
  messages: AgentMessage[],
  toolCallId: string,
): AgentActivity {
  const parent = findSubagentToolCall(messages, toolCallId);
  const running = parent ? subagentTaskStatus(parent) === "running" : false;
  if (!running) return { busy: false };
  const projected = messagesForSubagent(messages, toolCallId);
  if (!projected) return { busy: false };
  return deriveAgentActivity(projected, true);
}
