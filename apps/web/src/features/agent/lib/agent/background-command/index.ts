import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { isActiveToolStatus } from "@/features/agent/lib/agent-tool-kind";

function executeParams(part: AgentToolCallPart) {
  return part.params?.type === "execute" ? part.params : null;
}

export function isBackgroundToolCall(part: AgentToolCallPart): boolean {
  return part.kind === "execute" && executeParams(part)?.background === true;
}

export function isLiveBackgroundToolCall(part: AgentToolCallPart): boolean {
  return isBackgroundToolCall(part) && isActiveToolStatus(part.status);
}

export function displayBackgroundCommand(part: AgentToolCallPart): string {
  return executeParams(part)?.command?.trim() || "";
}
