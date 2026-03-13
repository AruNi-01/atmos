import type {
  AtmosSubAgentContentBlock,
  AtmosSubAgentLabel,
  SubAgentToolCallBlock,
} from "./types";

function decodeEscapedMarkdown(markdown: string): string {
  const hasEscapedNewlines = markdown.includes("\\n");
  const hasRealNewlines = markdown.includes("\n");
  const looksEscapedCodeFence = markdown.includes("```\\n") || markdown.includes("\\n```");

  if (!hasEscapedNewlines) return markdown;
  if (!looksEscapedCodeFence && hasRealNewlines) return markdown;

  return markdown
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"");
}

export function sanitizeSubAgentMarkdown(markdown: string | null | undefined): string | null {
  if (!markdown) return null;
  const sanitized = decodeEscapedMarkdown(
    markdown
      .replace(/<\/?usage>/gi, "")
      .replace(/<\/?task_result>/gi, "")
  ).trim();
  return sanitized || null;
}

export function escapeUnknownXmlLikeTags(markdown: string | null): string | null {
  if (!markdown) return null;
  return markdown.replace(/<\/?([a-z][\w-]*)>/gi, (match) => {
    return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  });
}

export function toStatus(status: string): "running" | "completed" | "failed" {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "running";
}

export function capitalizeWord(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function hasPromptAndDescription(input: Record<string, unknown>): boolean {
  return (
    typeof input.description === "string" &&
    typeof input.prompt === "string"
  );
}

export function looksLikeStructuredSubAgent(block: SubAgentToolCallBlock): boolean {
  const input = rawInputObject(block);
  return hasPromptAndDescription(input) && typeof input.subagent_type === "string";
}

export function looksLikeCursorTaskSubAgent(block: SubAgentToolCallBlock): boolean {
  const input = rawInputObject(block);
  const description = block.description.trim().toLowerCase();
  return (
    typeof input._toolName === "string" &&
    input._toolName.toLowerCase() === "task" &&
    description.includes("subagent")
  );
}

export function looksLikeSubAgent(block: SubAgentToolCallBlock): boolean {
  return looksLikeStructuredSubAgent(block) || looksLikeCursorTaskSubAgent(block);
}

export function rawInputObject(block: SubAgentToolCallBlock): Record<string, unknown> {
  return block.raw_input && typeof block.raw_input === "object"
    ? (block.raw_input as Record<string, unknown>)
    : {};
}

export function detailObject(block: SubAgentToolCallBlock): Record<string, unknown> {
  return block.detail && typeof block.detail === "object"
    ? (block.detail as Record<string, unknown>)
    : {};
}

export function claudeCodeDetail(block: SubAgentToolCallBlock): Record<string, unknown> | null {
  const detail = detailObject(block);
  const claudeCode = detail.claudeCode;
  return claudeCode && typeof claudeCode === "object"
    ? (claudeCode as Record<string, unknown>)
    : null;
}

export function claudeCodeToolResponse(block: SubAgentToolCallBlock): Record<string, unknown> | null {
  const claudeCode = claudeCodeDetail(block);
  const toolResponse = claudeCode?.toolResponse;
  return toolResponse && typeof toolResponse === "object"
    ? (toolResponse as Record<string, unknown>)
    : null;
}

export function claudeCodeToolName(block: SubAgentToolCallBlock): string | null {
  const input = rawInputObject(block);
  if (typeof input._toolName === "string" && input._toolName.trim()) {
    return input._toolName;
  }

  const claudeCode = claudeCodeDetail(block);
  return typeof claudeCode?.toolName === "string" && claudeCode.toolName.trim()
    ? claudeCode.toolName
    : null;
}

function isGenericSubAgentDescription(description: string | null | undefined): boolean {
  const normalized = String(description ?? "").trim().toLowerCase();
  return !normalized || normalized === "task" || normalized === "tool" || normalized === "agent";
}

export function looksLikeClaudeAgentSubAgent(block: SubAgentToolCallBlock): boolean {
  const toolName = claudeCodeToolName(block)?.toLowerCase() ?? block.tool.toLowerCase();
  if (toolName !== "agent") return false;

  const input = rawInputObject(block);
  if (hasPromptAndDescription(input)) return true;

  const toolResponse = claudeCodeToolResponse(block);
  if (typeof toolResponse?.prompt === "string" && toolResponse.prompt.trim()) return true;
  if (Array.isArray(toolResponse?.content) && toolResponse.content.length > 0) return true;

  return true;
}

export function resolveSubAgentDescription(block: SubAgentToolCallBlock): string {
  const input = rawInputObject(block);
  if (typeof input.description === "string" && input.description.trim()) {
    return input.description;
  }

  if (!isGenericSubAgentDescription(block.description)) {
    return block.description;
  }

  const prompt = resolveSubAgentPrompt(block);
  if (prompt) {
    return prompt.split("\n").find((line) => line.trim())?.trim() ?? prompt;
  }

  return block.description || "Agent task";
}

export function resolveSubAgentPrompt(block: SubAgentToolCallBlock): string | null {
  const input = rawInputObject(block);
  if (typeof input.prompt === "string" && input.prompt.trim()) {
    return input.prompt;
  }

  const toolResponse = claudeCodeToolResponse(block);
  if (typeof toolResponse?.prompt === "string" && toolResponse.prompt.trim()) {
    return toolResponse.prompt;
  }

  return null;
}

export function resolveSubAgentKind(block: SubAgentToolCallBlock): string {
  const input = rawInputObject(block);
  if (typeof input.subagent_type === "string" && input.subagent_type.trim()) {
    return input.subagent_type;
  }

  const toolName = claudeCodeToolName(block);
  if (toolName?.trim()) {
    return toolName.toLowerCase() === "agent" ? "agent" : toolName;
  }

  return "agent";
}

export function convertContentBlocks(
  content: SubAgentToolCallBlock["content"],
): AtmosSubAgentContentBlock[] {
  if (!content) return [];
  return content.flatMap<AtmosSubAgentContentBlock>((item) => {
    if (item.type === "text") {
      const markdown = escapeUnknownXmlLikeTags(sanitizeSubAgentMarkdown(item.text));
      return markdown ? [{ type: "markdown", markdown }] : [];
    }
    if (item.type === "diff") {
      return [
        {
          type: "diff",
          path: item.path,
          oldContent: item.old_content,
          newContent: item.new_content,
        },
      ];
    }
    return [{ type: "terminal", terminalId: item.terminal_id }];
  });
}

export function uniqueLabels(labels: AtmosSubAgentLabel[]): AtmosSubAgentLabel[] {
  const seen = new Set<string>();
  return labels.filter((item) => {
    const key = `${item.key}:${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
