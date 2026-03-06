import type { AtmosSubAgentMessage, SubAgentAdapter } from "../types";
import {
  capitalizeWord,
  convertContentBlocks,
  escapeUnknownXmlLikeTags,
  looksLikeSubAgent,
  rawInputObject,
  sanitizeSubAgentMarkdown,
  toStatus,
} from "../utils";

function fallbackResult(rawOutput: unknown): string | null {
  if (typeof rawOutput === "string") {
    return escapeUnknownXmlLikeTags(sanitizeSubAgentMarkdown(rawOutput));
  }
  if (rawOutput && typeof rawOutput === "object") {
    const output = rawOutput as Record<string, unknown>;
    if (typeof output.output === "string") {
      return escapeUnknownXmlLikeTags(sanitizeSubAgentMarkdown(output.output));
    }
  }
  return null;
}

export const fallbackSubAgentAdapter: SubAgentAdapter = {
  canHandle(block) {
    return looksLikeSubAgent(block);
  },
  normalize(block, vendor, _childToolCalls): AtmosSubAgentMessage | null {
    if (!looksLikeSubAgent(block)) return null;
    const input = rawInputObject(block);
    const description = String(input.description ?? block.description ?? "");
    const prompt = typeof input.prompt === "string" ? input.prompt : null;
    const kind = typeof input.subagent_type === "string" ? input.subagent_type : "agent";
    return {
      id: block.tool_call_id,
      vendor,
      title: `${capitalizeWord(kind)} Agent`,
      description,
      prompt,
      status: toStatus(block.status),
      contentBlocks: convertContentBlocks(block.content),
      resultMarkdown: fallbackResult(block.raw_output),
      labels: [],
      childToolCalls: [],
    };
  },
};
