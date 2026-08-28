"use client";

import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { classifyTool } from "@/features/agent/lib/agent-tool-kind";
import { normalizeSubAgent } from "@/features/agent/lib/agent/subagent";
import type { SubAgentToolCallBlock } from "@/features/agent/lib/agent/subagent";
import { SubAgentBlockView } from "./SubAgentBlockView";
import { TerminalBlock } from "./TerminalBlock";
import { AgentToolResultBlock } from "./tool-results";

function asSubAgentBlock(part: AgentToolCallPart): SubAgentToolCallBlock {
  return {
    tool_call_id: part.tool_call_id,
    tool: part.name,
    description: part.title || part.name,
    status: part.status || "",
    raw_input: part.input,
    raw_output: part.output,
    content: Array.isArray(part.content) ? part.content as SubAgentToolCallBlock["content"] : undefined,
    detail: part.content,
  };
}

export function childToolToPart(child: SubAgentToolCallBlock): AgentToolCallPart {
  const classified = classifyTool(child.tool, child.description, child.raw_input);
  return {
    type: "tool_call",
    tool_call_id: child.tool_call_id,
    name: child.tool,
    title: child.description,
    kind: classified.type === "tool" ? classified.kind : "other",
    status: child.status,
    input: child.raw_input,
    output: child.raw_output,
    content: child.content ?? child.detail,
  };
}

export function ToolView({
  part,
  registryId,
}: {
  part: AgentToolCallPart;
  registryId?: string;
}) {
  if (part.kind === "subagent" && registryId) {
    const subAgent = normalizeSubAgent(asSubAgentBlock(part), registryId);
    if (subAgent) return <SubAgentBlockView message={subAgent} />;
  }
  if (part.kind === "execute") {
    return <TerminalBlock part={part} />;
  }
  return <AgentToolResultBlock part={part} />;
}
