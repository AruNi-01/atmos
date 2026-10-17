import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "./tool-kind";

export const GROK_CHROME_SUBAGENT_NAME = "grok_chrome";

export function isGrokChromeSubagent(part: Pick<AgentToolCallPart, "kind" | "name">): boolean {
  return part.kind === "subagent" && part.name === GROK_CHROME_SUBAGENT_NAME;
}

function subagentDescriptionOf(part: Pick<AgentToolCallPart, "params">): string {
  return part.params?.type === "subagent" ? part.params.description.trim() : "";
}

function subagentTaskIdOf(part: Pick<AgentToolCallPart, "params">): string {
  return part.params?.type === "subagent" ? part.params.task_id?.trim() || "" : "";
}

/** True when a synthesized `grok_chrome` row is a second card for a user `spawn_subagent`. */
export function grokChromeDuplicatesUserSpawn(
  part: Pick<AgentToolCallPart, "kind" | "name" | "tool_call_id" | "params">,
  parts: AgentPart[],
): boolean {
  if (!isGrokChromeSubagent(part)) return false;
  const desc = subagentDescriptionOf(part);
  const taskId = subagentTaskIdOf(part);
  return parts.some((other) => {
    if (other.type !== "tool_call") return false;
    if (other.kind !== "subagent") return false;
    if (other.tool_call_id === part.tool_call_id) return false;
    if (isGrokChromeSubagent(other)) return false;
    const otherTask = subagentTaskIdOf(other);
    if (taskId && (other.tool_call_id === taskId || otherTask === taskId)) return true;
    const otherDesc = subagentDescriptionOf(other);
    return Boolean(desc && otherDesc && desc === otherDesc);
  });
}

/**
 * Nested chrome work stays off the parent process fold.
 * Synthesized `grok_chrome` rows that duplicate a user spawn are also hidden;
 * orphan goal/workflow chrome spawn rows stay visible.
 */
export function isHiddenGrokChromePart(part: AgentPart, parts: AgentPart[]): boolean {
  const chromeIds = new Set(
    parts
      .filter(
        (item): item is AgentToolCallPart =>
          item.type === "tool_call" && isGrokChromeSubagent(item),
      )
      .map((item) => item.tool_call_id),
  );
  if (chromeIds.size === 0) return false;
  if (part.type === "tool_call" && chromeIds.has(part.tool_call_id)) {
    return grokChromeDuplicatesUserSpawn(part, parts);
  }
  let parent = "parent_tool_call_id" in part ? part.parent_tool_call_id : undefined;
  const tools = parts.filter((item): item is AgentToolCallPart => item.type === "tool_call");
  while (parent) {
    if (chromeIds.has(parent)) return true;
    const next = tools.find((tool) => tool.tool_call_id === parent);
    parent = next?.parent_tool_call_id;
  }
  return false;
}
