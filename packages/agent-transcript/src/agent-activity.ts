import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  isActiveToolStatus,
  isNestedSubagentChild,
  isSubagentWaitTool,
  type AgentToolCallPart,
} from "./tool-kind";

export type AgentActivityLabel =
  | { type: "generating" }
  | { type: "thinking" }
  | { type: "streaming" }
  | { type: "creatingSession" }
  | { type: "resumingSession" }
  | { type: "waiting"; count: number }
  | { type: "tool"; part: AgentToolCallPart };

export type AgentActivityState =
  | { busy: false }
  | {
      busy: true;
      kind: "thinking" | "working";
      trail: "ellipsis" | "none";
      label: AgentActivityLabel;
    };

function isLiveBackgroundToolCall(part: AgentToolCallPart): boolean {
  return (
    part.kind === "execute" &&
    part.params?.type === "execute" &&
    part.params.background === true &&
    isActiveToolStatus(part.status)
  );
}

/** Nested wait/poll tools are parent-process chrome, not child work. */
function isNestedChildWork(part: AgentPart): boolean {
  if (!isNestedSubagentChild(part)) return false;
  return part.type !== "tool_call" || !isSubagentWaitTool(part);
}

function runningWaitToolCount(message: AgentMessage): number {
  let count = 0;
  for (const part of message.parts) {
    if (part.type !== "tool_call") continue;
    if (isNestedChildWork(part)) continue;
    if (!isSubagentWaitTool(part)) continue;
    if (isActiveToolStatus(part.status)) count += 1;
  }
  return count;
}

function isParentProcessTool(part: Extract<AgentPart, { type: "tool_call" }>): boolean {
  if (isSubagentWaitTool(part)) return false;
  if (part.kind === "subagent") return false;
  return true;
}

function working(
  label: AgentActivityLabel,
  trail: "ellipsis" | "none" = "ellipsis",
): AgentActivityState {
  return { busy: true, kind: "working", trail, label };
}

function activityForToolPart(part: AgentToolCallPart, message: AgentMessage): AgentActivityState {
  if (isSubagentWaitTool(part) && isActiveToolStatus(part.status)) {
    return working({ type: "waiting", count: Math.max(1, runningWaitToolCount(message)) }, "none");
  }
  return working({ type: "tool", part }, "none");
}

/**
 * What the transcript activity footer is doing. Callers turn `label` into
 * copy. Tool lines keep `trail: "none"` so the footer does not add "...".
 */
export function deriveAgentActivityState(
  messages: AgentMessage[],
  turnOpen: boolean,
): AgentActivityState {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") {
    return turnOpen ? working({ type: "generating" }) : { busy: false };
  }

  const session = last.parts.find(
    (part) => part.type === "session_lifecycle" && isActiveToolStatus(part.status),
  );
  if (session?.type === "session_lifecycle") {
    return working({
      type: session.action === "resume" ? "resumingSession" : "creatingSession",
    });
  }

  for (let index = last.parts.length - 1; index >= 0; index -= 1) {
    const part = last.parts[index];
    if (!part || isNestedChildWork(part)) continue;
    if (
      part.type === "tool_call" &&
      isActiveToolStatus(part.status) &&
      !isLiveBackgroundToolCall(part) &&
      isParentProcessTool(part)
    ) {
      return activityForToolPart(part, last);
    }
  }

  for (let index = last.parts.length - 1; index >= 0; index -= 1) {
    const part = last.parts[index];
    if (!part || isNestedChildWork(part)) continue;
    if (part.type === "tool_call" && isActiveToolStatus(part.status) && isSubagentWaitTool(part)) {
      return activityForToolPart(part, last);
    }
  }

  for (let index = last.parts.length - 1; index >= 0; index -= 1) {
    const part = last.parts[index];
    if (!part || isNestedChildWork(part)) continue;
    if (
      part.type === "tool_call" &&
      isActiveToolStatus(part.status) &&
      !isLiveBackgroundToolCall(part)
    ) {
      return activityForToolPart(part, last);
    }
  }

  if (last.streaming) {
    for (let index = last.parts.length - 1; index >= 0; index -= 1) {
      const part = last.parts[index];
      if (!part || isNestedChildWork(part)) continue;
      if (part.type === "tool_call") {
        if (isLiveBackgroundToolCall(part)) continue;
        if (isSubagentWaitTool(part) && !isActiveToolStatus(part.status)) continue;
        return activityForToolPart(part, last);
      }
      if (part.type === "thinking") {
        return { busy: true, kind: "thinking", trail: "ellipsis", label: { type: "thinking" } };
      }
      if (part.type === "text") return working({ type: "streaming" });
    }
    return working({ type: "generating" });
  }

  if (turnOpen) return working({ type: "generating" });
  return { busy: false };
}
