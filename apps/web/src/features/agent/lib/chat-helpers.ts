import React from "react";
import type { ToolState } from "@workspace/ui";
import {
  BotMessageSquare,
  Brain,
  FileText,
  FolderInput,
  Globe,
  ImageIcon,
  Pencil,
  Plug,
  Search,
  Sparkles,
  Terminal,
  Trash2,
  Wrench,
} from "lucide-react";
import { createTranslator } from "next-intl";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import type { AgentChatPermissionOption } from "@/features/agent/lib/agent-chat-types";
import type {
  AgentMessage,
  AgentSessionOpRequest,
  AgentToolKind,
} from "@atmos/api-types/ws/dto/agent-chat";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import { deriveAgentActivityState } from "@atmos/agent-transcript";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { isLiveBackgroundToolCall } from "@/features/agent/lib/agent/background-command";
import { formatAgentToolActivityLine } from "@/features/agent/lib/tool-results/tool-activity-line";

export interface PendingPermission {
  request_id: string;
  tool: string;
  description: string;
  content_markdown?: string;
  /** Structured createPlan todos for ApprovalCard To-dos (prefer over markdown `- [ ]`). */
  plan_todos?: Array<{ id?: string | null; content: string; status?: string }>;
  risk_level: string;
  options: AgentChatPermissionOption[];
  questions?: Array<{ id: string; prompt: string; options?: string[] }>;
}

export type PendingSessionOp = AgentSessionOpRequest;

export interface DiffFileOutput {
  old_content: string;
  new_content: string;
  name?: string;
}

export type AgentActivity =
  | { busy: false }
  | {
      busy: true;
      label: string;
      kind: "thinking" | "working";
      /** When `none`, the transcript indicator does not append "...". */
      trail?: "ellipsis" | "none";
    };

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
    | "tool.execute"
    | "tool.fetch"
    | "tool.delete"
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
    | "activity.waitingForBackgroundAgent"
    | "activity.waitingForBackgroundAgents"
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
} from "@/shared/stores/use-ui-pref-hooks";

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
      return React.createElement(BotMessageSquare);
    case "mcp_list":
    case "mcp_call":
      return React.createElement(Plug);
    case "image_gen":
      return React.createElement(ImageIcon);
    case "plan_document":
      return React.createElement(FileText);
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
    case "generateimage":
    case "generate_image":
    case "image_gen":
    case "imagegen":
    case "image_edit":
    case "imageedit":
      return React.createElement(ImageIcon);
    case "createplan":
    case "create_plan":
    case "updateplan":
    case "update_plan":
      return React.createElement(FileText);
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

export function isSkillInvocation(
  raw_input?: unknown,
): raw_input is Record<string, unknown> & { skill?: string; command?: string } {
  if (!raw_input || typeof raw_input !== "object") return false;
  const o = raw_input as Record<string, unknown>;
  return "skill" in o && typeof o.skill === "string" && o.skill.length > 0;
}

export function isSkillCommand(
  raw_input?: unknown,
): raw_input is Record<string, unknown> & { command: string } {
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
    t === "execute" ||
    t === "run_command" ||
    t === "bash" ||
    t === "shell" ||
    t === "terminal" ||
    t === "command" ||
    t === "run_terminal_cmd" ||
    t === "powershell" ||
    t === "cmd" ||
    t.endsWith("_bash") ||
    t.endsWith("_shell")
  );
}

export function isDiffString(s: string): boolean {
  const t = s.trimStart();
  return (
    t.startsWith("--- ") || t.startsWith("diff --git ") || t.startsWith("*** ") || /^@@ /.test(t)
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

function toolKindHeadlineLabel(kind: AgentToolKind): string {
  switch (kind) {
    case "read":
      return chatHelpersT("tool.read", "Read");
    case "edit":
      return chatHelpersT("tool.edit", "Edit");
    case "search":
    case "web_search":
      return chatHelpersT("tool.search", "Search");
    case "execute":
      return chatHelpersT("tool.execute", "Execute");
    case "fetch":
      return chatHelpersT("tool.fetch", "Fetch");
    case "delete":
      return chatHelpersT("tool.delete", "Delete");
    case "move":
      return chatHelpersT("tool.move", "Move");
    case "skill":
    case "subagent":
    case "mcp_list":
    case "mcp_call":
    case "image_gen":
    case "plan_document":
    case "other":
      return chatHelpersT("tool.generic", "Tool");
  }
}

function activityLabel(
  state: Extract<ReturnType<typeof deriveAgentActivityState>, { busy: true }>,
): string {
  switch (state.label.type) {
    case "generating":
      return chatHelpersT("activity.generating", "Generating");
    case "thinking":
      return chatHelpersT("activity.thinking", "Thinking");
    case "streaming":
      return chatHelpersT("activity.streaming", "Streaming");
    case "creatingSession":
      return chatHelpersT("activity.creatingSession", "Creating session");
    case "resumingSession":
      return chatHelpersT("activity.resumingSession", "Resuming session");
    case "waiting":
      return state.label.count <= 1
        ? chatHelpersT(
            "activity.waitingForBackgroundAgent",
            "Waiting for 1 background agent to finish",
          )
        : chatHelpersT(
            "activity.waitingForBackgroundAgents",
            "Waiting for {count} background agents to finish",
            { count: state.label.count },
          );
    case "tool":
      return formatAgentToolActivityLine(
        state.label.part,
        toolKindHeadlineLabel(state.label.part.kind),
      );
  }
}

export { isSessionChromeOnly, shouldShowAssistantTurnEndedChrome } from "@atmos/agent-transcript";

/**
 * Derive the composer/transcript activity indicator.
 * `turnOpen` is the host busy flag (running turn / waiting permission), not
 * "waiting for the first assistant row" — after session create the last row is
 * already an assistant with completed lifecycle chrome, and we must stay busy
 * until real content or turn_completed.
 */
export function deriveAgentActivity(messages: AgentMessage[], turnOpen: boolean): AgentActivity {
  const state = deriveAgentActivityState(messages, turnOpen);
  if (!state.busy) return { busy: false };
  return {
    busy: true,
    kind: state.kind,
    label: activityLabel(state),
    ...(state.trail === "none" ? { trail: "none" as const } : {}),
  };
}

/**
 * Composer idle is host-turn settlement, not "no open text part".
 * After the last tool, Grok (and others) sit in prefill with every part
 * closed — that is still a live turn. Clearing busy here flips the input
 * back to send and drops Generating.
 */
export function shouldClearComposerBusy(payloadType: string, liveTurn: boolean): boolean {
  if (liveTurn) return false;
  return payloadType === "turn_completed";
}
