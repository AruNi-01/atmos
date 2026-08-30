import { resolvePromptPlaceholders } from "@/features/welcome/lib/welcome-page-helpers";

export function composeAgentChatPrompt(
  command: { name: string } | null | undefined,
  text: string,
): string {
  const rest = text.trim();
  if (!command?.name) return rest;
  const token = `/${command.name}`;
  return rest ? `${token} ${rest}` : token;
}

export function expandAgentComposerText(text: string): string {
  return resolvePromptPlaceholders(
    text.replace(/\u00A0/g, " ").replace(/\/cmd:([^\s]+)/g, "/$1"),
    [],
    { preserveFileMentions: true },
  ).trim();
}

export function parseLeadingAgentSlashCommand<T extends { name: string }>(
  draft: string,
  commands: T[],
): { command: T | null; rest: string } {
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(draft);
  if (!match) return { command: null, rest: draft };
  const command = commands.find((item) => item.name === match[1]);
  if (!command) return { command: null, rest: draft };
  return { command, rest: match[2] ?? "" };
}
