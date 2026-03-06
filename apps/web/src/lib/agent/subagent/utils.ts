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

export function looksLikeSubAgent(block: SubAgentToolCallBlock): boolean {
  if (!block.raw_input || typeof block.raw_input !== "object") return false;
  const input = block.raw_input as Record<string, unknown>;
  return (
    typeof input.description === "string" &&
    typeof input.prompt === "string" &&
    typeof input.subagent_type === "string"
  );
}

export function rawInputObject(block: SubAgentToolCallBlock): Record<string, unknown> {
  return block.raw_input && typeof block.raw_input === "object"
    ? (block.raw_input as Record<string, unknown>)
    : {};
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
      return [{
        type: "diff",
        path: item.path,
        oldContent: item.old_content,
        newContent: item.new_content,
      }];
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
