/**
 * Command-permission helpers matching `apps/web` `resolvePermissionCommand`
 * and `permissionCommandActions`. Once stays primary when Always is listed first.
 */

import { defaultAllowOptionId, type PermissionChoice } from "./permission-plan";

const COMMAND_FENCE_RE =
  /```(?:bash|sh|shell|zsh|console|terminal|powershell|cmd)?[^\n]*\n([\s\S]*?)```/i;

/** Shell operators — exclude bare `|` so markdown tables are not treated as pipes. */
const SHELL_META_RE = /(?:&&|\|\||;|&)/;
const SHELL_PIPE_RE = /(?:^|[^\s|])\s*\|\s*(?:$|[^\s|])/;
const SHELL_START_RE =
  /^(?:\$\s+)?(?:sudo\s+)?(?:ls|cat|echo|cd|git|npm|npx|bun|pnpm|yarn|cargo|python3?|node|mkdir|rm|cp|mv|chmod|curl|wget|head|tail|grep|find|sed|awk|export|source|bash|sh|zsh|just)\b/;
const MARKDOWN_DOC_RE = /(?:^#{1,6}\s|\n#{1,6}\s|^\|.+\||\n\|.+\|)/m;

function stripPromptPrefix(value: string): string {
  return value.replace(/^\$\s+/, "").trim();
}

export function isTerminalCommand(tool: string): boolean {
  const normalized = (tool || "").toLowerCase().replace(/[\s-]+/g, "_");
  return (
    normalized === "execute" ||
    normalized === "run_command" ||
    normalized === "bash" ||
    normalized === "shell" ||
    normalized === "terminal" ||
    normalized === "command" ||
    normalized === "run_terminal_cmd" ||
    normalized === "powershell" ||
    normalized === "cmd" ||
    normalized.endsWith("_bash") ||
    normalized.endsWith("_shell")
  );
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
  if (value.includes("\n") && MARKDOWN_DOC_RE.test(value)) return false;
  if (SHELL_START_RE.test(value)) return true;
  if (/^\/(?:bin|usr\/bin|opt)\/\S+/.test(value) && /\s/.test(value)) return true;
  if ((SHELL_META_RE.test(value) || SHELL_PIPE_RE.test(value)) && /\s/.test(value)) {
    return true;
  }
  return false;
}

export function resolvePermissionCommand(input: {
  tool: string;
  description: string;
  contentMarkdown?: string | null;
}): string | null {
  const description = input.description.trim();
  const tool = input.tool.trim();
  if (/exit.?plan|approve.?plan|plan.?mode/i.test(tool)) {
    return null;
  }
  const fenced = extractPermissionCommandFence(input.contentMarkdown);
  const toolIsCommand = isTerminalCommand(input.tool);

  if (toolIsCommand) {
    if (
      description &&
      looksLikeShellCommand(description) &&
      description.toLowerCase() !== input.tool.trim().toLowerCase()
    ) {
      return stripPromptPrefix(description);
    }
    return fenced;
  }

  if (fenced) return fenced;
  const markdown = input.contentMarkdown?.trim() ?? "";
  if (markdown && looksLikeShellCommand(markdown)) {
    return stripPromptPrefix(markdown);
  }
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
  return text;
}

export function isAllowOnceOption(option: PermissionChoice): boolean {
  const id = option.option_id;
  const kind = option.kind ?? "";
  const name = option.name;
  return (
    /allow[_-]?once|^allow$|^accept$|^once$|^yes$/i.test(id) ||
    /allow[_-]?once|^allow$|^accept$|^once$/i.test(kind) ||
    /^allow once$|^yes$|^accept$/i.test(name.trim())
  );
}

export function isRejectOption(option: PermissionChoice): boolean {
  return (
    /reject|deny|skip|cancel|decline/i.test(option.option_id) ||
    /reject|deny|skip|cancel|decline/i.test(option.kind ?? "") ||
    /reject|deny|skip|cancel|decline|^no\b/i.test(option.name)
  );
}

/** Prefer once/accept over always so Grok-style order (always, once, reject) still primaries once. */
export function preferredPrimaryOptionId(options: readonly PermissionChoice[]): string {
  const once = options.find((option) => isAllowOnceOption(option));
  if (once) return once.option_id;
  return defaultAllowOptionId(options);
}

export type CommandPermissionAction = {
  id: string;
  label: string;
  variant: "primary" | "ghost";
};

export function commandPermissionActions(
  options: readonly PermissionChoice[],
): CommandPermissionAction[] {
  if (options.length === 0) return [];
  const primaryId = preferredPrimaryOptionId(options);
  return options.map((option) => ({
    id: option.option_id,
    label: option.name,
    variant: option.option_id === primaryId && !isRejectOption(option) ? "primary" : "ghost",
  }));
}

export function commandPermissionText(input: {
  tool?: string | null;
  description: string;
  contentMarkdown?: string | null;
}): string {
  const command = resolvePermissionCommand({
    tool: input.tool ?? "",
    description: input.description,
    contentMarkdown: input.contentMarkdown,
  });
  const description = permissionDescriptionToRender(input.description, command);
  return command || description || input.tool || "command";
}
