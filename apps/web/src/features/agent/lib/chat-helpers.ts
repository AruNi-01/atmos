import React from "react";
import type { ToolState } from "@workspace/ui";
import { Brain, FileText, FolderInput, Globe, Pencil, Search, Terminal, Trash2, Wrench } from "lucide-react";
import { createTranslator } from "next-intl";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import type { AcpPermissionOption } from "@/features/agent/hooks/use-agent-session";
import type { AssistantEntry, ThreadEntry, ToolCallBlock } from "@/features/agent/lib/agent/thread";
import { isPlanUpdateToolCall } from "@/features/agent/lib/agent/thread";
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
let cachedChatHelpersTranslator: any = null;

function chatHelpersT(
  key:
    | "skill.defaultName"
    | "tool.generic"
    | "tool.read"
    | "tool.edit"
    | "tool.move"
    | "tool.search"
    | "tool.execute"
    | "tool.fetch"
    | "tool.delete"
    | "tool.think"
    | "tool.labelWithPath"
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
    | "download.defaultConversationName",
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
  switch (tool.toLowerCase()) {
    case "read":
      return chatHelpersT("tool.read", "Read");
    case "edit":
      return chatHelpersT("tool.edit", "Edit");
    case "move":
      return chatHelpersT("tool.move", "Move");
    case "search":
      return chatHelpersT("tool.search", "Search");
    case "execute":
      return chatHelpersT("tool.execute", "Execute");
    case "fetch":
      return chatHelpersT("tool.fetch", "Fetch");
    case "delete":
      return chatHelpersT("tool.delete", "Delete");
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

export function getToolIcon(tool: string): React.ReactNode {
  switch ((tool || "").toLowerCase()) {
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
  const t = (tool || "").toLowerCase();
  return t === "execute" || t === "run_command" || t === "bash" || t === "shell" || t === "terminal";
}

export function getTerminalCommandString(raw_input?: unknown): string {
  if (!raw_input || typeof raw_input !== "object") return "";
  const o = raw_input as Record<string, unknown>;
  const cmd = o.command ?? o.cmd ?? o.input ?? o.script;
  return typeof cmd === "string" ? cmd : "";
}

export function deriveToolDisplayName(tool: string, description: string, raw_input?: unknown): string {
  if (
    description &&
    description !== tool &&
    !/^(Processing|Executing|Running|Tool)\b/i.test(description)
  ) {
    return description;
  }
  if (raw_input && typeof raw_input === "object") {
    const input = raw_input as Record<string, unknown>;
    const path = (input.file_path ?? input.path) as string | undefined;
    const command = input.command as string | undefined;
    const url = input.url as string | undefined;
    const toolName = (input.tool ?? input.name) as string | undefined;

    if (path) {
      const shortPath = path.split("/").slice(-2).join("/");
      const verb = localizeToolLabel(tool);
      return tool && !["tool", "other"].includes(tool.toLowerCase())
        ? chatHelpersT("tool.labelWithPath", "{tool}: {path}", { tool: verb, path: shortPath })
        : shortPath;
    }
    if (command) {
      const shortCmd = command.length > 60 ? `${command.slice(0, 57)}...` : command;
      return chatHelpersT("tool.executeWithCommand", "Execute: {command}", { command: shortCmd });
    }
    if (url) {
      const shortUrl = url.length > 50 ? `${url.slice(0, 47)}...` : url;
      return chatHelpersT("tool.fetchWithUrl", "Fetch: {url}", { url: shortUrl });
    }
    if (toolName) return String(toolName);
  }
  if (tool && !["tool", "other"].includes(tool.toLowerCase())) return localizeToolLabel(tool);
  return description || chatHelpersT("tool.generic", "Tool");
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
  _mode: string
): string {
  if (workspaceId) return `workspace:${workspaceId}`;
  if (projectId) return `project:${projectId}`;
  return "temp";
}

export function sanitizeConversationFilename(value: string): string {
  const trimmed = value.trim().replace(/[\\/:*?"<>|]/g, "-");
  return trimmed.length > 0 ? trimmed : chatHelpersT("download.defaultConversationName", "conversation");
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

export function downloadConversationMarkdown(filename: string, markdown: string) {
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

export function deriveAgentActivity(entries: ThreadEntry[], waitingFirst: boolean): AgentActivity {
  const last = entries[entries.length - 1];
  if (!last || last.role !== "assistant") {
    if (waitingFirst) return { busy: true, label: chatHelpersT("activity.generating", "Generating") };
    return { busy: false };
  }

  const assistant = last;
  for (let i = assistant.blocks.length - 1; i >= 0; i--) {
    const block = assistant.blocks[i];
    if (block.type === "tool_call") {
      if (isPlanUpdateToolCall(block)) continue;
      if (block.status === "running") {
        const tool = block.tool;
        const label =
          tool === "Read" ? chatHelpersT("activity.reading", "Reading") :
            tool === "Edit" ? chatHelpersT("activity.writing", "Writing") :
              tool === "Search" ? chatHelpersT("activity.searching", "Searching") :
                tool === "Execute" ? chatHelpersT("activity.runningCommand", "Running command") :
                  tool === "Fetch" ? chatHelpersT("activity.fetching", "Fetching") :
                    tool === "Delete" ? chatHelpersT("activity.deleting", "Deleting") :
                      tool === "Think" || tool === "Thought" || tool === "Reasoning" || tool === "Reason" ? chatHelpersT("activity.thinking", "Thinking") :
                        tool === "Tool" ? (block.description || chatHelpersT("activity.working", "Working")) :
                          tool;
        return { busy: true, label };
      }
    }
  }

  if (assistant.isStreaming) {
    for (let i = assistant.blocks.length - 1; i >= 0; i--) {
      const block = assistant.blocks[i];
      if (block.type === "thinking") return { busy: true, label: chatHelpersT("activity.thinking", "Thinking") };
      if (block.type === "text") return { busy: true, label: chatHelpersT("activity.streaming", "Streaming") };
    }
    return { busy: true, label: chatHelpersT("activity.streaming", "Streaming") };
  }

  if (waitingFirst) return { busy: true, label: chatHelpersT("activity.generating", "Generating") };
  return { busy: false };
}
