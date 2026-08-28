import React from "react";
import type { ToolState } from "@workspace/ui";
import { Brain, FileText, FolderInput, Globe, Pencil, Search, Sparkles, Terminal, Trash2, Wrench } from "lucide-react";
import { createTranslator } from "next-intl";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import type { AcpPermissionOption } from "@/features/agent/hooks/use-agent-session";
import type { AgentMessage, AgentPart, AgentToolKind } from "@atmos/api-types/ws/dto/agent-chat";
import { currentAppLocale } from "@/shared/lib/current-app-locale";

export interface PendingPermission {
  request_id: string;
  tool: string;
  description: string;
  content_markdown?: string;
  risk_level: string;
  options: AcpPermissionOption[];
}

export interface DiffFileOutput {
  old_content: string;
  new_content: string;
  name?: string;
}

export type AgentActivity =
  | { busy: false }
  | { busy: true; label: string };

let cachedChatHelpersLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedChatHelpersTranslator: any = null;

function chatHelpersT(
  key:
    | "skill.defaultName"
    | "tool.generic"
    | "tool.read"
    | "tool.edit"
    | "tool.move"
    | "tool.search"
    | "tool.grep"
    | "tool.listDirectory"
    | "tool.execute"
    | "tool.fetch"
    | "tool.delete"
    | "tool.think"
    | "tool.labelWithPath"
    | "tool.labelWithPattern"
    | "tool.executeWithCommand"
    | "tool.fetchWithUrl"
    | "activity.generating"
    | "activity.reading"
    | "activity.writing"
    | "activity.searching"
    | "activity.runningCommand"
    | "activity.fetching"
    | "activity.deleting"
    | "activity.thinking"
    | "activity.working"
    | "activity.streaming"
    | "download.defaultChatName",
  fallback: string,
  values?: Record<string, string | number>,
): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedChatHelpersTranslator || cachedChatHelpersLocale !== locale) {
    cachedChatHelpersLocale = locale;
    cachedChatHelpersTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "agent.chatHelpers",
    });
  }

  if (!cachedChatHelpersTranslator.has(key as never)) {
    if (!values) return fallback;
    return fallback.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
  }

  return cachedChatHelpersTranslator(key as never, values);
}

function localizeToolLabel(tool: string): string {
  switch (tool.toLowerCase().replace(/[\s-]+/g, "_")) {
    case "read":
    case "readfile":
    case "read_file":
    case "view":
    case "view_file":
      return chatHelpersT("tool.read", "Read");
    case "edit":
    case "write":
    case "write_file":
    case "searchreplace":
    case "search_replace":
    case "str_replace":
    case "strreplace":
      return chatHelpersT("tool.edit", "Edit");
    case "move":
      return chatHelpersT("tool.move", "Move");
    case "search":
    case "glob":
      return chatHelpersT("tool.search", "Search");
    case "grep":
    case "grepsearch":
    case "grep_search":
      return chatHelpersT("tool.grep", "Grep");
    case "execute":
    case "bash":
    case "shell":
    case "terminal":
      return chatHelpersT("tool.execute", "Execute");
    case "fetch":
      return chatHelpersT("tool.fetch", "Fetch");
    case "delete":
      return chatHelpersT("tool.delete", "Delete");
    case "listdir":
    case "list_dir":
    case "list_directory":
    case "ls":
      return chatHelpersT("tool.listDirectory", "List directory");
    case "think":
    case "thought":
    case "reasoning":
    case "reason":
      return chatHelpersT("tool.think", "Think");
    case "tool":
    case "other":
      return chatHelpersT("tool.generic", "Tool");
    default:
      return tool;
  }
}

export {
  clearAgentLastSession,
  readAgentLastSession,
  readDefaultAgentRegistryId,
  writeDefaultAgentRegistryId,
  writeAgentLastSession,
} from '@/shared/stores/use-ui-pref-hooks';

export function getToolKindIcon(kind: AgentToolKind): React.ReactNode {
  switch (kind) {
    case "read":
      return React.createElement(FileText);
    case "edit":
      return React.createElement(Pencil);
    case "delete":
      return React.createElement(Trash2);
    case "move":
      return React.createElement(FolderInput);
    case "search":
      return React.createElement(Search);
    case "execute":
      return React.createElement(Terminal);
    case "fetch":
      return React.createElement(Globe);
    case "skill":
      return React.createElement(Sparkles);
    case "subagent":
      return React.createElement(Brain);
    default:
      return React.createElement(Wrench);
  }
}

export function getToolIcon(tool: string): React.ReactNode {
  switch ((tool || "").toLowerCase().replace(/[\s-]+/g, "_")) {
    case "read":
    case "readfile":
    case "read_file":
    case "view":
    case "view_file":
      return React.createElement(FileText);
    case "edit":
    case "write":
    case "write_file":
    case "searchreplace":
    case "search_replace":
    case "str_replace":
      return React.createElement(Pencil);
    case "delete":
      return React.createElement(Trash2);
    case "move":
      return React.createElement(FolderInput);
    case "search":
    case "grep":
    case "grepsearch":
    case "grep_search":
    case "glob":
      return React.createElement(Search);
    case "listdir":
    case "list_dir":
    case "list_directory":
    case "ls":
      return React.createElement(FolderInput);
    case "execute":
    case "bash":
    case "shell":
    case "terminal":
    case "run_command":
      return React.createElement(Terminal);
    case "think":
      return React.createElement(Brain);
    case "fetch":
      return React.createElement(Globe);
    case "other":
    case "tool":
    default:
      return React.createElement(Wrench);
  }
}

export function toolStatusToState(status: string): ToolState {
  switch (status?.toLowerCase()) {
    case "running":
      return "input-available";
    case "completed":
      return "output-available";
    case "failed":
      return "output-error";
    default:
      return "output-available";
  }
}

export function isSkillInvocation(raw_input?: unknown): raw_input is Record<string, unknown> & { skill?: string; command?: string } {
  if (!raw_input || typeof raw_input !== "object") return false;
  const o = raw_input as Record<string, unknown>;
  return "skill" in o && typeof o.skill === "string" && o.skill.length > 0;
}

export function isSkillCommand(raw_input?: unknown): raw_input is Record<string, unknown> & { command: string } {
  if (!raw_input || typeof raw_input !== "object") return false;
  const o = raw_input as Record<string, unknown>;
  const cmd = o.command;
  return typeof cmd === "string" && (cmd.startsWith("agent-browser") || cmd.includes("skill"));
}

export function getSkillName(raw_input: Record<string, unknown>): string {
  if (typeof raw_input.skill === "string" && raw_input.skill) return raw_input.skill;
  const cmd = raw_input.command;
  if (typeof cmd === "string" && cmd.startsWith("agent-browser")) return "agent-browser";
  return chatHelpersT("skill.defaultName", "Skill");
}

export function isTerminalCommand(tool: string): boolean {
  const t = (tool || "").toLowerCase().replace(/[\s-]+/g, "_");
  return (
    t === "execute"
    || t === "run_command"
    || t === "bash"
    || t === "shell"
    || t === "terminal"
    || t === "command"
    || t === "run_terminal_cmd"
    || t === "powershell"
    || t === "cmd"
    || t.endsWith("_bash")
    || t.endsWith("_shell")
  );
}

export function getTerminalCommandString(raw_input?: unknown): string {
  if (!raw_input || typeof raw_input !== "object") return "";
  const o = raw_input as Record<string, unknown>;
  const cmd = o.command ?? o.cmd ?? o.input ?? o.script;
  return typeof cmd === "string" ? cmd : "";
}

function isGenericToolLabel(value: string | null | undefined): boolean {
  if (!value) return true;
  return /^(tool|other|unknown)$/i.test(value.trim());
}

function vendorToolType(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const type = (
    (typeof record.type === "string" && record.type.trim())
    || (typeof record.variant === "string" && record.variant.trim())
    || ""
  );
  if (!type || isGenericToolLabel(type)) return null;
  if (/^[A-Z][A-Za-z0-9]+$/.test(type)) return type;
  return null;
}

function vendorToolPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const nested = record.FileContent
    ?? record.file_content
    ?? record.EditsApplied
    ?? record.edits_applied
    ?? record.Content
    ?? record.content
    ?? record.result;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return record;
}

function shortPathLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join("/") || path;
}

export function deriveToolDisplayName(
  tool: string,
  description: string,
  raw_input?: unknown,
  raw_output?: unknown,
): string {
  const typeName = vendorToolType(raw_input) ?? vendorToolType(raw_output);
  const resolvedTool = isGenericToolLabel(tool) && typeName ? typeName : tool;
  if (
    description &&
    description !== tool &&
    description !== resolvedTool &&
    !/^(Processing|Executing|Running|Tool)\b/i.test(description)
  ) {
    return description;
  }
  const payload = vendorToolPayload(raw_input) ?? vendorToolPayload(raw_output);
  if (payload) {
    const path = (
      payload.file_path
      ?? payload.path
      ?? payload.target_file
      ?? payload.absolute_path
      ?? payload.absolute_root_path
      ?? payload.dir_path
      ?? payload.directory
      ?? payload.target_directory
    ) as string | undefined;
    const command = payload.command as string | undefined;
    const url = payload.url as string | undefined;
    const pattern = (
      payload.pattern
      ?? payload.query
      ?? payload.regex
    ) as string | undefined;
    const toolName = (payload.tool ?? payload.name) as string | undefined;

    if (path) {
      const shortPath = shortPathLabel(path);
      const verb = localizeToolLabel(resolvedTool);
      return resolvedTool && !isGenericToolLabel(resolvedTool)
        ? chatHelpersT("tool.labelWithPath", "{tool}: {path}", { tool: verb, path: shortPath })
        : shortPath;
    }
    if (pattern && typeof pattern === "string" && pattern.trim()) {
      const shortPattern = pattern.length > 48 ? `${pattern.slice(0, 45)}...` : pattern;
      const verb = localizeToolLabel(resolvedTool);
      return chatHelpersT("tool.labelWithPattern", "{tool}: {pattern}", {
        tool: verb,
        pattern: shortPattern,
      });
    }
    if (command) {
      const shortCmd = command.length > 60 ? `${command.slice(0, 57)}...` : command;
      return chatHelpersT("tool.executeWithCommand", "Execute: {command}", { command: shortCmd });
    }
    if (url) {
      const shortUrl = url.length > 50 ? `${url.slice(0, 47)}...` : url;
      return chatHelpersT("tool.fetchWithUrl", "Fetch: {url}", { url: shortUrl });
    }
    if (toolName && !isGenericToolLabel(String(toolName))) {
      return localizeToolLabel(String(toolName));
    }
  }
  if (resolvedTool && !isGenericToolLabel(resolvedTool)) return localizeToolLabel(resolvedTool);
  return description && !isGenericToolLabel(description)
    ? description
    : chatHelpersT("tool.generic", "Tool");
}

export function isDiffString(s: string): boolean {
  const t = s.trimStart();
  return (
    t.startsWith("--- ") ||
    t.startsWith("diff --git ") ||
    t.startsWith("*** ") ||
    /^@@ /.test(t)
  );
}

export function isDiffObject(o: unknown): o is DiffFileOutput {
  if (!o || typeof o !== "object") return false;
  const obj = o as Record<string, unknown>;
  return typeof obj.old_content === "string" && typeof obj.new_content === "string";
}

export function getSessionContextKey(
  workspaceId: string | null,
  projectId: string | null,
  mode: string,
): string {
  const suffix = mode.trim() || "default";
  if (workspaceId) return `workspace:${workspaceId}:${suffix}`;
  if (projectId) return `project:${projectId}:${suffix}`;
  return `temp:${suffix}`;
}

export function legacySessionContextKey(
  workspaceId: string | null,
  projectId: string | null,
): string {
  if (workspaceId) return `workspace:${workspaceId}`;
  if (projectId) return `project:${projectId}`;
  return "temp";
}

export function sanitizeChatFilename(value: string): string {
  const trimmed = value.trim().replace(/[\\/:*?"<>|]/g, "-");
  return trimmed.length > 0 ? trimmed : chatHelpersT("download.defaultChatName", "chat");
}

export function getLocalTimestampForFilename(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

export function downloadChatMarkdown(filename: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function deriveAgentActivity(messages: AgentMessage[], waitingFirst: boolean): AgentActivity {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") {
    if (waitingFirst) return { busy: true, label: chatHelpersT("activity.generating", "Generating") };
    return { busy: false };
  }

  for (let i = last.parts.length - 1; i >= 0; i--) {
    const part = last.parts[i];
    if (part.type !== "tool_call") continue;
    if (part.status === "running") {
      const label =
        part.kind === "read" ? chatHelpersT("activity.reading", "Reading") :
          part.kind === "edit" ? chatHelpersT("activity.writing", "Writing") :
            part.kind === "search" ? chatHelpersT("activity.searching", "Searching") :
              part.kind === "execute" ? chatHelpersT("activity.runningCommand", "Running command") :
                part.kind === "fetch" ? chatHelpersT("activity.fetching", "Fetching") :
                  part.kind === "delete" ? chatHelpersT("activity.deleting", "Deleting") :
                    part.title || chatHelpersT("activity.working", "Working");
      return { busy: true, label };
    }
  }

  if (last.streaming) {
    for (let i = last.parts.length - 1; i >= 0; i--) {
      const part = last.parts[i];
      if (part.type === "thinking") return { busy: true, label: chatHelpersT("activity.thinking", "Thinking") };
      if (part.type === "text") return { busy: true, label: chatHelpersT("activity.streaming", "Streaming") };
    }
    return { busy: true, label: chatHelpersT("activity.streaming", "Streaming") };
  }

  if (waitingFirst) return { busy: true, label: chatHelpersT("activity.generating", "Generating") };
  return { busy: false };
}
