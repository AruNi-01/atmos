import type { AtmosSubAgentMessage, SubAgentAdapter } from "../types";
import { looksLikeCursorTaskSubAgent, rawInputObject, subAgentT, toStatus } from "../utils";

function normalizeCursorTitle(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return subAgentT("subagent.subagentTask");
  return trimmed;
}

export const cursorSubAgentAdapter: SubAgentAdapter = {
  canHandle(block, vendor) {
    return (vendor === "cursor" || vendor === "unknown") && looksLikeCursorTaskSubAgent(block);
  },
  normalize(block, vendor): AtmosSubAgentMessage | null {
    if (!looksLikeCursorTaskSubAgent(block)) return null;
    const input = rawInputObject(block);
    const description = typeof input.title === "string" && input.title.trim()
      ? input.title
      : block.description;

    return {
      id: block.tool_call_id,
      vendor,
      title: normalizeCursorTitle(description),
      description: subAgentT("subagent.cursorSubagentTask"),
      prompt: null,
      status: toStatus(block.status),
      detailMode: "status_only",
      contentBlocks: [],
      resultMarkdown: null,
      labels: [],
      childToolCalls: [],
    };
  },
};
