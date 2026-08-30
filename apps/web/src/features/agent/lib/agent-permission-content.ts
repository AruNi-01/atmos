import { isGenericToolLabel } from "@/features/agent/lib/agent-tool-kind";
import { isTerminalCommand } from "@/features/agent/lib/chat-helpers";

const COMMAND_FENCE_RE =
  /```(?:bash|sh|shell|zsh|console|terminal|powershell|cmd)?[^\n]*\n([\s\S]*?)```/i;

const SHELL_META_RE = /(?:&&|\|\||[;&|])/;
const SHELL_START_RE =
  /^(?:\$\s+)?(?:sudo\s+)?(?:ls|cat|echo|cd|git|npm|npx|bun|pnpm|yarn|cargo|python3?|node|mkdir|rm|cp|mv|chmod|curl|wget|head|tail|grep|find|sed|awk|export|source|bash|sh|zsh|just)\b/;

function stripPromptPrefix(value: string): string {
  return value.replace(/^\$\s+/, "").trim();
}

export function extractPermissionCommandFence(markdown?: string | null): string | null {
  if (!markdown) return null;
  const match = markdown.match(COMMAND_FENCE_RE);
  const body = match?.[1]?.trim();
  return body || null;
}

export function looksLikeShellCommand(text: string): boolean {
  const value = stripPromptPrefix(text);
  if (!value) return false;
  if (SHELL_START_RE.test(value)) return true;
  if (SHELL_META_RE.test(value) && /\s/.test(value)) return true;
  return false;
}

export function resolvePermissionCommand(input: {
  tool: string;
  description: string;
  contentMarkdown?: string | null;
}): string | null {
  const description = input.description.trim();
  const fenced = extractPermissionCommandFence(input.contentMarkdown);
  const toolIsCommand = isTerminalCommand(input.tool);

  if (toolIsCommand) {
    if (
      description
      && !isGenericToolLabel(description)
      && description.toLowerCase() !== input.tool.trim().toLowerCase()
    ) {
      return stripPromptPrefix(description);
    }
    return fenced;
  }

  if (fenced) return fenced;
  if (looksLikeShellCommand(description)) return stripPromptPrefix(description);
  return null;
}

export function permissionMarkdownToRender(
  markdown: string | null | undefined,
  command: string | null,
): string | null {
  const text = markdown?.trim() ?? "";
  if (!text) return null;
  if (!command) return text;
  if (text === command) return null;
  const fenced = extractPermissionCommandFence(text);
  if (fenced === command && text.replace(COMMAND_FENCE_RE, "").trim() === "") {
    return null;
  }
  return text;
}

export function permissionDescriptionToRender(
  description: string,
  command: string | null,
): string | null {
  const text = description.trim();
  if (!text) return null;
  if (command && stripPromptPrefix(text) === command) return null;
  if (isGenericToolLabel(text)) return null;
  return text;
}

export function permissionOptionVariant(
  kind: string,
): "default" | "secondary" | "ghost" {
  const normalized = kind.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (
    normalized.includes("reject")
    || normalized.includes("deny")
    || normalized === "no"
  ) {
    return "ghost";
  }
  if (normalized.includes("always")) return "secondary";
  if (normalized.includes("once") || normalized.includes("allow")) return "default";
  return "secondary";
}
