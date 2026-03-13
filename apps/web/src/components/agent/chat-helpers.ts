import React from "react";
import type { ToolState } from "@workspace/ui";
import { Brain, FileText, FolderInput, Globe, Pencil, Search, Terminal, Trash2, Wrench } from "lucide-react";
import type { AcpPermissionOption } from "@/hooks/use-agent-session";
import type { AssistantEntry, ThreadEntry, ToolCallBlock } from "@/lib/agent/thread";
import { isPlanUpdateToolCall } from "@/lib/agent/thread";

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

export const DEFAULT_AGENT_STORAGE_KEY = "atmos.agent.default_registry_id";

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
  return "Skill";
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
      const verb = tool === "Read" || tool === "read" ? "Read" : tool === "Edit" || tool === "edit" ? "Edit" : tool;
      return verb && verb !== "Tool" && verb !== "Other" ? `${verb}: ${shortPath}` : shortPath;
    }
    if (command) {
      const shortCmd = command.length > 60 ? `${command.slice(0, 57)}...` : command;
      return `Execute: ${shortCmd}`;
    }
    if (url) return `Fetch: ${url.length > 50 ? `${url.slice(0, 47)}...` : url}`;
    if (toolName) return String(toolName);
  }
  if (tool && tool !== "Tool" && tool !== "Other") return tool;
  return description || "Tool";
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
  mode: string
): string {
  if (workspaceId) return `workspace:${workspaceId}:${mode}`;
  if (projectId) return `project:${projectId}:${mode}`;
  return `temp:${mode}`;
}

export function readDefaultAgentRegistryId(): string | null {
  try {
    const raw = localStorage.getItem(DEFAULT_AGENT_STORAGE_KEY);
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

export function writeDefaultAgentRegistryId(registryId: string): void {
  try {
    if (!registryId) return;
    localStorage.setItem(DEFAULT_AGENT_STORAGE_KEY, registryId);
  } catch {
    // Ignore storage failure
  }
}

export function sanitizeConversationFilename(value: string): string {
  const trimmed = value.trim().replace(/[\\/:*?"<>|]/g, "-");
  return trimmed.length > 0 ? trimmed : "conversation";
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
    if (waitingFirst) return { busy: true, label: "Generating" };
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
          tool === "Read" ? "Reading" :
            tool === "Edit" ? "Writing" :
              tool === "Search" ? "Searching" :
                tool === "Execute" ? "Running command" :
                  tool === "Fetch" ? "Fetching" :
                    tool === "Delete" ? "Deleting" :
                      tool === "Think" || tool === "Thought" || tool === "Reasoning" || tool === "Reason" ? "Thinking" :
                        tool === "Tool" ? (block.description || "Working") :
                          tool;
        return { busy: true, label };
      }
    }
  }

  if (assistant.isStreaming) {
    for (let i = assistant.blocks.length - 1; i >= 0; i--) {
      const block = assistant.blocks[i];
      if (block.type === "thinking") return { busy: true, label: "Thinking" };
      if (block.type === "text") return { busy: true, label: "Streaming" };
    }
    return { busy: true, label: "Streaming" };
  }

  if (waitingFirst) return { busy: true, label: "Generating" };
  return { busy: false };
}
