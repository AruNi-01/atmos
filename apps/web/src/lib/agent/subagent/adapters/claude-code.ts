import type {
  AtmosSubAgentContentBlock,
  AtmosSubAgentLabel,
  AtmosSubAgentMessage,
  SubAgentAdapter,
  SubAgentToolCallBlock,
} from "../types";
import {
  capitalizeWord,
  escapeUnknownXmlLikeTags,
  looksLikeSubAgent,
  rawInputObject,
  sanitizeSubAgentMarkdown,
  toStatus,
  uniqueLabels,
} from "../utils";

const CLAUDE_METADATA_KEYS = new Set([
  "agentId",
  "total_tokens",
  "tool_uses",
  "duration_ms",
]);

function parseClaudeContent(block: SubAgentToolCallBlock): {
  labels: AtmosSubAgentLabel[];
  contentBlocks: AtmosSubAgentContentBlock[];
} {
  const labels: AtmosSubAgentLabel[] = [];
  const contentBlocks: AtmosSubAgentContentBlock[] = [];

  for (const item of block.content ?? []) {
    if (item.type === "diff") {
      contentBlocks.push({
        type: "diff",
        path: item.path,
        oldContent: item.old_content,
        newContent: item.new_content,
      });
      continue;
    }

    if (item.type === "terminal") {
      contentBlocks.push({
        type: "terminal",
        terminalId: item.terminal_id,
      });
      continue;
    }

    const sanitized = item.text.replace(/<\/?usage>/gi, "");
    const bodyLines: string[] = [];

    for (const line of sanitized.split("\n")) {
      const trimmed = line.trim();
      const match = trimmed.match(/^([A-Za-z_][\w-]*):\s*(.+)$/);
      if (match && CLAUDE_METADATA_KEYS.has(match[1])) {
        labels.push({ key: match[1], value: match[2] });
        continue;
      }
      bodyLines.push(line);
    }

    const markdown = escapeUnknownXmlLikeTags(
      sanitizeSubAgentMarkdown(bodyLines.join("\n")),
    );
    if (markdown) {
      contentBlocks.push({
        type: "markdown",
        markdown,
      });
    }
  }

  return {
    labels: uniqueLabels(labels),
    contentBlocks,
  };
}

export const claudeCodeSubAgentAdapter: SubAgentAdapter = {
  canHandle(block, vendor) {
    return vendor === "claude" && looksLikeSubAgent(block);
  },
  normalize(block, vendor, childToolCalls): AtmosSubAgentMessage | null {
    if (!looksLikeSubAgent(block)) return null;
    const input = rawInputObject(block);
    const description = String(input.description ?? block.description ?? "");
    const prompt = typeof input.prompt === "string" ? input.prompt : null;
    const kind = typeof input.subagent_type === "string" ? input.subagent_type : "agent";
    const parsed = parseClaudeContent(block);

    return {
      id: block.tool_call_id,
      vendor,
      title: `${capitalizeWord(kind)} Agent`,
      description,
      prompt,
      status: toStatus(block.status),
      contentBlocks: parsed.contentBlocks,
      resultMarkdown: null,
      labels: parsed.labels,
      childToolCalls,
    };
  },
};
