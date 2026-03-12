import type { AgentServerMessage, AgentToolCallContentItem } from "@/hooks/use-agent-session";
import type {
  AssistantBlock,
  AssistantEntry,
  PlanBlock,
  TextBlock,
  ThinkingBlock,
  ThreadEntry,
  ToolCallBlock,
} from "./types";

function streamUsageToTurnUsage(usage: unknown): AssistantEntry["usage"] | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const value = usage as Record<string, unknown>;
  const inputTokens =
    typeof value.input_tokens === "number" ? value.input_tokens :
    typeof value.inputTokens === "number" ? value.inputTokens :
    undefined;
  const outputTokens =
    typeof value.output_tokens === "number" ? value.output_tokens :
    typeof value.outputTokens === "number" ? value.outputTokens :
    undefined;
  if (inputTokens == null && outputTokens == null) return undefined;
  return {
    inputTokens,
    outputTokens,
    totalTokens:
      inputTokens != null || outputTokens != null
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined,
  };
}

export function extractPlanMarkdown(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const plan = (value as Record<string, unknown>).plan;
  return typeof plan === "string" && plan.trim() ? plan : null;
}

function isGenericToolName(name?: string): boolean {
  const v = (name || "").trim().toLowerCase();
  return !v || v === "tool" || v === "other";
}

function isGenericToolDescription(description?: string): boolean {
  const v = (description || "").trim().toLowerCase();
  return !v || v === "tool" || v === "other";
}

function hasMeaningfulToolInput(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function mergeToolCallContent(
  prev: AgentToolCallContentItem[] | undefined,
  incoming: AgentToolCallContentItem[] | undefined,
): AgentToolCallContentItem[] | undefined {
  if (!incoming || incoming.length === 0) return prev;
  if (!prev || prev.length === 0) return incoming;

  const merged = [...prev];
  for (const item of incoming) {
    if (item.type === "text") {
      const idx = merged.findIndex((existing) => existing.type === "text" && existing.text === item.text);
      if (idx < 0) merged.push(item);
      continue;
    }
    if (item.type === "diff") {
      const idx = merged.findIndex(
        (existing) =>
          existing.type === "diff" &&
          existing.path === item.path &&
          existing.new_content === item.new_content &&
          existing.old_content === item.old_content
      );
      if (idx < 0) merged.push(item);
      continue;
    }
    const idx = merged.findIndex(
      (existing) => existing.type === "terminal" && existing.terminal_id === item.terminal_id
    );
    if (idx < 0) merged.push(item);
  }
  return merged;
}

export function applyServerMessageToEntries(
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

    if (last?.role === "assistant") {
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
        {
          ...last,
          blocks,
          isStreaming: !msg.done,
          usage: msg.done ? streamUsageToTurnUsage(msg.usage) ?? last.usage : last.usage,
        },
      ];
    }

    return [
      ...prev,
      {
        role: "assistant",
        blocks: [{ type: isThinking ? "thinking" : "text", content: msg.delta } as TextBlock | ThinkingBlock],
        isStreaming: !msg.done,
        usage: msg.done ? streamUsageToTurnUsage(msg.usage) : undefined,
      },
    ];
  }

  if (msg.type === "tool_call") {
    const id = msg.tool_call_id ?? "";
    const isTerminal = msg.status === "completed" || msg.status === "failed";
    const newBlock: ToolCallBlock = {
      type: "tool_call",
      tool_call_id: id,
      parent_tool_call_id: msg.parent_tool_call_id,
      tool: msg.tool,
      description: msg.description,
      status: msg.status,
      raw_input: msg.raw_input,
      content: msg.content,
      raw_output: msg.raw_output,
      detail: msg.detail,
    };

    const entries = [...prev];
    const lastEntry = entries[entries.length - 1];
    if (lastEntry?.role === "assistant" && lastEntry.isStreaming) {
      entries[entries.length - 1] = { ...lastEntry, isStreaming: false };
    }

    let assistantIdx = -1;
    const lastIdx = entries.length - 1;
    if (lastIdx >= 0 && entries[lastIdx].role === "assistant") {
      assistantIdx = lastIdx;
    }

    if (assistantIdx >= 0) {
      const assistant = entries[assistantIdx] as AssistantEntry;
      const blocks = [...assistant.blocks];

      let toolIdx = -1;
      if (id) {
        toolIdx = blocks.findIndex(
          (b) => b.type === "tool_call" && b.tool_call_id === id
        );
      }
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
          parent_tool_call_id: msg.parent_tool_call_id ?? prevBlock.parent_tool_call_id,
          tool: isGenericToolName(msg.tool) ? prevBlock.tool : msg.tool,
          description:
            isGenericToolDescription(msg.description) && prevBlock.description
              ? prevBlock.description
              : (msg.description || prevBlock.description),
          status: msg.status,
          raw_input: hasMeaningfulToolInput(msg.raw_input) ? msg.raw_input : prevBlock.raw_input,
          content: mergeToolCallContent(prevBlock.content, msg.content),
          raw_output: msg.raw_output ?? prevBlock.raw_output,
          detail: msg.detail ?? prevBlock.detail,
        };
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

  if (msg.type === "turn_end") {
    const entries = [...prev];
    const lastIdx = entries.length - 1;
    if (lastIdx >= 0 && entries[lastIdx].role === "assistant") {
      entries[lastIdx] = {
        ...(entries[lastIdx] as AssistantEntry),
        isStreaming: false,
        usage: msg.usage,
      };
    }
    return entries;
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
