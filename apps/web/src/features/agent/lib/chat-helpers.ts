import React from "react";
import type { ToolState } from "@workspace/ui";
import { Brain, FileText, FolderInput, Globe, Pencil, Search, Sparkles, Terminal, Trash2, Wrench } from "lucide-react";
import { createTranslator } from "next-intl";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import type { AgentChatPermissionOption } from "@/features/agent/lib/agent-chat-types";
import type {
  AgentMessage,
  AgentPart,
  AgentSessionOpRequest,
  AgentToolKind,
} from "@atmos/api-types/ws/dto/agent-chat";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import {
  isActiveToolStatus,
  type AgentToolCallPart,
} from "@/features/agent/lib/agent-tool-kind";
import { isLiveBackgroundToolCall } from "@/features/agent/lib/agent/background-command";

export interface PendingPermission {
  request_id: string;
  tool: string;
  description: string;
  content_markdown?: string;
  risk_level: string;
  options: AgentChatPermissionOption[];
}

export type PendingSessionOp = AgentSessionOpRequest;

export interface DiffFileOutput {
  old_content: string;
  new_content: string;
  name?: string;
}

export type AgentActivity =
  | { busy: false }
  | { busy: true; label: string; kind: "thinking" | "working" };

let cachedChatHelpersLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedChatHelpersTranslator: any = null;

function chatHelpersT(
  key:
    | "skill.defaultName"
    | "activity.generating"
    | "activity.reading"
    | "activity.writing"
    | "activity.searching"
    | "activity.executing"
    | "activity.fetching"
    | "activity.deleting"
    | "activity.moving"
    | "activity.thinking"
    | "activity.working"
    | "activity.streaming"
    | "activity.creatingSession"
    | "activity.resumingSession"
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
    case "web_search":
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

function toolStatusIsActive(status?: string | null): boolean {
  return isActiveToolStatus(status);
}

export function runningBackgroundTools(messages: AgentMessage[]): AgentToolCallPart[] {
  const found: AgentToolCallPart[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== "tool_call") continue;
      if (!isLiveBackgroundToolCall(part)) continue;
      if (seen.has(part.tool_call_id)) continue;
      seen.add(part.tool_call_id);
      found.push(part);
    }
  }
  return found;
}

function activityLabelForKind(kind: AgentToolKind): string {
  switch (kind) {
    case "read":
      return chatHelpersT("activity.reading", "Reading");
    case "edit":
      return chatHelpersT("activity.writing", "Writing");
    case "search":
    case "web_search":
      return chatHelpersT("activity.searching", "Searching");
    case "execute":
      return chatHelpersT("activity.executing", "Executing");
    case "fetch":
      return chatHelpersT("activity.fetching", "Fetching");
    case "delete":
      return chatHelpersT("activity.deleting", "Deleting");
    case "move":
      return chatHelpersT("activity.moving", "Moving");
    case "skill":
    case "subagent":
    case "other":
      return chatHelpersT("activity.working", "Working");
  }
}

function activityForToolPart(part: Extract<AgentPart, { type: "tool_call" }>): AgentActivity {
  return { busy: true, label: activityLabelForKind(part.kind), kind: "working" };
}

export function deriveAgentActivity(messages: AgentMessage[], waitingFirst: boolean): AgentActivity {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") {
    if (waitingFirst) {
      return { busy: true, label: chatHelpersT("activity.generating", "Generating"), kind: "working" };
    }
    return { busy: false };
  }

  const session = last.parts.find(
    (part) => part.type === "session_lifecycle" && toolStatusIsActive(part.status),
  );
  if (session?.type === "session_lifecycle") {
    const label = session.action === "resume"
      ? chatHelpersT("activity.resumingSession", "Resuming session")
      : chatHelpersT("activity.creatingSession", "Creating session");
    return { busy: true, label, kind: "working" };
  }

  for (let i = last.parts.length - 1; i >= 0; i--) {
    const part = last.parts[i];
    if (
      part.type === "tool_call"
      && toolStatusIsActive(part.status)
      && !isLiveBackgroundToolCall(part)
    ) {
      return activityForToolPart(part);
    }
  }

  if (last.streaming) {
    for (let i = last.parts.length - 1; i >= 0; i--) {
      const part = last.parts[i];
      if (part.type === "tool_call") {
        if (isLiveBackgroundToolCall(part)) continue;
        return activityForToolPart(part);
      }
      if (part.type === "thinking") {
        return { busy: true, label: chatHelpersT("activity.thinking", "Thinking"), kind: "thinking" };
      }
      if (part.type === "text") {
        return { busy: true, label: chatHelpersT("activity.streaming", "Streaming"), kind: "working" };
      }
    }
    return { busy: true, label: chatHelpersT("activity.generating", "Generating"), kind: "working" };
  }

  if (waitingFirst) {
    return { busy: true, label: chatHelpersT("activity.generating", "Generating"), kind: "working" };
  }
  return { busy: false };
}
