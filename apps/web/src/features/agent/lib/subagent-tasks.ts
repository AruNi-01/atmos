import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import {
  isActiveToolStatus,
  type AgentToolCallPart,
} from "@/features/agent/lib/agent-tool-kind";
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
  return summary ? `# ${type}: ${summary}` : `# ${type}`;
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
  return { items, tools };
}
