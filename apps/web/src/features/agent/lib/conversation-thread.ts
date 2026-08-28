import type { FileUIPart } from "ai";
import type { QueuedAgentPrompt } from "@/app-shell/state/use-dialog-store";
import type { AgentConfigOption, AgentPlan } from "@/features/agent/hooks/use-agent-session";
import type { AgentModelCatalog } from "@/api/ws/conversation-api";
import type {
  AssistantBlock,
  ThreadEntry,
  ToolCallBlock,
} from "@/features/agent/lib/agent/thread";
import type { ConversationPart, LiveTurn } from "@/features/agent/lib/conversation-events";
import type { ConversationIndexEntry } from "@atmos/api-types/ws/dto/conversation";

const TOOL_KIND_ALIAS: Record<string, string> = {
  read: "Read",
  edit: "Edit",
  write: "Edit",
  search: "Search",
  fetch: "Fetch",
  shell: "Execute",
  execute: "Execute",
  bash: "Execute",
  terminal: "Execute",
  delete: "Delete",
  think: "Think",
  thought: "Think",
};

type ThinkingShape = {
  type?: string;
  options?: string[];
};

export function thinkingChoices(catalog: AgentModelCatalog | null, modelId: string): string[] {
  const model = catalog?.models.find((item) => item.id === modelId);
  const thinking = (model?.thinking ?? catalog?.thinking) as ThinkingShape | undefined;
  if (!thinking || thinking.type === "none" || thinking.type === "encoded_in_model") {
    return [];
  }
  if (thinking.type === "enum" && Array.isArray(thinking.options)) {
    return thinking.options.filter((item) => item.trim().length > 0);
  }
  return [];
}

export function catalogToConfigOptions(
  catalog: AgentModelCatalog | null,
  modelId: string,
  thinkingId: string,
): AgentConfigOption[] {
  if (!catalog) return [];
  const options: AgentConfigOption[] = [];
  if (catalog.models.length > 0) {
    options.push({
      id: "model",
      name: "Model",
      type: "select",
      currentValue: modelId,
      options: catalog.models.map((model) => ({
        value: model.id,
        name: model.label || model.id,
      })),
    });
  }
  const thinking = thinkingChoices(catalog, modelId);
  if (thinking.length > 0) {
    options.push({
      id: "thinking",
      name: "Thinking",
      type: "select",
      currentValue: thinkingId,
      options: thinking.map((value) => ({ value, name: value })),
    });
  }
  return options;
}

export type ConversationHistoryRow = {
  conversation_id: string;
  provider_id: string;
  title: string | null;
  cwd: string;
  updated_at: string | null;
};

export function conversationTitleFromPrompt(text: string): string {
  const line = text.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!line) return "";
  return Array.from(line).slice(0, 60).join("");
}

export function conversationsToHistoryRows(
  items: ConversationIndexEntry[],
): ConversationHistoryRow[] {
  return items.map((item) => ({
    conversation_id: item.id,
    provider_id: item.provider_id,
    title: item.title,
    cwd: item.cwd,
    updated_at: item.updated_at,
  }));
}

export function queueToPrompts(
  items: Array<{
    id: string;
    prompt: string;
    display_prompt?: string | null;
    attachments?: string[];
    status?: string;
  }>,
  workspaceId: string | null,
  projectId: string | null,
): QueuedAgentPrompt[] {
  return items.map((item) => ({
    id: item.id,
    prompt: item.prompt,
    displayPrompt: item.display_prompt ?? item.prompt,
    attachmentPaths: item.attachments,
    workspaceId,
    projectId,
    mode: "default",
    origin: "conversation-queue",
    createdAt: 0,
  }));
}

function mapToolName(kind?: string, name?: string): string {
  const raw = (kind || name || "Tool").trim();
  if (!raw || raw.toLowerCase() === "tool" || raw.toLowerCase() === "other") {
    return name && name !== raw ? name : "Tool";
  }
  return TOOL_KIND_ALIAS[raw.toLowerCase()] ?? raw;
}

function vendorTypeFromPayload(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as { type?: unknown; variant?: unknown };
  const type = [record.type, record.variant].find(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  if (!type || /^(tool|other|unknown)$/i.test(type)) return undefined;
  return type.trim();
}

function parsePlan(value: unknown): AgentPlan | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { entries?: unknown };
  if (!Array.isArray(record.entries)) return null;
  const entries = record.entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as { content?: unknown; priority?: unknown; status?: unknown };
      if (typeof item.content !== "string") return null;
      return {
        content: item.content,
        priority: typeof item.priority === "string" ? item.priority : "medium",
        status: typeof item.status === "string" ? item.status : "pending",
      };
    })
    .filter((entry): entry is AgentPlan["entries"][number] => entry !== null);
  return { entries };
}

function attachmentFiles(parts: ConversationPart[]): (FileUIPart & { id: string })[] | undefined {
  const files = parts
    .filter((part) => part.type === "attachment" && part.path)
    .map((part) => ({
      type: "file" as const,
      id: part.path!,
      url: part.path!,
      filename: part.name || part.path!.split(/[\\/]/).at(-1) || part.path!,
      mediaType: "application/octet-stream",
    }));
  return files.length > 0 ? files : undefined;
}

function partToBlock(part: ConversationPart): AssistantBlock | null {
  if (part.type === "thinking") {
    return { type: "thinking", content: part.text ?? "" };
  }
  if (part.type === "plan") {
    const plan = parsePlan(part.plan) ?? { entries: [] };
    return { type: "plan", plan };
  }
  if (part.type === "tool_call") {
    const vendorType = vendorTypeFromPayload(part.input) || vendorTypeFromPayload(part.output);
    const block: ToolCallBlock = {
      type: "tool_call",
      tool_call_id: part.tool_call_id || part.name || "tool",
      tool: mapToolName(part.kind, vendorType || part.name),
      description: part.title || vendorType || part.name || "",
      status: part.status || "completed",
      raw_input: part.input,
      raw_output: part.output,
      content: Array.isArray(part.content) ? part.content as ToolCallBlock["content"] : undefined,
      detail: part.content,
    };
    return block;
  }
  if (part.type === "error") {
    const text = part.message || part.text || "";
    return text ? { type: "text", content: text } : null;
  }
  if (part.type === "text") {
    return { type: "text", content: part.text ?? "" };
  }
  return null;
}

export function turnsToThreadEntries(turns: LiveTurn[]): ThreadEntry[] {
  const entries: ThreadEntry[] = [];
  for (const turn of turns) {
    const streaming = turn.status === "running" || turn.status === "waiting_permission";
    let currentAssistant: Extract<ThreadEntry, { role: "assistant" }> | null = null;
    const flushAssistant = () => {
      if (!currentAssistant) return;
      entries.push(currentAssistant);
      currentAssistant = null;
    };
    for (const message of turn.messages) {
      if (message.role === "user") {
        flushAssistant();
        const text = message.parts
          .filter((part) => part.type === "text" || part.type === "error")
          .map((part) => part.text || part.message || "")
          .join("\n");
        entries.push({
          role: "user",
          content: text,
          files: attachmentFiles(message.parts),
        });
        continue;
      }
      const blocks = message.parts
        .map(partToBlock)
        .filter((block): block is AssistantBlock => block !== null);
      if (!currentAssistant) {
        currentAssistant = {
          role: "assistant",
          blocks,
          isStreaming: streaming,
        };
      } else {
        currentAssistant.blocks.push(...blocks);
      }
    }
    flushAssistant();
  }
  return entries;
}

export function currentPlanFromEntries(entries: ThreadEntry[]): AgentPlan | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.role !== "assistant") continue;
    for (let blockIndex = entry.blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const block = entry.blocks[blockIndex];
      if (block.type === "plan") return block.plan;
    }
  }
  return null;
}
