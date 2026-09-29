import type { FileTreeNode } from "@atmos/api-types/ws/dto/fs";

export type SlashCommand = {
  name: string;
  description: string;
  hint?: string | null;
};

export type MentionFile = {
  name: string;
  path: string;
};

export type ComposerTrigger = {
  kind: "slash" | "mention";
  query: string;
  offset: number;
};

const SLASH_LIMIT = 30;
const MENTION_LIMIT = 40;

function tokenStartOk(before: string, index: number): boolean {
  return index === 0 || /\s/.test(before.charAt(index - 1));
}

export function readComposerTrigger(text: string): ComposerTrigger | null {
  const before = text;
  const slash = before.lastIndexOf("/");
  const at = before.lastIndexOf("@");
  const slashOk = slash >= 0 && tokenStartOk(before, slash);
  const atOk = at >= 0 && tokenStartOk(before, at);
  const useSlash = slashOk && (!atOk || slash > at);
  const index = useSlash ? slash : atOk ? at : -1;
  if (index < 0) return null;
  const query = before.slice(index + 1);
  if (query.includes("\n") || /\s/.test(query)) return null;
  return {
    kind: useSlash ? "slash" : "mention",
    query,
    offset: index,
  };
}

export function applyComposerPick(text: string, trigger: ComposerTrigger, insert: string): string {
  const from = Math.max(trigger.offset, 0);
  const to = Math.min(from + 1 + trigger.query.length, text.length);
  return `${text.slice(0, from)}${insert}${text.slice(to)}`;
}

export function normalizeSlashCommands(
  commands: Array<{ name?: string | null; description?: string | null; hint?: string | null }> | null | undefined,
): SlashCommand[] {
  const seen = new Set<string>();
  const rows: SlashCommand[] = [];
  for (const command of commands ?? []) {
    const name = command.name?.trim().replace(/^\/+/, "") ?? "";
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    rows.push({
      name,
      description: command.description?.trim() || name,
      hint: command.hint ?? null,
    });
  }
  return rows;
}

export function mergeSlashCommands(catalog: SlashCommand[], session: SlashCommand[]): SlashCommand[] {
  const byName = new Map<string, SlashCommand>();
  for (const command of catalog) byName.set(command.name.toLowerCase(), command);
  for (const command of session) byName.set(command.name.toLowerCase(), command);
  return [...byName.values()];
}

export function filterSlashCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const needle = query.trim().toLowerCase();
  const matched = needle.length === 0
    ? commands
    : commands.filter((command) =>
      command.name.toLowerCase().includes(needle)
      || command.description.toLowerCase().includes(needle),
    );
  return matched.slice(0, SLASH_LIMIT);
}

function relativePath(path: string, rootPath: string): string {
  const root = rootPath.replace(/[\\/]+$/, "");
  const normalized = path.replace(/\\/g, "/");
  const rootNormalized = root.replace(/\\/g, "/");
  if (rootNormalized && normalized.startsWith(`${rootNormalized}/`)) {
    return normalized.slice(rootNormalized.length + 1);
  }
  return normalized;
}

export function flattenMentionFiles(nodes: FileTreeNode[] | null | undefined, rootPath: string): MentionFile[] {
  const files: MentionFile[] = [];
  const walk = (node: FileTreeNode) => {
    const path = relativePath(node.path, rootPath);
    if (path.length > 0) {
      files.push({ name: node.name, path });
    }
    for (const child of node.children ?? []) walk(child);
  };
  for (const node of nodes ?? []) walk(node);
  return files;
}

export function filterMentionFiles(files: MentionFile[], query: string): MentionFile[] {
  const needle = query.trim().toLowerCase();
  const matched = needle.length === 0
    ? files
    : files.filter((file) =>
      file.path.toLowerCase().includes(needle) || file.name.toLowerCase().includes(needle),
    );
  return matched.slice(0, MENTION_LIMIT);
}

export type ComposerSuggestion = {
  id: string;
  title: string;
  detail: string;
};

export function composerSuggestionList(
  text: string,
  commands: SlashCommand[],
  files: MentionFile[],
): { title: string; trigger: ComposerTrigger; rows: ComposerSuggestion[] } | null {
  const trigger = readComposerTrigger(text);
  if (!trigger) return null;
  if (trigger.kind === "slash") {
    return {
      title: "Commands",
      trigger,
      rows: filterSlashCommands(commands, trigger.query).map((command) => ({
        id: command.name,
        title: `/${command.name}`,
        detail: command.description,
      })),
    };
  }
  return {
    title: "Files",
    trigger,
    rows: filterMentionFiles(files, trigger.query).map((file) => ({
      id: file.path,
      title: file.name,
      detail: file.path,
    })),
  };
}
