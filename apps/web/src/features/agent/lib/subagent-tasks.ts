import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  isActiveToolStatus,
  type AgentToolCallPart,
} from "@/features/agent/lib/agent-tool-kind";
import { deriveAgentActivity, type AgentActivity } from "@/features/agent/lib/chat-helpers";
import { isNestedSubagentChild } from "@/features/agent/lib/tool-group";

export type SubagentTaskStatus = "running" | "completed" | "failed";

export type CurrentTurnSubagentTasks = {
  items: AgentToolCallPart[];
  tools: AgentToolCallPart[];
};

const EMPTY_TASKS: CurrentTurnSubagentTasks = { items: [], tools: [] };

function lastUserIndex(messages: AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
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

export function subagentResultText(part: AgentToolCallPart): string | null {
  if (part.result?.type === "text" && part.result.text.trim()) return part.result.text;
  if (part.result?.type === "error" && part.result.message.trim()) return part.result.message;
  return null;
}

export function subagentTaskStatus(part: AgentToolCallPart): SubagentTaskStatus {
  const status = (part.status ?? "").trim().toLowerCase();
  if (status === "failed" || status === "error") return "failed";
  if (isActiveToolStatus(status)) return "running";
  return "completed";
}

export function currentTurnSubagentTasks(
  messages: AgentMessage[],
  options?: { followUpPending?: boolean },
): CurrentTurnSubagentTasks {
  const start = lastUserIndex(messages) + 1;
  const tools: AgentToolCallPart[] = [];
  const seen = new Set<string>();

  for (let index = start; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== "tool_call") continue;
      if (seen.has(part.tool_call_id)) continue;
      seen.add(part.tool_call_id);
      tools.push(part);
    }
  }

  if (tools.length === 0) return EMPTY_TASKS;

  const items = tools.filter(
    (part) => part.kind === "subagent" && !isNestedSubagentChild(part, tools),
  );
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

export function messagesForSubagent(
  messages: AgentMessage[],
  toolCallId: string,
): AgentMessage[] | null {
  const parent = findSubagentToolCall(messages, toolCallId);
  if (!parent) return null;

  const descendants = new Set(
    descendantToolCalls(collectToolCalls(messages), toolCallId).map((tool) => tool.tool_call_id),
  );
  const prompt =
    subagentPrompt(parent) || subagentDescription(parent) || subagentTaskSummary(parent);
  const result = subagentResultText(parent);
  const running = subagentTaskStatus(parent) === "running";
  const parts: AgentPart[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type === "tool_call") {
        if (part.tool_call_id === toolCallId) continue;
        if (!descendants.has(part.tool_call_id)) continue;
        parts.push(stripSelectedParent(part, toolCallId));
        continue;
      }
      if ((part.type === "text" || part.type === "thinking") && part.parent_tool_call_id === toolCallId) {
        parts.push(stripSelectedParent(part, toolCallId));
      }
    }
  }

  if (result) parts.push({ type: "text", text: result });

  return [
    {
      id: `subagent:${toolCallId}:user`,
      role: "user",
      parts: [{ type: "text", text: prompt }],
    },
    {
      id: `subagent:${toolCallId}:assistant`,
      role: "assistant",
      parts,
      streaming: running,
      completed_at: running ? undefined : "completed",
    },
  ];
}

export function subagentChildActivity(
  messages: AgentMessage[],
  toolCallId: string,
): AgentActivity {
  const projected = messagesForSubagent(messages, toolCallId);
  const parent = findSubagentToolCall(messages, toolCallId);
  const running = parent ? subagentTaskStatus(parent) === "running" : false;
  if (!projected) return { busy: false };
  return deriveAgentActivity(projected, running);
}
