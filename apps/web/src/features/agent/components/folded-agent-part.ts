import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";

export { foldedPartIsOpen, foldedPartIsStreamingDisplayTail } from "@atmos/agent-transcript";

/** Fold projection stamps these onto text/thinking parts. */
export type FoldedAgentPart = AgentPart & {
  part_id?: string;
  ordinal?: number;
  closed_at?: string | null;
};

export function foldedAgentPart(part: AgentPart): FoldedAgentPart {
  return part as FoldedAgentPart;
}

export function foldedPartKey(part: AgentPart, origIndex: number): string {
  const partId = foldedAgentPart(part).part_id?.trim();
  if (partId) return partId;
  if (part.type === "tool_call") {
    const toolId = part.tool_call_id?.trim();
    if (toolId) return toolId;
  }
  return `${part.type}-${origIndex}`;
}
