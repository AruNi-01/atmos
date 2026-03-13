import type {
  AtmosSubAgentContentBlock,
  AtmosSubAgentLabel,
  AtmosSubAgentMessage,
  SubAgentAdapter,
  SubAgentToolCallBlock,
} from "../types";
import {
  capitalizeWord,
  looksLikeClaudeAgentSubAgent,
  escapeUnknownXmlLikeTags,
  looksLikeStructuredSubAgent,
  sanitizeSubAgentMarkdown,
  resolveSubAgentDescription,
  resolveSubAgentKind,
  resolveSubAgentPrompt,
  toStatus,
  uniqueLabels,
} from "../utils";

const CLAUDE_METADATA_KEYS = new Set([
  "agentId",
  "total_tokens",
  "tool_uses",
  "duration_ms",
]);

function comparableText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function parseClaudeContent(block: SubAgentToolCallBlock): {
  labels: AtmosSubAgentLabel[];
  contentBlocks: AtmosSubAgentContentBlock[];
} {
  const labels: AtmosSubAgentLabel[] = [];
  const contentBlocks: AtmosSubAgentContentBlock[] = [];
  const prompt = resolveSubAgentPrompt(block);
  const comparablePrompt = comparableText(prompt);

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
      if (comparablePrompt && comparableText(markdown) === comparablePrompt) {
        continue;
      }
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
    return vendor === "claude" && (
      looksLikeStructuredSubAgent(block) ||
      looksLikeClaudeAgentSubAgent(block)
    );
  },
  normalize(block, vendor, childToolCalls): AtmosSubAgentMessage | null {
    if (!looksLikeStructuredSubAgent(block) && !looksLikeClaudeAgentSubAgent(block)) {
      return null;
    }

    const description = resolveSubAgentDescription(block);
    const prompt = resolveSubAgentPrompt(block);
    const kind = resolveSubAgentKind(block);
    const title = kind.trim().toLowerCase() === "agent"
      ? "Agent"
      : `${capitalizeWord(kind)} Agent`;
    const parsed = parseClaudeContent(block);

    return {
      id: block.tool_call_id,
      vendor,
      title,
      description,
      prompt,
      status: toStatus(block.status),
      detailMode: "full",
      contentBlocks: parsed.contentBlocks,
      resultMarkdown: null,
      labels: parsed.labels,
      childToolCalls,
    };
  },
};
