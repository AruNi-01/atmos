"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "streamdown/styles.css";
import { motion, AnimatePresence } from "motion/react";
import { PatchDiff, MultiFileDiff } from "@pierre/diffs/react";
import type { FileContents } from "@pierre/diffs";
import { useTheme } from "next-themes";
import { useContextParams } from "@/hooks/use-context-params";
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageContent,
  MessageResponse,
  Popover,
  PopoverContent,
  PopoverTrigger,
  PromptInput,
  PromptInputAddAttachmentsButton,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  ScrollArea,
  Skill,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolState,
  usePromptInputAttachments,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  TextShimmer,
  AcpTerminal,
  AcpTerminalHeader,
  AcpTerminalTitle,
  AcpTerminalStatus,
  AcpTerminalActions,
  AcpTerminalCopyButton,
  AcpTerminalContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui";
import { Bot, Brain, ChevronDown, ChevronUp, Copy, Check, Folder, FolderInput, Globe, Heart, History, Loader2, MessageSquare, Pencil, Plus, Search, Square, Terminal, Trash2, Wrench, X, FileText, CircleCheck, CircleDashed, BookOpen } from "lucide-react";
import { useProjectStore } from "@/hooks/use-project-store";
import { useDialogStore } from "@/hooks/use-dialog-store";
import { useAgentChatUrl } from "@/hooks/use-agent-chat-url";
import { useAgentChatLayout } from "@/hooks/use-agent-chat-layout";
import { useAgentChatStatusStore } from "@/hooks/use-agent-chat-status";
import { AgentIcon } from "./AgentIcon";
import { useAgentSession, type AgentServerMessage, type AcpPermissionOption, type AgentPlan } from "@/hooks/use-agent-session";
import { agentApi } from "@/api/ws-api";
import { agentApi as agentRestApi, type AgentChatSessionItem } from "@/api/rest-api";
import { formatLocalDateTime } from "@atmos/shared";
import type { RegistryAgent } from "@/api/ws-api";
import { DEFAULT_AGENT_CHAT_MODE, type AgentChatMode } from "@/types/agent-chat";
import { useWikiExists, useWikiStore } from "@/hooks/use-wiki-store";
import { useEditorStore } from "@/hooks/use-editor-store";

// ---------------------------------------------------------------------------
// Zed-style ACP Entry Model
// ---------------------------------------------------------------------------

interface ToolCallBlock {
  type: "tool_call";
  tool_call_id: string;
  tool: string;
  description: string;
  status: string;
  raw_input?: unknown;
  raw_output?: unknown;
  detail?: unknown;
}

function isPlanUpdateToolCall(block: ToolCallBlock): boolean {
  const tool = (block.tool || "").toLowerCase();
  const description = (block.description || "").toLowerCase();
  if (tool === "todowrite" || tool === "todo_write") return true;
  if (description.includes("todo list updated")) return true;
  if (block.raw_output && typeof block.raw_output === "object") {
    const text = (block.raw_output as Record<string, unknown>).text;
    if (typeof text === "string" && text.toLowerCase().includes("todo list updated")) {
      return true;
    }
  }
  return false;
}

function getToolIcon(tool: string): React.ReactNode {
  switch ((tool || "").toLowerCase()) {
    case "read":
      return <FileText />;
    case "edit":
      return <Pencil />;
    case "delete":
      return <Trash2 />;
    case "move":
      return <FolderInput />;
    case "search":
      return <Search />;
    case "execute":
      return <Terminal />;
    case "think":
      return <Brain />;
    case "fetch":
      return <Globe />;
    case "other":
    case "tool":
    default:
      return <Wrench />;
  }
}

function isGenericToolName(name?: string): boolean {
  const v = (name || "").trim().toLowerCase();
  return !v || v === "tool" || v === "other";
}

interface TextBlock {
  type: "text";
  content: string;
}

interface ThinkingBlock {
  type: "thinking";
  content: string;
}

interface PlanBlock {
  type: "plan";
  plan: import("@/hooks/use-agent-session").AgentPlan;
}

type AssistantBlock = TextBlock | ThinkingBlock | ToolCallBlock | PlanBlock;

interface UserEntry {
  role: "user";
  content: string;
  files?: (import("ai").FileUIPart & { id: string })[];
}

interface AssistantEntry {
  role: "assistant";
  blocks: AssistantBlock[];
  isStreaming?: boolean;
}

type ThreadEntry = UserEntry | AssistantEntry;

interface PendingPermission {
  request_id: string;
  tool: string;
  description: string;
  risk_level: string;
  options: AcpPermissionOption[];
}

// ---------------------------------------------------------------------------
// Diff detection helpers
// ---------------------------------------------------------------------------

function isDiffString(s: string): boolean {
  const t = s.trimStart();
  return (
    t.startsWith("--- ") ||
    t.startsWith("diff --git ") ||
    t.startsWith("*** ") ||
    /^@@ /.test(t)
  );
}

interface DiffFileOutput {
  old_content: string;
  new_content: string;
  name?: string;
}

function isDiffObject(o: unknown): o is DiffFileOutput {
  if (!o || typeof o !== "object") return false;
  const obj = o as Record<string, unknown>;
  return typeof obj.old_content === "string" && typeof obj.new_content === "string";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LAST_CHAT_MODE_STORAGE_KEY = "atmos.agent.last_chat_mode";
const DEFAULT_AGENT_STORAGE_KEY = "atmos.agent.default_registry_id";

function readLastChatMode(): AgentChatMode {
  try {
    const raw = localStorage.getItem(LAST_CHAT_MODE_STORAGE_KEY);
    if (raw === "wiki_ask" || raw === "default") return raw;
  } catch {}
  return DEFAULT_AGENT_CHAT_MODE;
}

function writeLastChatMode(mode: AgentChatMode): void {
  try {
    localStorage.setItem(LAST_CHAT_MODE_STORAGE_KEY, mode);
  } catch {}
}

function getSessionContextKey(
  workspaceId: string | null,
  projectId: string | null,
  mode: AgentChatMode
): string {
  if (workspaceId) return `workspace:${workspaceId}:${mode}`;
  if (projectId) return `project:${projectId}:${mode}`;
  return `temp:${mode}`;
}

function readDefaultAgentRegistryId(): string | null {
  try {
    const raw = localStorage.getItem(DEFAULT_AGENT_STORAGE_KEY);
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

function writeDefaultAgentRegistryId(registryId: string): void {
  try {
    if (!registryId) return;
    localStorage.setItem(DEFAULT_AGENT_STORAGE_KEY, registryId);
  } catch {
    // Ignore storage failure
  }
}

function toolStatusToState(status: string): ToolState {
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

function isSkillInvocation(raw_input?: unknown): raw_input is Record<string, unknown> & { skill?: string; command?: string } {
  if (!raw_input || typeof raw_input !== "object") return false;
  const o = raw_input as Record<string, unknown>;
  return "skill" in o && typeof o.skill === "string" && o.skill.length > 0;
}

function isSkillCommand(raw_input?: unknown): raw_input is Record<string, unknown> & { command: string } {
  if (!raw_input || typeof raw_input !== "object") return false;
  const o = raw_input as Record<string, unknown>;
  const cmd = o.command;
  return typeof cmd === "string" && (cmd.startsWith("agent-browser") || cmd.includes("skill"));
}

function getSkillName(raw_input: Record<string, unknown>): string {
  if (typeof raw_input.skill === "string" && raw_input.skill) return raw_input.skill;
  const cmd = raw_input.command;
  if (typeof cmd === "string" && cmd.startsWith("agent-browser")) return "agent-browser";
  return "Skill";
}

function isTerminalCommand(tool: string): boolean {
  const t = (tool || "").toLowerCase();
  return t === "execute" || t === "run_command" || t === "bash" || t === "shell" || t === "terminal";
}

function getTerminalCommandString(raw_input?: unknown): string {
  if (!raw_input || typeof raw_input !== "object") return "";
  const o = raw_input as Record<string, unknown>;
  const cmd = o.command ?? o.cmd ?? o.input ?? o.script;
  return typeof cmd === "string" ? cmd : "";
}

// ---------------------------------------------------------------------------
// Entry reducer: processes ACP server messages into Zed-style thread entries
// ---------------------------------------------------------------------------

function reduceEntries(
  prev: ThreadEntry[],
  msg: AgentServerMessage,
): ThreadEntry[] {
  if (msg.type === "stream") {
    if (msg.role === "user") {
      const last = prev[prev.length - 1];
      if (last?.role === "user") {
        return [...prev.slice(0, -1), { ...last, content: `${last.content}${msg.delta}` }];
      }
      return [...prev, { role: "user", content: msg.delta }];
    }

    const isThinking = msg.kind === "thinking";
    const last = prev[prev.length - 1];

    if (last?.role === "assistant" && last.isStreaming) {
      const blocks = [...last.blocks];
      const lastBlock = blocks[blocks.length - 1];
      const expectedType: AssistantBlock["type"] = isThinking ? "thinking" : "text";

      if (lastBlock?.type === expectedType) {
        blocks[blocks.length - 1] = {
          ...lastBlock,
          content: (lastBlock as TextBlock | ThinkingBlock).content + msg.delta,
        } as TextBlock | ThinkingBlock;
      } else {
        blocks.push({ type: expectedType, content: msg.delta } as TextBlock | ThinkingBlock);
      }

      return [
        ...prev.slice(0, -1),
        { ...last, blocks, isStreaming: !msg.done },
      ];
    }

    return [
      ...prev,
      {
        role: "assistant",
        blocks: [{ type: isThinking ? "thinking" : "text", content: msg.delta } as TextBlock | ThinkingBlock],
        isStreaming: !msg.done,
      },
    ];
  }

  if (msg.type === "tool_call") {
    const id = msg.tool_call_id ?? "";
    const isTerminal = msg.status === "completed" || msg.status === "failed";
    const newBlock: ToolCallBlock = {
      type: "tool_call",
      tool_call_id: id,
      tool: msg.tool,
      description: msg.description,
      status: msg.status,
      raw_input: msg.raw_input,
      raw_output: msg.raw_output,
      detail: msg.detail,
    };

    // Finalize any streaming assistant text accumulator on tool event
    const entries = [...prev];
    const lastEntry = entries[entries.length - 1];
    if (lastEntry?.role === "assistant" && lastEntry.isStreaming) {
      entries[entries.length - 1] = { ...lastEntry, isStreaming: false };
    }

    // Only bind tool updates to the current turn's assistant entry (must be last entry).
    // If latest entry is a user prompt, create a new assistant entry right after it.
    let assistantIdx = -1;
    const lastIdx = entries.length - 1;
    if (lastIdx >= 0 && entries[lastIdx].role === "assistant") {
      assistantIdx = lastIdx;
    }

    if (assistantIdx >= 0) {
      const assistant = entries[assistantIdx] as AssistantEntry;
      const blocks = [...assistant.blocks];

      // Try to find existing tool call block to update
      let toolIdx = -1;
      if (id) {
        toolIdx = blocks.findIndex(
          (b) => b.type === "tool_call" && b.tool_call_id === id
        );
      }
      // Fallback for terminal status: match by raw_input or last running
      if (toolIdx < 0 && isTerminal) {
        const incoming = msg.raw_input as Record<string, unknown> | undefined;
        if (incoming && typeof incoming === "object") {
          toolIdx = blocks.findIndex((b) => {
            if (b.type !== "tool_call" || b.status?.toLowerCase() !== "running") return false;
            const r = b.raw_input as Record<string, unknown> | undefined;
            if (!r || typeof r !== "object") return false;
            for (const k of ["file_path", "path", "url", "command"]) {
              if (incoming[k] != null && r[k] != null && String(incoming[k]) === String(r[k])) return true;
            }
            return false;
          });
        }
        if (toolIdx < 0) {
          for (let i = blocks.length - 1; i >= 0; i--) {
            if (blocks[i].type === "tool_call" && (blocks[i] as ToolCallBlock).status?.toLowerCase() === "running") {
              toolIdx = i;
              break;
            }
          }
        }
      }

      if (toolIdx >= 0) {
        const prevBlock = blocks[toolIdx] as ToolCallBlock;
        blocks[toolIdx] = {
          ...prevBlock,
          tool: isGenericToolName(msg.tool) ? prevBlock.tool : msg.tool,
          description: msg.description || prevBlock.description,
          status: msg.status,
          raw_input: msg.raw_input ?? prevBlock.raw_input,
          raw_output: msg.raw_output ?? prevBlock.raw_output,
          detail: msg.detail ?? prevBlock.detail,
        };
      } else {
        blocks.push(newBlock);
      }

      entries[assistantIdx] = { ...assistant, blocks };
      return entries;
    }

    // No assistant entry yet - create one with the tool call
    return [
      ...entries,
      {
        role: "assistant",
        blocks: [newBlock],
        isStreaming: false,
      },
    ];
  }

  if (msg.type === "error") {
    return [
      ...prev,
      {
        role: "assistant",
        blocks: [{ type: "text", content: `Error: ${msg.message}` }],
        isStreaming: false,
      },
    ];
  }

  if (msg.type === "plan_update") {
    const newBlock: PlanBlock = {
      type: "plan",
      plan: msg.plan,
    };
    const entries = [...prev];
    let assistantIdx = -1;
    const lastIdx = entries.length - 1;
    if (lastIdx >= 0 && entries[lastIdx].role === "assistant") {
      assistantIdx = lastIdx;
    }

    if (assistantIdx >= 0) {
      const assistant = entries[assistantIdx] as AssistantEntry;
      const blocks = [...assistant.blocks];
      const planIdx = blocks.findIndex((b) => b.type === "plan");
      if (planIdx >= 0) {
        blocks[planIdx] = newBlock;
      } else {
        blocks.push(newBlock);
      }
      entries[assistantIdx] = { ...assistant, blocks };
      return entries;
    }

    return [
      ...entries,
      {
        role: "assistant",
        blocks: [newBlock],
        isStreaming: false,
      },
    ];
  }

  return prev;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function deriveToolDisplayName(tool: string, description: string, raw_input?: unknown): string {
  // Prefer a meaningful description
  if (
    description &&
    description !== tool &&
    !/^(Processing|Executing|Running|Tool)\b/i.test(description)
  ) {
    return description;
  }
  // Extract from raw_input for common patterns
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

function CommandCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 px-2 py-1 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
      aria-label="Copy command"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function MessageCopyButton({
  text,
  ariaLabel,
  title,
  className = "",
}: {
  text: string;
  ariaLabel: string;
  title: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    void navigator.clipboard.writeText(trimmed).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [text]);

  return (
    <button
      type="button"
      className={`cursor-pointer ${className}`}
      onClick={handleCopy}
      aria-label={ariaLabel}
      title={title}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="copied"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="inline-flex size-3.5 items-center justify-center"
          >
            <Check className="size-3.5 text-green-500" />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="inline-flex size-3.5 items-center justify-center"
          >
            <Copy className="size-3.5" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

function getAssistantCopyText(entry: AssistantEntry): string {
  const parts: string[] = [];
  for (const block of entry.blocks) {
    if (block.type === "text" || block.type === "thinking") {
      if (block.content?.trim()) parts.push(block.content.trim());
      continue;
    }
    if (block.type === "tool_call") {
      if (isPlanUpdateToolCall(block)) continue;
      if (typeof block.raw_output === "string" && block.raw_output.trim()) {
        parts.push(block.raw_output.trim());
      } else if (typeof block.description === "string" && block.description.trim()) {
        parts.push(block.description.trim());
      }
    }
  }
  return parts.join("\n\n").trim();
}

function getAllAssistantMessagesCopyText(entries: ThreadEntry[]): string {
  const all = entries
    .filter((entry): entry is AssistantEntry => entry.role === "assistant")
    .map((entry) => getAssistantCopyText(entry))
    .filter((text) => !!text);
  return all.join("\n\n").trim();
}

function TerminalBlock({
  tool,
  description,
  status,
  raw_input,
  raw_output,
}: ToolCallBlock) {
  const state = toolStatusToState(status);
  const isRunning = state === "input-available";
  const isError = state === "output-error";
  const commandStr = getTerminalCommandString(raw_input);

  const terminalOutput = (() => {
    if (raw_output === undefined || raw_output === null) return "";
    if (typeof raw_output === "string") return raw_output;
    if (typeof raw_output === "object") {
      const o = raw_output as Record<string, unknown>;
      // Extract text from common ACP execute output fields (preserves ANSI codes)
      const parts: string[] = [];
      for (const key of ["output", "stdout", "content", "result", "text"]) {
        if (typeof o[key] === "string" && o[key]) parts.push(o[key] as string);
      }
      if (typeof o["stderr"] === "string" && o["stderr"]) {
        parts.push(o["stderr"] as string);
      }
      if (parts.length > 0) return parts.join("\n");
      // Fallback: stringify for unknown structures
      return JSON.stringify(raw_output, null, 2);
    }
    return String(raw_output);
  })();

  return (
    <AcpTerminal
      output={terminalOutput}
      isStreaming={isRunning}
      autoScroll
      className={isError ? "border-red-500/50 w-full" : "w-full"}
    >
      <AcpTerminalHeader>
        <AcpTerminalTitle>Run Script</AcpTerminalTitle>
        <div className="flex items-center gap-1">
          <AcpTerminalStatus />
          <AcpTerminalActions>
            <AcpTerminalCopyButton />
          </AcpTerminalActions>
        </div>
      </AcpTerminalHeader>
      {commandStr && (
        <div className="flex items-center border-b border-zinc-800">
          <div className="flex-1 min-w-0 overflow-x-auto px-4 py-2 font-mono text-sm text-zinc-300">
            <span className="whitespace-nowrap"><span className="text-green-400">$</span> {commandStr}</span>
          </div>
          <CommandCopyButton text={commandStr} />
        </div>
      )}
      <AcpTerminalContent className="max-h-60" />
    </AcpTerminal>
  );
}

function ToolOrSkillBlock(props: ToolCallBlock) {
  const {
    tool,
    description,
    status,
    raw_input,
    raw_output,
    detail,
  } = props;

  const { resolvedTheme } = useTheme();
  const diffTheme = resolvedTheme === "dark" ? "pierre-dark" : "pierre-light";
  const diffOptions = useMemo(() => ({
    theme: diffTheme,
    diffStyle: "unified" as const,
    overflow: "wrap" as const,
    disableLineNumbers: false,
    disableFileHeader: false,
  }), [diffTheme]);

  // Render terminal for execute commands
  if (isTerminalCommand(tool)) {
    return <TerminalBlock {...props} />;
  }

  const state = toolStatusToState(status);
  const isError = state === "output-error";
  const asSkill = isSkillInvocation(raw_input) || isSkillCommand(raw_input);

  const toolDisplayName = deriveToolDisplayName(tool, description, raw_input);

  const skillName = asSkill && raw_input && typeof raw_input === "object"
    ? getSkillName(raw_input as Record<string, unknown>)
    : toolDisplayName;

  // Detect diff output
  const diffPatch: string | null = (() => {
    if (!isError && typeof raw_output === "string" && isDiffString(raw_output)) {
      return raw_output;
    }
    return null;
  })();

  const diffFiles: { oldFile: FileContents; newFile: FileContents } | null = (() => {
    if (!isError && !diffPatch && isDiffObject(raw_output)) {
      const name = raw_output.name ?? "file";
      return {
        oldFile: { name, contents: raw_output.old_content },
        newFile: { name, contents: raw_output.new_content },
      };
    }
    return null;
  })();

  const output =
    raw_output !== undefined && raw_output !== null
      ? typeof raw_output === "string"
        ? raw_output
        : JSON.stringify(raw_output, null, 2)
      : !isError
        ? description || "Processing..."
        : undefined;

  const errorText = isError
    ? (() => {
      if (typeof raw_output === "string" && raw_output.trim()) return raw_output;
      if (raw_output && typeof raw_output === "object") {
        const obj = raw_output as Record<string, unknown>;
        const msg = obj.message ?? obj.error ?? obj.reason;
        if (typeof msg === "string" && msg.trim()) return msg;
        return JSON.stringify(raw_output, null, 2);
      }
      if (detail && typeof detail === "object") {
        const obj = detail as Record<string, unknown>;
        const msg = obj.message ?? obj.error ?? obj.reason;
        if (typeof msg === "string" && msg.trim()) return msg;
      }
      if (typeof detail === "string" && detail.trim()) return detail;
      if (description && description.trim() && description.trim().toLowerCase() !== "tool") return description;
      return "Execution failed";
    })()
    : null;

  const Wrapper = asSkill ? Skill : Tool;

  return (
    <Wrapper defaultOpen={false} className="w-full">
      <ToolHeader
        variant={asSkill ? "skill" : "tool"}
        state={state}
        title={asSkill ? `Skill: ${skillName}` : toolDisplayName}
        icon={asSkill ? undefined : getToolIcon(tool)}
      />
      <ToolContent>
        <ToolInput
          input={raw_input}
          label={asSkill ? "Args" : "Parameters"}
        />
        {diffPatch ? (
          <div className="mt-1 max-h-[360px] overflow-auto rounded-md border border-border/50">
            <PatchDiff patch={diffPatch} options={diffOptions} />
          </div>
        ) : diffFiles ? (
          <div className="mt-1 max-h-[360px] overflow-auto rounded-md border border-border/50">
            <MultiFileDiff
              oldFile={diffFiles.oldFile}
              newFile={diffFiles.newFile}
              options={diffOptions}
            />
          </div>
        ) : (
          <ToolOutput
            output={output}
            errorText={errorText}
          />
        )}
      </ToolContent>
    </Wrapper>
  );
}

function PlanBlockView({
  plan,
  docked = false,
  defaultOpen = true,
}: {
  plan: import("@/hooks/use-agent-session").AgentPlan;
  docked?: boolean;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (!plan || !plan.entries || plan.entries.length === 0) return null;

  const completedCount = plan.entries.filter((e) => e.status === "completed").length;
  const totalCount = plan.entries.length;
  const allCompleted = totalCount > 0 && completedCount === totalCount;
  const currentIndex = plan.entries.findIndex(
    (e) => e.status === "in_progress" || e.status === "running"
  );

  const currentRunningEntry = plan.entries[currentIndex];

  const PlanEntryScrollableText = ({
    text,
    className,
    shimmer = false,
  }: {
    text: string;
    className: string;
    shimmer?: boolean;
  }) => {
    const textRef = useRef<HTMLSpanElement>(null);
    const animRef = useRef<number | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const stopScroll = useCallback(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      const el = textRef.current;
      if (el) el.scrollLeft = 0;
    }, []);

    const startScroll = useCallback(() => {
      const el = textRef.current;
      if (!el) return;
      const overflow = el.scrollWidth - el.clientWidth;
      if (overflow <= 0) return;

      el.scrollLeft = 0;
      timeoutRef.current = setTimeout(() => {
        const duration = overflow * 40;
        const startTime = performance.now();

        const step = (now: number) => {
          const progress = Math.min((now - startTime) / duration, 1);
          el.scrollLeft = overflow * progress;
          if (progress < 1) {
            animRef.current = requestAnimationFrame(step);
          }
        };
        animRef.current = requestAnimationFrame(step);
      }, 300);
    }, []);

    useEffect(() => {
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (animRef.current) cancelAnimationFrame(animRef.current);
      };
    }, []);

    return (
      <span
        ref={textRef}
        className={className}
        onMouseEnter={startScroll}
        onMouseLeave={stopScroll}
      >
        {shimmer ? (
          <TextShimmer as="span" className="inline" duration={1.5}>
            {text}
          </TextShimmer>
        ) : (
          text
        )}
      </span>
    );
  };

  return (
    <div
      className={`w-full flex-col border border-dashed border-border bg-background flex overflow-hidden shadow-sm ${docked ? "rounded-t-xl rounded-b-none border-b-0" : "rounded-md"}`}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        {(isOpen || allCompleted) && (
          <CollapsibleTrigger asChild>
            <div className="flex items-center gap-2 p-3 hover:bg-muted/10 cursor-pointer transition-colors group">
              <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </span>
              <span className="text-sm font-medium text-foreground/90">Plan</span>
              <div className="flex-1" />
              <span className="text-sm text-muted-foreground mr-1">
                {allCompleted ? "All Done" : `${completedCount}/${totalCount}`}
              </span>
            </div>
          </CollapsibleTrigger>
        )}
        <CollapsibleContent>
          <div className="flex flex-col border-t border-border/40">
            {plan.entries.map((entry, idx) => {
              const isCompleted = entry.status === "completed";
              const isRunning = entry.status === "in_progress" || entry.status === "running";

              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 px-4 border-b border-border/20 last:border-b-0"
                >
                  <div className="shrink-0 flex items-center justify-center w-4 h-4">
                    {isCompleted ? (
                      <CircleCheck className="w-4 h-4 text-green-500" />
                    ) : isRunning ? (
                      <div className="relative flex items-center justify-center">
                        <CircleDashed className="w-4 h-4 text-[#3b82f6] animate-[spin_3s_linear_infinite]" />
                        <div className="absolute w-1.5 h-1.5 bg-[#3b82f6] rounded-full" />
                      </div>
                    ) : (
                      <CircleDashed className="w-4 h-4 text-muted-foreground/40" />
                    )}
                  </div>
                  <PlanEntryScrollableText
                    text={entry.content}
                    shimmer={isRunning}
                    className={`text-sm flex-1 overflow-hidden whitespace-nowrap ${isCompleted
                      ? "line-through text-muted-foreground/60"
                      : isRunning
                        ? "text-foreground font-medium"
                        : "text-muted-foreground/80"
                      }`}
                  />
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {!isOpen && currentRunningEntry && (
        <div
          className={`flex items-center gap-3 p-3 px-4 border-t border-border/40 bg-background overflow-hidden cursor-pointer ${docked ? "rounded-none" : "rounded-b-md"}`}
          onClick={() => setIsOpen(true)}
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90 shrink-0" />
          <div className="flex flex-1 items-center h-5 relative overflow-hidden">
            <span className="text-sm text-muted-foreground mr-1 font-normal shrink-0">Current:</span>
            <div className="flex-1 relative h-full overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={currentIndex}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="absolute inset-0 text-sm font-medium text-foreground truncate"
                >
                  <TextShimmer as="span" className="inline" duration={1.5}>
                    {currentRunningEntry.content}
                  </TextShimmer>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <span className="text-sm text-muted-foreground ml-2 shrink-0">
            {totalCount - currentIndex} left
          </span>
        </div>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Review path link detection – matches .atmos/reviews/**/*.md paths
// ---------------------------------------------------------------------------

const REVIEW_PATH_RE = /(?:\/[\w.~-]+)*\/\.atmos\/reviews\/[\w./:~-]+\.md/g;

function useReviewLinkComponents() {
  const { openFile } = useEditorStore();
  const { effectiveContextId } = useContextParams();

  return useMemo(() => {
    const handleOpen = (path: string) => {
      void openFile(path, effectiveContextId || undefined, { preview: true });
    };

    const ReviewCode = (props: React.ComponentPropsWithoutRef<"code"> & { node?: unknown }) => {
      const { children, node: _, ...rest } = props;
      const text = typeof children === "string" ? children : "";
      if (REVIEW_PATH_RE.test(text)) {
        REVIEW_PATH_RE.lastIndex = 0;
        const fileName = text.split("/").pop() || text;
        return (
          <button
            type="button"
            onClick={() => handleOpen(text)}
            className="inline-flex items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[0.85em] text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:bg-primary/20 hover:decoration-primary cursor-pointer"
            title={text}
          >
            <FileText className="size-3 shrink-0" />
            {fileName}
          </button>
        );
      }
      return <code {...rest}>{children}</code>;
    };

    return { code: ReviewCode };
  }, [openFile, effectiveContextId]);
}

function AssistantTurnView({ entry }: { entry: AssistantEntry }) {
  const reviewComponents = useReviewLinkComponents();

  return (
    <>
      {entry.blocks.map((block, i) => {
        if (block.type === "text") {
          if (!block.content) return null;
          const isLastTextBlock =
            entry.isStreaming &&
            !entry.blocks.slice(i + 1).some((b) => b.type === "text");
          return (
            <MessageResponse
              key={i}
              parseIncompleteMarkdown
              animated={isLastTextBlock}
              caret={isLastTextBlock ? "block" : undefined}
              className="break-words"
              components={reviewComponents}
            >
              {block.content}
            </MessageResponse>
          );
        }
        if (
          block.type === "thinking" ||
          (block.type === "tool_call" &&
            (block.tool.toLowerCase() === "think" ||
              block.tool.toLowerCase() === "thought"))
        ) {
          const content =
            block.type === "thinking"
              ? block.content
              : typeof block.raw_output === "string" && block.raw_output
                ? block.raw_output
                : typeof block.raw_input === "string" && block.raw_input
                  ? block.raw_input
                  : block.raw_input &&
                    typeof block.raw_input === "object" &&
                    (block.raw_input as Record<string, unknown>).thought
                    ? (block.raw_input as Record<string, unknown>).thought
                    : block.description;

          if (!content && block.type === "thinking") return null;

          const isCurrentlyThinking =
            (block.type === "thinking" &&
              entry.isStreaming &&
              i === entry.blocks.length - 1) ||
            (block.type === "tool_call" && block.status === "running");

          return (
            <Reasoning
              key={block.type === "thinking" ? `thinking-${i}` : block.tool_call_id || i}
              isStreaming={isCurrentlyThinking}
              defaultOpen={isCurrentlyThinking}
            >
              <ReasoningTrigger />
              <ReasoningContent className="break-words prose-sm dark:prose-invert max-w-full overflow-hidden">{String(content || "")}</ReasoningContent>
            </Reasoning>
          );
        }
        if (block.type === "plan") return null;

        if (block.type === "tool_call" && isPlanUpdateToolCall(block)) return null;

        return (
          <ToolOrSkillBlock key={block.tool_call_id || i} {...block as ToolCallBlock} />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Agent activity status
// ---------------------------------------------------------------------------

type AgentActivity =
  | { busy: false }
  | { busy: true; label: string };

function deriveAgentActivity(entries: ThreadEntry[], waitingFirst: boolean): AgentActivity {
  const last = entries[entries.length - 1];
  if (!last || last.role !== "assistant") {
    if (waitingFirst) return { busy: true, label: "Generating" };
    return { busy: false };
  }

  const assistant = last;
  // Find the last meaningful block
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

const SPINNER_NAMES = [
  "braille", "helix", "scan", "cascade", "orbit",
  "snake", "breathe", "pulse", "dna", "rain",
] as const;

function useUnicodeSpinner() {
  const [frame, setFrame] = useState(0);
  const [spinner, setSpinner] = useState<{ frames: readonly string[]; interval: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const name = SPINNER_NAMES[Math.floor(Math.random() * SPINNER_NAMES.length)];

    import("unicode-animations").then((mod) => {
      if (cancelled) return;
      const spinners = mod.default ?? mod;
      const s = spinners[name as keyof typeof spinners];
      if (s) setSpinner(s);
    });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!spinner) return;
    const timer = setInterval(() => {
      setFrame((f) => f + 1);
    }, spinner.interval);
    return () => clearInterval(timer);
  }, [spinner]);

  if (!spinner) return "⠋";
  return spinner.frames[frame % spinner.frames.length];
}

function AgentActivityIndicator({ activity }: { activity: AgentActivity & { busy: true } }) {
  const spinnerChar = useUnicodeSpinner();

  return (
    <div className="flex items-center gap-2 px-1 py-1.5 text-sm">
      <span className="inline-flex items-center font-mono text-sm leading-none text-muted-foreground/80 dark:text-muted-foreground">
        {spinnerChar}
      </span>
      <TextShimmer
        as="span"
        className="translate-y-px text-sm"
        duration={1.5}
      >
        {`${activity.label}...`}
      </TextShimmer>
    </div>
  );
}

function PromptInputAttachmentsSection() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <PromptInputHeader>
      <Attachments variant="inline">
        {attachments.files.map((a) => (
          <Attachment key={a.id} data={a} onRemove={() => attachments.remove(a.id)}>
            <AttachmentPreview />
            <AttachmentRemove />
          </Attachment>
        ))}
      </Attachments>
    </PromptInputHeader>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function AgentChatPanel() {
  const { workspaceId, projectId, effectiveContextId, currentView } = useContextParams();
  const [isAgentChatOpen, setAgentChatOpen] = useAgentChatUrl();
  const {
    pendingAgentChatPrompt,
    setPendingAgentChatPrompt,
    consumePendingAgentChatPrompt,
    peekPendingAgentChatPrompt,
    consumePendingAgentChatMode,
  } = useDialogStore();
  const [newSessionAgentsOpen, setNewSessionAgentsOpen] = useState(false);
  const [chatMode, setChatMode] = useState<AgentChatMode>(DEFAULT_AGENT_CHAT_MODE);
  const [entries, setEntries] = useState<ThreadEntry[]>([]);
  const [currentPlan, setCurrentPlan] = useState<AgentPlan | null>(null);
  const [installedAgents, setInstalledAgents] = useState<RegistryAgent[]>([]);
  const [registryId, setRegistryId] = useState<string>("");
  const [defaultRegistryId, setDefaultRegistryId] = useState<string>("");
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [hasLoadedAgents, setHasLoadedAgents] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const [messageNavIndex, setMessageNavIndex] = useState(-1);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState<AgentChatSessionItem[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isResumingHistory, setIsResumingHistory] = useState(false);
  const [isManualLoadingMessages, setIsManualLoadingMessages] = useState(false);
  const [isResumedSession, setIsResumedSession] = useState(false);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState("");
  const [headerHovered, setHeaderHovered] = useState(false);
  const [selectedAuthMethodId, setSelectedAuthMethodId] = useState<string>("");
  const [activeSessionByContext, setActiveSessionByContext] = useState<Record<string, string>>(
    {}
  );
  const activeSessionByContextRef = useRef<Record<string, string>>({});
  const entriesByContextRef = useRef<Record<string, ThreadEntry[]>>({});
  const planByContextRef = useRef<Record<string, AgentPlan | null>>({});
  const sessionTitleByContextRef = useRef<Record<string, string | null>>({});
  const { projects, fetchProjects } = useProjectStore();
  const restoreAttemptedRef = useRef(false);
  const autoResumeTriedRef = useRef<string | null>(null);
  const autoStartHandledRef = useRef(false);
  const stoppedRef = useRef(false);
  const forcedDisconnectDoneRef = useRef(false);
  const closeAgentsMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousModeRef = useRef<AgentChatMode>(chatMode);
  const connectedContextKeyRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // Draggable & Resizable layout
  // ---------------------------------------------------------------------------
  const { layout, updateLayout, loaded: layoutLoaded, loadLayout } = useAgentChatLayout();

  useEffect(() => {
    loadLayout();
  }, [loadLayout]);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const dragAbortController = useRef<AbortController | null>(null);
  const resizeState = useRef<{ startX: number; startY: number; origW: number; origH: number; origX: number; origY: number; edge: string } | null>(null);
  const resizeAbortController = useRef<AbortController | null>(null);

  // Resolve "auto" position (-1) to bottom-right
  const resolvePosition = useCallback(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const h = typeof window !== 'undefined' ? window.innerHeight : 1080;
    return {
      x: layout.x < 0 ? w - layout.width - 24 : layout.x,
      y: layout.y < 0 ? h - layout.height - 24 : layout.y,
    };
  }, [layout]);

  // Clamp position so panel stays on screen
  const clamp = useCallback((x: number, y: number, w: number, h: number) => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
    return {
      x: Math.max(0, Math.min(x, vw - w)),
      y: Math.max(0, Math.min(y, vh - h)),
    };
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // Don't start drag from interactive elements
    if ((e.target as HTMLElement).closest('button, input, textarea, [role="button"], [data-radix-popper-content-wrapper]')) return;
    e.preventDefault();
    const pos = resolvePosition();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };

    const handleMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      const clamped = clamp(dragState.current.origX + dx, dragState.current.origY + dy, layout.width, layout.height);
      updateLayout({ x: clamped.x, y: clamped.y });
    };
    const handleUp = () => {
      dragState.current = null;
      dragAbortController.current?.abort();
      dragAbortController.current = null;
    };

    // Use AbortController for automatic cleanup
    dragAbortController.current = new AbortController();
    const { signal } = dragAbortController.current;
    document.addEventListener('mousemove', handleMove, { signal });
    document.addEventListener('mouseup', handleUp, { signal });
  }, [resolvePosition, clamp, layout.width, layout.height, updateLayout]);

  // Resize handlers
  const MIN_W = 320;
  const MIN_H = 300;
  const handleResizeStart = useCallback((edge: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = resolvePosition();
    resizeState.current = { startX: e.clientX, startY: e.clientY, origW: layout.width, origH: layout.height, origX: pos.x, origY: pos.y, edge };

    const handleMove = (ev: MouseEvent) => {
      if (!resizeState.current) return;
      const s = resizeState.current;
      const dx = ev.clientX - s.startX;
      const dy = ev.clientY - s.startY;
      let newW = s.origW;
      let newH = s.origH;
      let newX = s.origX;
      let newY = s.origY;

      if (s.edge.includes('e')) newW = Math.max(MIN_W, s.origW + dx);
      if (s.edge.includes('w')) { newW = Math.max(MIN_W, s.origW - dx); newX = s.origX + s.origW - newW; }
      if (s.edge.includes('s')) newH = Math.max(MIN_H, s.origH + dy);
      if (s.edge.includes('n')) { newH = Math.max(MIN_H, s.origH - dy); newY = s.origY + s.origH - newH; }

      const clamped = clamp(newX, newY, newW, newH);
      updateLayout({ width: newW, height: newH, x: clamped.x, y: clamped.y });
    };
    const handleUp = () => {
      resizeState.current = null;
      resizeAbortController.current?.abort();
      resizeAbortController.current = null;
    };

    // Use AbortController for automatic cleanup
    resizeAbortController.current = new AbortController();
    const { signal } = resizeAbortController.current;
    document.addEventListener('mousemove', handleMove, { signal });
    document.addEventListener('mouseup', handleUp, { signal });
  }, [resolvePosition, clamp, layout.width, layout.height, updateLayout]);

  // Cleanup abort controllers on unmount
  useEffect(() => {
    return () => {
      dragAbortController.current?.abort();
      dragAbortController.current = null;
      resizeAbortController.current?.abort();
      resizeAbortController.current = null;
    };
  }, []);

  // Keep panel on screen when window resizes
  useEffect(() => {
    const handleWindowResize = () => {
      if (layout.x < 0 && layout.y < 0) return; // still auto
      const clamped = clamp(layout.x, layout.y, layout.width, layout.height);
      if (clamped.x !== layout.x || clamped.y !== layout.y) {
        updateLayout(clamped);
      }
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [layout, clamp, updateLayout]);

  useEffect(() => {
    if (isAgentChatOpen && projects.length === 0) {
      fetchProjects();
    }
  }, [isAgentChatOpen, projects.length, fetchProjects]);

  const localPath = React.useMemo(() => {
    if (!effectiveContextId) return null;
    for (const p of projects) {
      const found = p.workspaces.find((w) => w.id === effectiveContextId);
      if (found) return found.localPath;
      if (p.id === effectiveContextId) return p.mainFilePath;
    }
    return null;
  }, [projects, effectiveContextId]);

  // When viewing a workspace, resolve the parent project ID so wiki_ask
  // sessions can be scoped to the project (wiki lives in project .atmos/).
  const parentProjectId = React.useMemo(() => {
    if (!workspaceId) return null;
    for (const p of projects) {
      if (p.workspaces.find((w) => w.id === workspaceId)) return p.id;
    }
    return null;
  }, [projects, workspaceId]);

  // Wiki path: always use project's mainFilePath (wiki is stored in the main
  // project directory, not in workspace worktree directories).
  const wikiPath = React.useMemo(() => {
    if (!effectiveContextId) return null;
    for (const p of projects) {
      if (p.workspaces.find((w) => w.id === effectiveContextId)) return p.mainFilePath;
      if (p.id === effectiveContextId) return p.mainFilePath;
    }
    return null;
  }, [projects, effectiveContextId]);

  const wikiExists = useWikiExists(effectiveContextId);
  const checkWikiExists = useWikiStore((s) => s.checkWikiExists);
  const isProjectScopedView = currentView === "workspace" || currentView === "project";
  const hasBoundContext = workspaceId != null || projectId != null;
  const wikiAskAvailability = useMemo(() => {
    if (!hasBoundContext || !isProjectScopedView) {
      return { enabled: false, reason: "Only available in Project or Workspace" as const };
    }
    if (wikiExists !== true) {
      return { enabled: false, reason: "Generate Wiki first to use Wiki Ask" as const };
    }
    return { enabled: true, reason: null };
  }, [hasBoundContext, isProjectScopedView, wikiExists]);

  useEffect(() => {
    if (!effectiveContextId || !wikiPath || !isProjectScopedView) return;
    if (wikiExists !== null) return;
    void checkWikiExists(effectiveContextId, wikiPath);
  }, [checkWikiExists, effectiveContextId, isProjectScopedView, wikiPath, wikiExists]);

  // For wiki_ask mode in a workspace, session context should use the parent
  // project (wiki data lives in project .atmos/, not workspace worktree).
  // These effective IDs are used for session creation, context key, history, and resume.
  const sessionWorkspaceId = chatMode === "wiki_ask" && workspaceId && parentProjectId
    ? null
    : workspaceId;
  const sessionProjectId = chatMode === "wiki_ask" && workspaceId && parentProjectId
    ? parentProjectId
    : projectId;

  useEffect(() => {
    if (!isAgentChatOpen) return;
    const pendingMode = consumePendingAgentChatMode();
    if (!pendingMode) return;
    if (pendingMode === "wiki_ask" && !wikiAskAvailability.enabled) {
      setChatMode("default");
      return;
    }
    setChatMode(pendingMode);
  }, [consumePendingAgentChatMode, isAgentChatOpen, wikiAskAvailability.enabled]);

  useEffect(() => {
    if (chatMode !== "wiki_ask") return;
    if (wikiAskAvailability.enabled) return;
    // Only override when wiki is confirmed missing (wikiExists === false).
    // When wikiExists is null (still loading), keep current mode to avoid overriding
    // a restored preference before the check completes.
    if (wikiExists !== false) return;
    setChatMode("default");
  }, [chatMode, wikiAskAvailability.enabled, wikiExists]);

  // Restore last-used chat mode from localStorage on mount (SSR-safe; localStorage
  // doesn't exist on server, so we can only read it client-side in useEffect).
  useEffect(() => {
    const saved = readLastChatMode();
    if (saved !== chatMode) {
      setChatMode(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist last-used chat mode so refresh restores the correct mode.
  useEffect(() => {
    writeLastChatMode(chatMode);
  }, [chatMode]);

  // Persist on panel close so the mode used when closing is definitely saved.
  useEffect(() => {
    if (!isAgentChatOpen) {
      writeLastChatMode(chatMode);
    }
  }, [isAgentChatOpen, chatMode]);

  const handleMessage = useCallback((msg: AgentServerMessage) => {
    switch (msg.type) {
      case "stream":
        if (stoppedRef.current) return; // user stopped, discard
        setEntries((prev) => reduceEntries(prev, msg));
        break;
      case "tool_call":
        if (stoppedRef.current) return; // user stopped, discard
        setEntries((prev) => reduceEntries(prev, msg));
        break;
      case "plan_update":
        if (stoppedRef.current) return; // user stopped, discard
        setCurrentPlan(msg.plan);
        break;
      case "permission_request":
        setPendingPermission({
          request_id: msg.request_id,
          tool: msg.tool,
          description: msg.description,
          risk_level: msg.risk_level,
          options: msg.options ?? [],
        });
        break;
      case "error":
        stoppedRef.current = false;
        setWaitingForResponse(false);
        setEntries((prev) => reduceEntries(prev, msg));
        break;
      case "turn_end":
        stoppedRef.current = false;
        setWaitingForResponse(false);
        setEntries((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.isStreaming) {
            return [...prev.slice(0, -1), { ...last, isStreaming: false }];
          }
          return prev;
        });
        break;
      case "session_ended":
        stoppedRef.current = false;
        setWaitingForResponse(false);
        break;
      case "load_completed":
        stoppedRef.current = false;
        setWaitingForResponse(false);
        setIsResumingHistory(false);
        setEntries((prev) => {
          // Close isStreaming on ALL assistant entries left open after replay
          let changed = false;
          const next = prev.map((entry) => {
            if (entry.role === "assistant" && entry.isStreaming) {
              changed = true;
              return { ...entry, isStreaming: false };
            }
            return entry;
          });
          return changed ? next : prev;
        });
        break;
    }
  }, []);

  const {
    sessionId,
    isConnecting,
    isConnected,
    connectionPhase,
    error,
    authRequest,
    sendPrompt,
    sendCancel,
    sendPermissionResponse,
    startSession,
    resumeSession,
    clearAuthRequest,
    disconnect,
    stashSession,
    unstashSession,
    disconnectStashed,
    sessionCwd,
    sessionTitle: activeSessionTitle,
    configOptions,
    setConfigOption,
    setAgentDefaultConfig,
  } = useAgentSession({
    workspaceId: sessionWorkspaceId,
    projectId: sessionProjectId,
    registryId,
    mode: chatMode,
    onMessage: handleMessage,
  });

  // Publish readiness to global store so other components can check before sending prompts
  const setStatusHasAgents = useAgentChatStatusStore((s) => s.setHasInstalledAgents);
  const setStatusConnected = useAgentChatStatusStore((s) => s.setIsConnected);
  const setStatusBusy = useAgentChatStatusStore((s) => s.setIsBusy);
  useEffect(() => { setStatusHasAgents(installedAgents.length > 0); }, [installedAgents.length, setStatusHasAgents]);
  useEffect(() => { setStatusConnected(isConnected); }, [isConnected, setStatusConnected]);
  useEffect(() => { setStatusBusy(waitingForResponse); }, [waitingForResponse, setStatusBusy]);

  const loadHistorySessions = useCallback(
    async (cursor?: string) => {
      setHistoryLoading(true);
      try {
        const contextType =
          sessionWorkspaceId != null ? "workspace" : sessionProjectId != null ? "project" : "temp";
        const contextGuid = sessionWorkspaceId ?? sessionProjectId ?? undefined;
        const res = await agentRestApi.listSessions({
          context_type: contextType,
          context_guid: contextGuid,
          mode: chatMode,
          limit: 20,
          cursor,
        });
        if (cursor) {
          setHistorySessions((prev) => [...prev, ...res.items]);
        } else {
          setHistorySessions(res.items);
        }
        setHistoryCursor(res.next_cursor);
        setHistoryHasMore(res.has_more);
      } catch {
        setHistorySessions([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [sessionWorkspaceId, sessionProjectId, chatMode]
  );

  useEffect(() => {
    if (!historyOpen) return;
    setHistorySessions([]);
    setHistoryCursor(null);
    loadHistorySessions();
  }, [historyOpen, loadHistorySessions]);

  const skipNextAutoConnectRef = useRef(false);
  const contextKey = React.useMemo(
    () => getSessionContextKey(sessionWorkspaceId, sessionProjectId, chatMode),
    [sessionWorkspaceId, sessionProjectId, chatMode]
  );

  // Compute effective session IDs for a given mode (wiki_ask in workspace → project context)
  const getEffectiveIds = useCallback((mode: AgentChatMode) => {
    const isWikiInWorkspace = mode === "wiki_ask" && workspaceId && parentProjectId;
    return {
      wId: isWikiInWorkspace ? null : workspaceId,
      pId: isWikiInWorkspace ? parentProjectId : projectId,
    };
  }, [workspaceId, projectId, parentProjectId]);

  useEffect(() => {
    const previousMode = previousModeRef.current;
    if (previousMode === chatMode) return;
    previousModeRef.current = chatMode;
    const prevIds = getEffectiveIds(previousMode);
    const nextIds = getEffectiveIds(chatMode);
    const previousContextKey = getSessionContextKey(prevIds.wId, prevIds.pId, previousMode);
    const nextContextKey = getSessionContextKey(nextIds.wId, nextIds.pId, chatMode);

    // ---- save outgoing session ----
    if (sessionId) {
      const nextMap = {
        ...activeSessionByContextRef.current,
        [previousContextKey]: sessionId,
      };
      activeSessionByContextRef.current = nextMap;
      setActiveSessionByContext(nextMap);
    }
    entriesByContextRef.current[previousContextKey] = entries;
    planByContextRef.current[previousContextKey] = currentPlan;
    sessionTitleByContextRef.current[previousContextKey] = sessionTitle;

    // Stash the live WS connection (stays open in background).
    stashSession(previousContextKey);

    // ---- restore incoming session ----
    setEntries(entriesByContextRef.current[nextContextKey] ?? []);
    setCurrentPlan(planByContextRef.current[nextContextKey] ?? null);
    setPendingPermission(null);
    setSessionTitle(sessionTitleByContextRef.current[nextContextKey] ?? null);
    setWaitingForResponse(false);
    stoppedRef.current = false;

    // Try to instantly restore a stashed session for the new mode.
    const restoredSessionId = unstashSession(nextContextKey);

    if (restoredSessionId) {
      // Seamless switch – already connected.
      activeSessionByContextRef.current[nextContextKey] = restoredSessionId;
      setActiveSessionByContext((prev) => ({ ...prev, [nextContextKey]: restoredSessionId }));
      setIsResumedSession(true);
      setIsResumingHistory(false);
      restoreAttemptedRef.current = true;
      autoStartHandledRef.current = true;
      // Sync connectedContextKeyRef so the effect below won't mistakenly
      // disconnect when it sees contextKey changed.
      connectedContextKeyRef.current = nextContextKey;
      autoResumeTriedRef.current = restoredSessionId;
    } else {
      // No stashed session (e.g. after refresh). Query DB for the most recent session.
      restoreAttemptedRef.current = true;
      autoStartHandledRef.current = true;
      setIsResumingHistory(true);
      void (async () => {
        try {
          const contextType = nextIds.wId != null ? "workspace" : nextIds.pId != null ? "project" : "temp";
          const contextGuid = nextIds.wId ?? nextIds.pId ?? undefined;
          const res = await agentRestApi.listSessions({
            context_type: contextType,
            context_guid: contextGuid,
            mode: chatMode,
            limit: 1,
          });
          const latestSession = res.items[0];
          if (latestSession) {
            autoResumeTriedRef.current = latestSession.guid;
            setIsResumedSession(true);
            const success = await resumeSession(latestSession.guid);
            if (!success) {
              setIsResumingHistory(false);
              autoStartHandledRef.current = false;
              restoreAttemptedRef.current = false;
              autoResumeTriedRef.current = null;
              setIsResumedSession(false);
              startSession();
            }
          } else {
            setIsResumingHistory(false);
            setIsResumedSession(false);
            restoreAttemptedRef.current = false;
            autoResumeTriedRef.current = null;
            autoStartHandledRef.current = false;
          }
        } catch {
          setIsResumingHistory(false);
          setIsResumedSession(false);
          restoreAttemptedRef.current = false;
          autoResumeTriedRef.current = null;
          autoStartHandledRef.current = false;
        }
      })();
    }
  }, [chatMode, getEffectiveIds, stashSession, unstashSession, entries, currentPlan, resumeSession, sessionId, sessionTitle, startSession]);

  useEffect(() => {
    if (!sessionId || !isConnected) return;
    const prevMap = activeSessionByContextRef.current;
    if (prevMap[contextKey] === sessionId) return;
    const nextMap = { ...prevMap, [contextKey]: sessionId };
    activeSessionByContextRef.current = nextMap;
    setActiveSessionByContext(nextMap);
  }, [contextKey, sessionId, isConnected]);

  useEffect(() => {
    activeSessionByContextRef.current = activeSessionByContext;
  }, [activeSessionByContext]);

  useEffect(() => {
    entriesByContextRef.current[contextKey] = entries;
  }, [contextKey, entries]);

  useEffect(() => {
    sessionTitleByContextRef.current[contextKey] = sessionTitle;
  }, [contextKey, sessionTitle]);

  useEffect(() => {
    if (!isConnected || !sessionId) {
      connectedContextKeyRef.current = null;
      return;
    }
    if (connectedContextKeyRef.current == null) {
      connectedContextKeyRef.current = contextKey;
      return;
    }
    if (connectedContextKeyRef.current === contextKey) return;

    connectedContextKeyRef.current = null;
    disconnect();
    setEntries([]);
    setCurrentPlan(null);
    setPendingPermission(null);
    setSessionTitle(null);
    setIsEditingTitle(false);
    setIsResumedSession(false);
    setWaitingForResponse(false);
    stoppedRef.current = false;
    restoreAttemptedRef.current = false;
    autoResumeTriedRef.current = null;
    autoStartHandledRef.current = false;
  }, [contextKey, disconnect, isConnected, sessionId]);

  const handleSelectHistorySession = useCallback(
    async (s: AgentChatSessionItem) => {
      if (isConnecting) return;
      if (sessionId === s.guid && isConnected) {
        setHistoryOpen(false);
        return;
      }
      setHistoryOpen(false);
      skipNextAutoConnectRef.current = true;
      disconnect();
      setEntries([]);
      setCurrentPlan(null);
      setPendingPermission(null);
      setWaitingForResponse(false);
      stoppedRef.current = false;
      setRegistryId(s.registry_id);
      setSessionTitle(s.title || null);
      setIsResumedSession(true);
      setActiveSessionByContext((prev) => ({ ...prev, [contextKey]: s.guid }));
      setIsResumingHistory(true);
      autoResumeTriedRef.current = null;
      try {
        const success = await resumeSession(s.guid);
        if (!success) {
          setIsResumingHistory(false);
        }
      } catch {
        setIsResumingHistory(false);
      } finally {
        skipNextAutoConnectRef.current = false;
      }
    },
    [contextKey, disconnect, isConnected, isConnecting, resumeSession, sessionId]
  );

  const handleCreateNewSession = useCallback(async (targetRegistryId?: string) => {
    if (isConnecting) return;
    const nextRegistryId = targetRegistryId || defaultRegistryId || registryId;
    if (!nextRegistryId) return;
    skipNextAutoConnectRef.current = true;
    disconnectStashed(contextKey);
    disconnect();
    setEntries([]);
    setCurrentPlan(null);
    setPendingPermission(null);
    setSessionTitle(null);
    setIsEditingTitle(false);
    setIsResumedSession(false);
    setWaitingForResponse(false);
    stoppedRef.current = false;
    setRegistryId(nextRegistryId);
    restoreAttemptedRef.current = true;
    autoResumeTriedRef.current = null;
    setActiveSessionByContext((prev) => {
      if (!(contextKey in prev)) return prev;
      const next = { ...prev };
      delete next[contextKey];
      return next;
    });
    try {
      await startSession({ registryId: nextRegistryId });
    } finally {
      skipNextAutoConnectRef.current = false;
    }
  }, [contextKey, defaultRegistryId, disconnect, disconnectStashed, isConnecting, registryId, startSession]);

  const handleManualLoadMessages = useCallback(async () => {
    const targetSessionId = sessionId;
    if (!targetSessionId || isConnecting || isResumingHistory) return;

    setIsManualLoadingMessages(true);
    try {
      setIsResumingHistory(true);
      setIsResumedSession(true);
      skipNextAutoConnectRef.current = true;
      disconnect();
      setEntries([]);
      setCurrentPlan(null);
      setPendingPermission(null);
      const success = await resumeSession(targetSessionId);
      if (!success) {
        setIsResumingHistory(false);
      }
    } catch {
      setIsResumingHistory(false);
    } finally {
      skipNextAutoConnectRef.current = false;
      setIsManualLoadingMessages(false);
    }
  }, [disconnect, isConnecting, isResumingHistory, resumeSession, sessionId]);

  useEffect(() => {
    if (authRequest?.methods?.length) {
      setSelectedAuthMethodId(authRequest.methods[0].id);
    } else {
      setSelectedAuthMethodId("");
    }
  }, [authRequest]);

  const refreshAgents = useCallback(async () => {
    setLoadingAgents(true);
    try {
      const [{ agents }, { agents: customAgents }] = await Promise.all([
        agentApi.listRegistry(),
        agentApi.listCustomAgents(),
      ]);
      const installed = agents.filter((a) => a.installed);
      const customAsRegistry: RegistryAgent[] = customAgents.map((c) => ({
        id: c.name,
        name: c.name,
        version: "",
        description: `${c.command} ${c.args.join(" ")}`,
        repository: null,
        icon: null,
        cli_command: `${c.command} ${c.args.join(" ")}`,
        install_method: "custom",
        package: null,
        installed: true,
        default_config: c.default_config,
      }));
      const allInstalled = [...installed, ...customAsRegistry];
      setInstalledAgents(allInstalled);
      if (allInstalled.length > 0) {
        const storedDefault = readDefaultAgentRegistryId();
        const hasStoredDefault =
          !!storedDefault && allInstalled.some((a) => a.id === storedDefault);
        const resolvedDefault = hasStoredDefault
          ? (storedDefault as string)
          : allInstalled[0].id;
        setDefaultRegistryId(resolvedDefault);
        if (resolvedDefault !== storedDefault) {
          writeDefaultAgentRegistryId(resolvedDefault);
        }
        const currentIsInstalled = allInstalled.some((a) => a.id === registryId);
        if (!currentIsInstalled) setRegistryId(resolvedDefault);
      } else {
        setDefaultRegistryId("");
        setRegistryId("");
      }
    } finally {
      setHasLoadedAgents(true);
      setLoadingAgents(false);
    }
  }, [registryId]);

  useEffect(() => {
    if (!isAgentChatOpen) {
      restoreAttemptedRef.current = false;
      skipNextAutoConnectRef.current = false;
      autoStartHandledRef.current = false;
      setHasLoadedAgents(false);
      setIsResumingHistory(false);
      autoResumeTriedRef.current = null;
      connectedContextKeyRef.current = null;
      return;
    }
    if (loadingAgents || isConnecting) return;
    // Hydrate once per open; avoid repeated refresh loops when user truly has no installed agents.
    if (!hasLoadedAgents || (!registryId && installedAgents.length > 0)) {
      void refreshAgents();
    }
  }, [isAgentChatOpen, isConnecting, loadingAgents, hasLoadedAgents, installedAgents.length, registryId, refreshAgents]);

  // Handle forced new session even if already connected (e.g. from Code Review Dialog)
  useEffect(() => {
    if (isAgentChatOpen && isConnected) {
      const pendingPrompt = peekPendingAgentChatPrompt();
      if (pendingPrompt?.forceNewSession && !forcedDisconnectDoneRef.current) {
        // Mark that we've handled this forced disconnect so we don't fire again
        // when the NEW session connects (the prompt is still in the store until consumed).
        forcedDisconnectDoneRef.current = true;
        // Disconnect and clear state so the auto-connect effect can start a fresh session.
        disconnect();
        setEntries([]);
        setCurrentPlan(null);
        setPendingPermission(null);
        setSessionTitle(null);
        setIsResumedSession(false);
        setWaitingForResponse(false);
        stoppedRef.current = false;
        autoResumeTriedRef.current = null;
        autoStartHandledRef.current = false;
        restoreAttemptedRef.current = true; // Don't try to restore the old session
      }
    }
  }, [isAgentChatOpen, isConnected, pendingAgentChatPrompt, peekPendingAgentChatPrompt, disconnect]);

  useEffect(() => {
    if (
      isAgentChatOpen &&
      registryId &&
      installedAgents.length > 0 &&
      !isConnected &&
      !isConnecting
    ) {
      if (skipNextAutoConnectRef.current) {
        skipNextAutoConnectRef.current = false;
        return;
      }

      const pendingPrompt = peekPendingAgentChatPrompt();
      const forcedRegistryId = pendingPrompt?.forceNewSession ? pendingPrompt.registryId : undefined;

      if (forcedRegistryId) {
        autoStartHandledRef.current = true;
        autoResumeTriedRef.current = null;
        setIsResumedSession(false);
        setEntries([]);
        setCurrentPlan(null);
        setPendingPermission(null);
        setSessionTitle(pendingPrompt?.sessionTitle ?? null);
        if (registryId !== forcedRegistryId) {
          setRegistryId(forcedRegistryId);
        }
        setActiveSessionByContext((prev) => {
          if (!(contextKey in prev)) return prev;
          const next = { ...prev };
          delete next[contextKey];
          return next;
        });
        startSession({ registryId: forcedRegistryId });
        return;
      }

      if (!restoreAttemptedRef.current) {
        restoreAttemptedRef.current = true;
        const cachedSessionId =
          activeSessionByContextRef.current[contextKey] ?? activeSessionByContext[contextKey];
        if (cachedSessionId) {
          // In-memory session available, resume it directly
          if (autoResumeTriedRef.current === cachedSessionId) return;
          autoResumeTriedRef.current = cachedSessionId;
          setIsResumedSession(true);
          autoStartHandledRef.current = true;
          void (async () => {
            setIsResumingHistory(true);
            const success = await resumeSession(cachedSessionId);
            if (!success) {
              setIsResumingHistory(false);
              setIsResumedSession(false);
              setActiveSessionByContext((prev) => {
                if (prev[contextKey] !== cachedSessionId) return prev;
                const next = { ...prev };
                delete next[contextKey];
                return next;
              });
              autoStartHandledRef.current = false;
              autoResumeTriedRef.current = null;
              startSession();
            }
          })();
          return;
        }
        // No in-memory session — query DB for the most recent session in this context
        void (async () => {
          try {
            const contextType = sessionWorkspaceId != null ? "workspace" : sessionProjectId != null ? "project" : "temp";
            const contextGuid = sessionWorkspaceId ?? sessionProjectId ?? undefined;
            const res = await agentRestApi.listSessions({
              context_type: contextType,
              context_guid: contextGuid,
              mode: chatMode,
              limit: 1,
            });
            const latestSession = res.items[0];
            if (latestSession) {
              if (autoResumeTriedRef.current === latestSession.guid) return;
              autoResumeTriedRef.current = latestSession.guid;
              setIsResumedSession(true);
              autoStartHandledRef.current = true;
              setIsResumingHistory(true);
              const success = await resumeSession(latestSession.guid);
              if (!success) {
                setIsResumingHistory(false);
                setIsResumedSession(false);
                autoStartHandledRef.current = false;
                autoResumeTriedRef.current = null;
                startSession();
              }
            } else {
              autoStartHandledRef.current = true;
              autoResumeTriedRef.current = null;
              setIsResumedSession(false);
              startSession();
            }
          } catch {
            autoStartHandledRef.current = true;
            autoResumeTriedRef.current = null;
            setIsResumedSession(false);
            startSession();
          }
        })();
        return;
      }
      if (!autoStartHandledRef.current) {
        autoStartHandledRef.current = true;
        autoResumeTriedRef.current = null;
        setIsResumedSession(false);
        startSession();
      }
    }
  }, [
    activeSessionByContext,
    chatMode,
    contextKey,
    isAgentChatOpen,
    sessionProjectId,
    registryId,
    installedAgents.length,
    isConnected,
    isConnecting,
    resumeSession,
    startSession,
    peekPendingAgentChatPrompt,
    pendingAgentChatPrompt,
    sessionWorkspaceId,
  ]);

  // When we successfully connect to a session, mark it as "already tried" so
  // the auto-connect effect won't attempt a spurious resumeSession on it if
  // the connection briefly drops.
  useEffect(() => {
    if (isConnected && sessionId) {
      autoResumeTriedRef.current = sessionId;
    }
  }, [isConnected, sessionId]);

  // Handle auto-starting a pending prompt (e.g. from Code Review Dialog) once connected.
  // Also fires when pendingAgentChatPrompt changes while already connected (e.g. commit
  // message generation reusing the existing session).
  useEffect(() => {
   if (isConnected && connectionPhase === "connected") {
     const data = consumePendingAgentChatPrompt();
     if (data && data.prompt) {
       // Try to send – if the WebSocket was already torn down by a concurrent
       // forced-disconnect effect (race condition), restore the prompt so it
       // can be picked up once the new session connects.
       const sent = sendPrompt(data.prompt);
       if (!sent) {
         setPendingAgentChatPrompt(data);
         return;
       }
       forcedDisconnectDoneRef.current = false;
       // Persist sessionTitle from the pending prompt (e.g. CodeReview / GitCommit titles)
       if (data.sessionTitle && sessionId) {
         setSessionTitle(data.sessionTitle);
         void agentRestApi.updateSessionTitle(sessionId, data.sessionTitle).catch(() => {});
       }
       setEntries((prev) => [
         ...prev,
         { role: "user" as const, content: data.prompt },
       ]);
       setWaitingForResponse(true);
     }
   }
  }, [isConnected, connectionPhase, sendPrompt, consumePendingAgentChatPrompt, setPendingAgentChatPrompt, pendingAgentChatPrompt, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setSessionTitle(null);
      return;
    }
    if (activeSessionTitle != null) {
      setSessionTitle(activeSessionTitle);
    }
  }, [sessionId, activeSessionTitle]);

  const handleStartEditTitle = useCallback(() => {
    if (!sessionTitle) return;
    setEditingTitleValue(sessionTitle);
    setIsEditingTitle(true);
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }, [sessionTitle]);

  const handleFinishEditTitle = useCallback(() => {
    setIsEditingTitle(false);
    const trimmed = editingTitleValue.trim();
    if (!trimmed || trimmed === sessionTitle) return;
    setSessionTitle(trimmed);
    if (sessionId) {
      void agentRestApi.updateSessionTitle(sessionId, trimmed).catch(() => {});
    }
  }, [editingTitleValue, sessionTitle, sessionId]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleFinishEditTitle();
    } else if (e.key === "Escape") {
      setIsEditingTitle(false);
    }
  }, [handleFinishEditTitle]);

  const userEntryIndices = React.useMemo(
    () => entries.map((e, i) => (e.role === "user" ? i : -1)).filter((i) => i >= 0),
    [entries]
  );

  const agentActivity = useMemo(
    () => deriveAgentActivity(entries, waitingForResponse),
    [entries, waitingForResponse]
  );

  const scrollToMessage = useCallback((messageIndex: number) => {
    const el = conversationRef.current?.querySelector(
      `[data-entry-index="${messageIndex}"]`
    ) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    }
    setMessageNavIndex(messageIndex);
  }, []);

  const handlePrevMessage = useCallback(() => {
    if (userEntryIndices.length === 0) return;
    const currentIdx = userEntryIndices.indexOf(messageNavIndex);
    if (currentIdx < 0) {
      scrollToMessage(userEntryIndices[userEntryIndices.length - 1]);
      return;
    }
    if (currentIdx <= 0) return;
    scrollToMessage(userEntryIndices[currentIdx - 1]);
  }, [userEntryIndices, messageNavIndex, scrollToMessage]);

  const handleNextMessage = useCallback(() => {
    if (userEntryIndices.length === 0) return;
    const currentIdx = userEntryIndices.indexOf(messageNavIndex);
    if (currentIdx < 0) {
      scrollToMessage(userEntryIndices[0]);
      return;
    }
    if (currentIdx >= userEntryIndices.length - 1) return;
    scrollToMessage(userEntryIndices[currentIdx + 1]);
  }, [userEntryIndices, messageNavIndex, scrollToMessage]);

  const handleSubmit = useCallback(
    async (message: { text: string; files?: import("ai").FileUIPart[] }) => {
      const text = message.text.trim();
      if (!text || !isConnected) return;
      stoppedRef.current = false;
      if (entries.length === 0) {
        let title: string;
        if (chatMode === "wiki_ask") {
          const projName = (wikiPath ?? localPath)?.split("/").pop() ?? "Project";
          const now = new Date();
          const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          title = `${projName}_WikiAsk_${ts}`;
        } else {
          title = text.slice(0, 512).trim() || "新会话";
        }
        setSessionTitle(title);
        if (sessionId) {
          void agentRestApi.updateSessionTitle(sessionId, title).catch(() => { });
        }
      }
      setWaitingForResponse(true);
      setCurrentPlan(null);
      setEntries((prev) => [
        ...prev,
        {
          role: "user" as const,
          content: text,
          files: message.files?.map((f, i) => ({ ...f, id: `f-${Date.now()}-${i}` })),
        },
      ]);

      const modeWrappedPrompt = chatMode === "wiki_ask"
        ? `You are in Wiki Ask mode. Prioritize information from the project's generated wiki content under .atmos/wiki. If the wiki does not contain enough context, state that clearly.\n\nUser question:\n${text}`
        : text;
      let finalPrompt = modeWrappedPrompt;

      const uploadPath = localPath ?? sessionCwd;
      if (message.files && message.files.length > 0 && uploadPath) {
        try {
          const { paths } = await agentRestApi.uploadAttachments(
            uploadPath,
            message.files.map((f) => ({
              url: f.url,
              filename: f.filename,
              mediaType: f.mediaType,
            }))
          );
          if (paths.length > 0) {
            const attachmentInfo = paths.map((p) => `- ${p}`).join("\n");
            finalPrompt = `${modeWrappedPrompt}\n\n[Attached files have been saved to the following paths, please read them to understand the content:]\n${attachmentInfo}`;
          }
        } catch (err) {
          console.error("Failed to upload attachments:", err);
        }
      }

      sendPrompt(finalPrompt);
    },
    [chatMode, isConnected, sendPrompt, localPath, wikiPath, sessionCwd, entries.length, sessionId]
  );

  const handleClose = useCallback(() => {
    setAgentChatOpen(false);
  }, [setAgentChatOpen]);

  const handlePermission = useCallback(
    (optionKind: string) => {
      if (!pendingPermission) return;
      const allowed = optionKind.startsWith("allow");
      sendPermissionResponse(pendingPermission.request_id, allowed);
      setPendingPermission(null);
    },
    [pendingPermission, sendPermissionResponse]
  );

  const clearCloseAgentsMenuTimer = useCallback(() => {
    if (closeAgentsMenuTimerRef.current) {
      clearTimeout(closeAgentsMenuTimerRef.current);
      closeAgentsMenuTimerRef.current = null;
    }
  }, []);

  const handleOpenNewSessionAgentsMenu = useCallback(() => {
    clearCloseAgentsMenuTimer();
    setNewSessionAgentsOpen(true);
  }, [clearCloseAgentsMenuTimer]);

  const handleScheduleCloseNewSessionAgentsMenu = useCallback(() => {
    clearCloseAgentsMenuTimer();
    closeAgentsMenuTimerRef.current = setTimeout(() => {
      setNewSessionAgentsOpen(false);
    }, 120);
  }, [clearCloseAgentsMenuTimer]);

  const handleSetDefaultAgent = useCallback((agentId: string) => {
    setDefaultRegistryId(agentId);
    writeDefaultAgentRegistryId(agentId);
  }, []);

  const handleToggleChatMode = useCallback(() => {
    if (chatMode === "wiki_ask") {
      setChatMode("default");
      return;
    }
    if (!wikiAskAvailability.enabled) return;
    setChatMode("wiki_ask");
  }, [chatMode, wikiAskAvailability.enabled]);

  useEffect(() => {
    return () => clearCloseAgentsMenuTimer();
  }, [clearCloseAgentsMenuTimer]);

  if (!isAgentChatOpen || !layoutLoaded) return null;

  const pos = resolvePosition();

  const connectionPhaseLabel = (() => {
    switch (connectionPhase) {
      case "initializing":
        return "Initializing ACP connection...";
      case "authenticating":
        return "Authenticating with agent...";
      case "resuming_session":
        return "Restoring ACP session...";
      case "creating_session":
        return "Creating ACP session...";
      case "connecting_ws":
        return "Connecting to chat stream...";
      case "connected":
        return "Connected";
      default:
        return "Ready to connect";
    }
  })();

  const activeAgent = installedAgents.find((agent) => agent.id === registryId) ?? null;

  return (
    <div
      ref={panelRef}
      className="fixed z-50 flex flex-col rounded-xl border border-border bg-background shadow-lg"
      style={{ left: pos.x, top: pos.y, width: layout.width, height: layout.height, opacity: layout.opacity / 100 }}
    >
      {/* Resize handles */}
      <div className="absolute -top-1 left-2 right-2 h-2 cursor-n-resize z-10" onMouseDown={handleResizeStart('n')} />
      <div className="absolute -bottom-1 left-2 right-2 h-2 cursor-s-resize z-10" onMouseDown={handleResizeStart('s')} />
      <div className="absolute -left-1 top-2 bottom-2 w-2 cursor-w-resize z-10" onMouseDown={handleResizeStart('w')} />
      <div className="absolute -right-1 top-2 bottom-2 w-2 cursor-e-resize z-10" onMouseDown={handleResizeStart('e')} />
      <div className="absolute -top-1 -left-1 h-3 w-3 cursor-nw-resize z-20" onMouseDown={handleResizeStart('nw')} />
      <div className="absolute -top-1 -right-1 h-3 w-3 cursor-ne-resize z-20" onMouseDown={handleResizeStart('ne')} />
      <div className="absolute -bottom-1 -left-1 h-3 w-3 cursor-sw-resize z-20" onMouseDown={handleResizeStart('sw')} />
      <div className="absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize z-20" onMouseDown={handleResizeStart('se')} />

      <div
        className="flex shrink-0 flex-col gap-1 border-b border-border px-4 py-3 cursor-grab active:cursor-grabbing"
        onMouseDown={handleDragStart}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
      >
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative size-5">
                <div
                  className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out ${headerHovered
                    ? "translate-y-[-2px] scale-90 opacity-0"
                    : "translate-y-0 scale-100 opacity-100"
                    }`}
                >
                  {isConnected && activeAgent ? (
                    <AgentIcon
                      registryId={activeAgent.id}
                      name={activeAgent.name}
                      size={16}
                      isCustom={activeAgent.install_method === "custom"}
                    />
                  ) : (
                    <Bot className="size-4 shrink-0 text-foreground" />
                  )}
                </div>
                <Popover open={newSessionAgentsOpen} onOpenChange={setNewSessionAgentsOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={() => void handleCreateNewSession()}
                      onMouseEnter={handleOpenNewSessionAgentsMenu}
                      onMouseLeave={handleScheduleCloseNewSessionAgentsMenu}
                      className={`absolute inset-0 flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-all duration-200 ease-out hover:bg-muted hover:text-foreground ${headerHovered
                        ? "translate-y-0 scale-100 opacity-100"
                        : "translate-y-[2px] scale-90 opacity-0 pointer-events-none"
                        }`}
                      aria-label="New chat session"
                      title="New session (default agent)"
                    >
                      <Plus className="size-4 shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-72 p-1"
                    align="start"
                    onMouseEnter={handleOpenNewSessionAgentsMenu}
                    onMouseLeave={handleScheduleCloseNewSessionAgentsMenu}
                  >
                    <div className="px-2 py-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Create session with agent</p>
                    </div>
                    <div className="max-h-56 overflow-auto">
                      {installedAgents.length === 0 && (
                        <div className="px-2 py-3 text-xs text-muted-foreground">No installed agent</div>
                      )}
                      {installedAgents.map((agent) => {
                        const isDefault = agent.id === defaultRegistryId;
                        return (
                          <div
                            key={agent.id}
                            className="group flex items-center justify-between gap-1 rounded-sm px-1 py-0.5 hover:bg-muted"
                          >
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
                              onClick={() => {
                                setNewSessionAgentsOpen(false);
                                void handleCreateNewSession(agent.id);
                              }}
                            >
                              <AgentIcon
                                registryId={agent.id}
                                name={agent.name}
                                size={14}
                                isCustom={agent.install_method === "custom"}
                              />
                              <span className="truncate">{agent.name}</span>
                            </button>
                            <TooltipProvider delayDuration={0}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className={`rounded-sm p-1.5 transition-all ${isDefault
                                      ? "text-primary opacity-100"
                                      : "text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-primary/5"
                                      }`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSetDefaultAgent(agent.id);
                                    }}
                                    aria-label={isDefault ? "Current default agent" : `Set ${agent.name} as default`}
                                  >
                                    <Heart className={`size-3.5 ${isDefault ? "fill-primary" : ""}`} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="z-100 text-[10px] py-1 px-2">
                                  {isDefault ? "Default agent" : "Set as default"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              {isConnected && activeAgent ? (
                <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                  <span className="text-sm font-medium shrink-0 truncate max-w-[200px]">{activeAgent.name}</span>
                  <span className="inline-flex items-center rounded-sm border border-dashed border-current px-1.5 py-0.5 text-[10px] font-medium leading-none bg-black/85 text-white dark:bg-white/85 dark:text-black shrink-0">
                    {chatMode === "wiki_ask" ? "Wiki Ask" : "Default"}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm font-medium shrink-0">Agent Chat</span>
                  <span className="inline-flex items-center rounded-sm border border-dashed border-current px-1.5 py-0.5 text-[10px] font-medium leading-none bg-black/85 text-white dark:bg-white/85 dark:text-black">
                    {chatMode === "wiki_ask" ? "Wiki Ask" : "Default"}
                  </span>
                </div>
              )}
            </div>

            {(localPath ?? sessionCwd) && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="ml-2 flex min-w-0 max-w-[180px] cursor-help items-center gap-1.5 overflow-hidden rounded-md border border-border/50 bg-muted/40 px-2 py-0.5">
                      <Folder className="size-3 shrink-0 text-muted-foreground/70" />
                      <span
                        className="truncate select-none text-[10px] leading-none text-muted-foreground/80"
                        style={{ direction: "rtl", textAlign: "left" }}
                      >
                        {localPath ?? sessionCwd}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs break-all">
                    {!localPath && sessionCwd && (
                      <p className="mb-0.5 text-[11px] text-muted-foreground">Temp directory</p>
                    )}
                    <p className="text-[11px]">{localPath ?? sessionCwd}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleToggleChatMode}
                    disabled={chatMode === "default" && !wikiAskAvailability.enabled}
                    className={`group/mode relative rounded p-1.5 transition-colors ${
                      chatMode === "wiki_ask"
                        ? "text-primary hover:bg-primary/10"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent`}
                    aria-label="Toggle chat mode"
                  >
                    <span className="block transition-all duration-150 group-hover/mode:scale-0 group-hover/mode:opacity-0">
                      {chatMode === "wiki_ask" ? <BookOpen className="size-4" /> : <MessageSquare className="size-4" />}
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center transition-all duration-150 scale-0 opacity-0 group-hover/mode:scale-100 group-hover/mode:opacity-100">
                      {chatMode === "wiki_ask" ? <MessageSquare className="size-4" /> : <BookOpen className="size-4" />}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {chatMode === "wiki_ask"
                    ? "Switch to Default Chat"
                    : wikiAskAvailability.enabled
                      ? "Switch to Wiki Ask"
                      : wikiAskAvailability.reason}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Chat history"
                      >
                        <History className="size-4" />
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Chat history</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <p className="text-sm font-medium shrink-0">
                    {chatMode === "wiki_ask" ? "Wiki Ask history" : "Chat history"}
                  </p>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="truncate text-[10px] text-muted-foreground/70 cursor-help max-w-[140px]">
                          {sessionWorkspaceId
                            ? `Workspace: ${localPath ? localPath.split("/").pop() : sessionWorkspaceId}`
                            : sessionProjectId
                              ? `Project: ${(wikiPath ?? localPath)?.split("/").pop() ?? sessionProjectId}`
                              : "Temp sessions"}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs break-all">
                        <p className="text-[11px]">
                          {sessionWorkspaceId
                            ? `Showing history for workspace${localPath ? `: ${localPath}` : ""}`
                            : sessionProjectId
                              ? `Showing history for project${(wikiPath ?? localPath) ? `: ${wikiPath ?? localPath}` : ""}`
                              : "Showing history for temporary sessions"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <ScrollArea className="h-[280px]">
                  {historyLoading && historySessions.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : historySessions.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      {chatMode === "wiki_ask" ? "No Wiki Ask history yet" : "No history yet"}
                    </div>
                  ) : (
                    <div className="p-1">
                      {historySessions.map((s) => (
                        <button
                          key={s.guid}
                          type="button"
                          className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                          onClick={() => handleSelectHistorySession(s)}
                          disabled={isConnecting}
                        >
                          <span className="w-full truncate font-medium">
                            {s.title || "New chat"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatLocalDateTime(s.created_at)}
                          </span>
                        </button>
                      ))}
                      {historyHasMore && historyCursor && (
                        <button
                          type="button"
                          className="w-full rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
                          onClick={() => loadHistorySessions(historyCursor)}
                          disabled={historyLoading}
                        >
                          {historyLoading ? "Loading..." : "Load more"}
                        </button>
                      )}
                    </div>
                  )}
                </ScrollArea>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={handleClose}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close chat"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        {sessionTitle && (
          isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editingTitleValue}
              onChange={(e) => setEditingTitleValue(e.target.value)}
              onBlur={handleFinishEditTitle}
              onKeyDown={handleTitleKeyDown}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full rounded border border-border bg-transparent px-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="group/title flex w-fit items-center gap-1 max-w-full cursor-pointer rounded px-1 -mx-1 hover:bg-muted transition-colors"
                    onClick={handleStartEditTitle}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <span className="truncate text-xs text-muted-foreground">{sessionTitle}</span>
                    <Pencil className="size-3 shrink-0 text-muted-foreground/0 group-hover/title:text-muted-foreground transition-colors" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="z-100 max-w-[300px] break-words text-xs">
                  {sessionTitle}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        )}
      </div>

      <div ref={conversationRef} className="min-h-0 flex-1 overflow-hidden">
        <Conversation className="min-h-0 h-full overflow-hidden">
          <ConversationContent className="gap-3 p-4!">
            {((loadingAgents && !isConnected && !isConnecting) || isConnecting || isResumingHistory) && (
              <div className="flex items-center justify-center py-6">
                <TextShimmer duration={1.5}>
                  {loadingAgents && !isConnecting && !isResumingHistory
                    ? "Loading..."
                    : isResumingHistory
                      ? "Restoring session..."
                      : connectionPhaseLabel}
                </TextShimmer>
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {isConnected && entries.length === 0 && !isConnecting && !error && sessionId && isResumedSession && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleManualLoadMessages}
                  disabled={isManualLoadingMessages || isResumingHistory}
                  className="h-8 text-xs text-muted-foreground"
                >
                  {(isManualLoadingMessages || isResumingHistory) && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                  {isManualLoadingMessages || isResumingHistory ? "Loading messages..." : "Load messages"}
                </Button>
              </div>
            )}
            {isConnected && entries.length === 0 && !isConnecting && !error && (
              <ConversationEmptyState
                icon={
                  chatMode === "wiki_ask"
                    ? <BookOpen className="size-12" />
                    : <MessageSquare className="size-12" />
                }
                title={chatMode === "wiki_ask" ? "Ask your project wiki" : "Start a conversation"}
                description={
                  chatMode === "wiki_ask"
                    ? "Type a question about the generated wiki content"
                    : "Type a message below to begin chatting"
                }
              />
            )}
            {entries.map((entry, i) => (
              <div key={i} data-entry-index={i} className="w-full min-w-0">
                {entry.role === "user" ? (
                  <div className="group relative">
                    <MessageCopyButton
                      text={entry.content}
                      ariaLabel="Copy user message"
                      title="Copy message"
                      className="absolute right-1 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background/80 p-0 text-muted-foreground opacity-0 transition-all hover:text-foreground group-hover:opacity-100"
                    />
                    <Message from="user">
                      <MessageContent>
                      {entry.files && entry.files.length > 0 && (
                        <Attachments variant="inline" className="mb-2">
                          {entry.files.map((f) => (
                            <Attachment key={f.id} data={f}>
                              <AttachmentPreview />
                              <AttachmentRemove />
                            </Attachment>
                          ))}
                        </Attachments>
                      )}
                      <div className="whitespace-pre-wrap" style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}>{entry.content}</div>
                      </MessageContent>
                    </Message>
                  </div>
                ) : (
                  <Message from="assistant">
                    <MessageContent>
                      <AssistantTurnView entry={entry} />
                      {!entries.slice(i + 1).some((nextEntry) => nextEntry.role === "assistant") &&
                        !entry.isStreaming &&
                        !agentActivity.busy && (
                        <div className="mt-2 flex">
                          <MessageCopyButton
                            text={getAllAssistantMessagesCopyText(entries)}
                            ariaLabel="Copy all assistant messages"
                            title="Copy all assistant messages"
                            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          />
                        </div>
                      )}
                    </MessageContent>
                  </Message>
                )}
              </div>
            ))}
            {agentActivity.busy && (
              <AgentActivityIndicator activity={agentActivity} />
            )}
            <div ref={bottomRef} />
          </ConversationContent>
          <ConversationScrollButton className="group absolute right-3 bottom-1 left-auto z-10 inline-flex h-8 w-8 translate-x-0 items-center justify-center gap-0 overflow-hidden rounded-sm border border-dashed border-border/70 bg-background px-0 text-foreground shadow-md transition-[width,padding,gap] duration-300 ease-out [transform-origin:right_center] hover:w-24 hover:px-2 hover:gap-1">
            <span className="inline-flex size-4 shrink-0 items-center justify-center">
              <ChevronDown className="size-4" />
            </span>
            <span className="max-w-0 whitespace-nowrap text-[11px] text-foreground opacity-0 transition-[max-width,opacity] duration-300 ease-out group-hover:max-w-16 group-hover:opacity-100">
              Bottom
            </span>
          </ConversationScrollButton>
          {userEntryIndices.length >= 2 && (
            <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-0.5 rounded-sm border border-border/50 bg-background/80 py-1 shadow-sm backdrop-blur-sm dark:bg-background/60">
              <button
                type="button"
                onClick={handlePrevMessage}
                disabled={
                  userEntryIndices.length > 0 &&
                  userEntryIndices.indexOf(messageNavIndex) === 0
                }
                className="flex items-center justify-center rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                aria-label="Previous message"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMessage}
                disabled={
                  userEntryIndices.length > 0 &&
                  userEntryIndices.indexOf(messageNavIndex) >=
                  userEntryIndices.length - 1
                }
                className="flex items-center justify-center rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                aria-label="Next message"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
          )}
        </Conversation>
      </div>

      {pendingPermission && (
        <div className="shrink-0 border-t border-border p-3">
          <Confirmation
            approval={{ id: pendingPermission.request_id }}
            state="approval-requested"
            className="border-amber-500/50 bg-amber-500/10"
          >
            <ConfirmationRequest>
              <span className="font-medium">Permission requested</span>
              <p className="mt-1 text-sm text-muted-foreground break-all max-w-full">
                {pendingPermission.description}
              </p>
            </ConfirmationRequest>
            <ConfirmationActions>
              {pendingPermission.options.length > 0 ? (
                pendingPermission.options.map((opt) => (
                  <ConfirmationAction
                    key={opt.option_id}
                    variant={opt.kind.startsWith("allow") ? "default" : "outline"}
                    onClick={() => handlePermission(opt.kind)}
                  >
                    {opt.name}
                  </ConfirmationAction>
                ))
              ) : (
                <>
                  <ConfirmationAction
                    variant="outline"
                    onClick={() => handlePermission("reject_once")}
                  >
                    Deny
                  </ConfirmationAction>
                  <ConfirmationAction onClick={() => handlePermission("allow_once")}>
                    Allow
                  </ConfirmationAction>
                </>
              )}
            </ConfirmationActions>
          </Confirmation>
        </div>
      )}

      <div className="shrink-0 px-3 pb-3 pt-px select-none">
        {currentPlan && (
          <div className="mx-auto w-[96%]">
            <PlanBlockView plan={currentPlan} docked defaultOpen={!isResumedSession} />
          </div>
        )}
        <PromptInput
          onSubmit={(msg) => handleSubmit({ text: msg.text, files: msg.files })}
          className={`w-full border-0 shadow-none rounded-none ${currentPlan ? "rounded-t-none" : "rounded-t-xl"}`}
          multiple
        >
          <PromptInputAttachmentsSection />
          <PromptInputBody>
            <PromptInputTextarea
              placeholder={
                isConnected && !pendingAgentChatPrompt?.forceNewSession
                  ? (chatMode === "wiki_ask" ? "Ask about this wiki..." : "Type a message...")
                  : "Select agent to connect"
              }
              disabled={!isConnected || !!pendingAgentChatPrompt?.forceNewSession}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputAddAttachmentsButton />
              {(loadingAgents || isConnecting || isResumingHistory) && !isConnected ? null : installedAgents.length === 0 ? (
                <span className="px-2 text-xs text-muted-foreground">No agent</span>
              ) : null}
            </PromptInputTools>
            <div className="flex items-center gap-2">
              {configOptions?.length > 0 && isConnected && (
                <div className="flex items-center gap-2">
                  {configOptions
                    .filter(opt => opt.type === 'select' && opt.options.length > 0)
                    .map(opt => (
                      <div key={opt.id} className="flex items-center gap-1">
                        <Select
                          value={opt.currentValue || ''}
                          onValueChange={(val) => {
                            setConfigOption(opt.id, val);
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs min-w-[100px] border-border/50 bg-muted/20">
                            <SelectValue placeholder={opt.name || opt.id} />
                          </SelectTrigger>
                          <SelectContent>
                            {opt.options.map(o => {
                              const isDefault = activeAgent?.default_config?.[opt.id] === o.value;
                              const item = (
                                <SelectItem
                                  key={o.value}
                                  value={o.value}
                                  className="text-xs"
                                  onPointerDown={(e) => {
                                    if (!e.shiftKey) return;
                                    setAgentDefaultConfig(opt.id, o.value);
                                    setInstalledAgents((prev) =>
                                      prev.map((a) => {
                                        if (a.id === registryId) {
                                          const newDefaults = {
                                            ...(a.default_config || {}),
                                            [opt.id]: o.value,
                                          };
                                          return { ...a, default_config: newDefaults };
                                        }
                                        return a;
                                      })
                                    );
                                    void refreshAgents();
                                  }}
                                >
                                  <span className="truncate">{o.name || o.value}</span>
                                </SelectItem>
                              );
                              return (
                                <TooltipProvider key={o.value} delayDuration={0}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      {item}
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="left"
                                      align="center"
                                      className="z-100 max-w-[250px]"
                                    >
                                      <div className="space-y-1.5">
                                        {o.description ? <div>{o.description}</div> : null}
                                        <div className="border-t border-border/50 pt-1 text-[10px]">
                                          Shift + Click to set as default {isDefault ? "(current default)" : ""}
                                        </div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                </div>
              )}
              <PromptInputSubmit
                status={agentActivity.busy ? "streaming" : undefined}
                onStop={
                  agentActivity.busy
                    ? () => {
                      // Stop receiving output and send cancel to agent
                      stoppedRef.current = true;
                      sendCancel();
                      setWaitingForResponse(false);
                      // Mark streaming done and any running tool calls as completed
                      setEntries((prev) => {
                        const last = prev[prev.length - 1];
                        if (last?.role === "assistant") {
                          const updatedBlocks = last.blocks.map((block) =>
                            block.type === "tool_call" && block.status === "running"
                              ? { ...block, status: "completed" as const }
                              : block
                          );
                          return [
                            ...prev.slice(0, -1),
                            { ...last, isStreaming: false, blocks: updatedBlocks },
                          ];
                        }
                        return prev;
                      });
                    }
                    : undefined
                }
                disabled={!isConnected}
                size={agentActivity.busy ? "sm" : "icon-sm"}
              >
                {agentActivity.busy ? (
                  <span className="flex items-center gap-1.5">
                    <Square className="size-4 shrink-0" />
                  </span>
                ) : undefined}
              </PromptInputSubmit>
            </div>
          </PromptInputFooter>
        </PromptInput>
      </div>
      <Dialog open={!!authRequest} onOpenChange={(open) => !open && clearAuthRequest()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agent authentication required</DialogTitle>
            <DialogDescription>
              {authRequest?.message || "This agent requires authentication before creating a session."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {authRequest?.methods.map((method) => {
              const checked = selectedAuthMethodId === method.id;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setSelectedAuthMethodId(method.id)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                >
                  <p className="text-sm font-medium">{method.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{method.description || method.id}</p>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => clearAuthRequest()}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!selectedAuthMethodId) return;
                clearAuthRequest();
                void startSession({ authMethodId: selectedAuthMethodId });
              }}
              disabled={!selectedAuthMethodId || isConnecting}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
