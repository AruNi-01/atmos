import type {
  AgentChatEvent,
  AgentEvent,
  AgentMessage,
  AgentPart,
} from "@atmos/api-types/ws/dto/agent-chat";
import {
  isGenericToolLabel,
  planFromToolInput,
  classifyTool,
  thinkingText,
} from "@/features/agent/lib/agent-tool-kind";

export type { AgentChatEvent, AgentEvent, AgentMessage, AgentPart };

export function agentChatEventFor(event: AgentChatEvent, chatId: string): boolean {
  return event.chat_id === chatId;
}

function mergeToolPart(
  existing: Extract<AgentPart, { type: "tool_call" }>,
  incoming: Extract<AgentPart, { type: "tool_call" }>,
): Extract<AgentPart, { type: "tool_call" }> {
  return {
    ...existing,
    ...incoming,
    name:
      isGenericToolLabel(incoming.name) && existing.name
        ? existing.name
        : incoming.name || existing.name,
    title:
      isGenericToolLabel(incoming.title) && existing.title
        ? existing.title
        : (incoming.title ?? existing.title),
    kind: incoming.kind === "other" && existing.kind !== "other" ? existing.kind : incoming.kind,
    input: incoming.input == null ? existing.input : incoming.input,
    output: incoming.output == null ? existing.output : incoming.output,
    content: incoming.content == null ? existing.content : incoming.content,
    status: incoming.status ?? existing.status,
  };
}

function upsertMessage(messages: AgentMessage[], message: AgentMessage): AgentMessage[] {
  const exists = messages.some((item) => item.id === message.id);
  if (!exists) return [...messages, message];
  return messages.map((item) => (item.id === message.id ? message : item));
}

function lastUserIndex(messages: AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

function currentTurnAssistant(
  messages: AgentMessage[],
  preferredId?: string,
): { message: AgentMessage; index: number } | null {
  const start = lastUserIndex(messages) + 1;
  if (preferredId) {
    for (let index = messages.length - 1; index >= start; index -= 1) {
      if (messages[index]?.id === preferredId) {
        return { message: messages[index]!, index };
      }
    }
  }
  for (let index = messages.length - 1; index >= start; index -= 1) {
    if (messages[index]?.role === "assistant") {
      return { message: messages[index]!, index };
    }
  }
  return null;
}

function patchCurrentTurnAssistant(
  messages: AgentMessage[],
  preferredId: string | undefined,
  patch: (message: AgentMessage) => AgentMessage,
): AgentMessage[] {
  const existing = currentTurnAssistant(messages, preferredId);
  if (existing) {
    return messages.map((item, index) => (index === existing.index ? patch(item) : item));
  }
  const start = lastUserIndex(messages) + 1;
  const preferred = preferredId?.trim() || "";
  const taken = preferred
    ? messages.slice(0, start).some((item) => item.id === preferred)
    : false;
  const id = preferred && !taken ? preferred : `${preferred || "assistant"}:${messages[start - 1]?.id ?? messages.length}`;
  return [
    ...messages,
    patch({
      id,
      role: "assistant",
      parts: [],
      streaming: true,
    }),
  ];
}

function appendTextPart(parts: AgentPart[], type: "text" | "thinking", delta: string): AgentPart[] {
  const next = [...parts];
  const last = next[next.length - 1];
  if (last && last.type === type) {
    next[next.length - 1] = { type, text: `${last.text ?? ""}${delta}` };
    return next;
  }
  next.push({ type, text: delta });
  return next;
}

export function foldMessagesFromEvent(
  messages: AgentMessage[],
  event: AgentChatEvent,
  chatId: string,
): AgentMessage[] {
  if (!agentChatEventFor(event, chatId)) return messages;
  const payload = event.payload as AgentEvent | undefined;
  if (!payload?.type) return messages;

  if (payload.type === "user_message") {
    const parts: AgentPart[] = [{ type: "text", text: payload.text ?? "" }];
    for (const path of payload.attachments ?? []) {
      parts.push({
        type: "attachment",
        path,
        name: path.split(/[\\/]/).at(-1) ?? path,
      });
    }
    return upsertMessage(messages, {
      id: payload.message_id,
      role: "user",
      kind: payload.kind,
      parts,
    }).map((item) =>
      item.role === "assistant" ? { ...item, streaming: false } : item,
    );
  }

  if (payload.type === "assistant_message_delta" || payload.type === "thinking_delta") {
    const partType = payload.type === "thinking_delta" ? "thinking" : "text";
    const delta = payload.delta ?? "";
    return patchCurrentTurnAssistant(messages, payload.message_id, (message) => ({
      ...message,
      role: "assistant",
      streaming: true,
      parts: appendTextPart(message.parts, partType, delta),
    }));
  }

  if (payload.type === "assistant_message_completed") {
    const current = currentTurnAssistant(messages, payload.message_id);
    if (!current) return messages;
    return messages.map((item, index) =>
      index === current.index ? { ...item, streaming: false } : item,
    );
  }

  if (payload.type === "thinking_completed") {
    return patchCurrentTurnAssistant(messages, payload.message_id, (message) => ({
      ...message,
      thinking_ms: payload.thinking_ms ?? message.thinking_ms,
    }));
  }

  if (payload.type === "turn_completed") {
    const current = currentTurnAssistant(messages);
    return messages.map((item, index) => {
      if (item.role !== "assistant") return item;
      const isCurrent = current?.index === index;
      return {
        ...item,
        streaming: false,
        ...(isCurrent
          ? {
              worked_ms: payload.worked_ms ?? item.worked_ms,
              thinking_ms: payload.thinking_ms ?? item.thinking_ms,
              completed_at: payload.completed_at ?? item.completed_at,
              usage: payload.usage ?? item.usage,
            }
          : {}),
      };
    });
  }

  if (payload.type === "usage_updated" && payload.turn) {
    const current = currentTurnAssistant(messages);
    if (!current) return messages;
    return messages.map((item, index) =>
      index === current.index ? { ...item, usage: payload.turn } : item,
    );
  }

  if (
    payload.type === "tool_call_started" ||
    payload.type === "tool_call_updated" ||
    payload.type === "tool_call_completed" ||
    payload.type === "tool_call_failed"
  ) {
    const tool = payload.tool_call;
    if (!tool?.tool_call_id) return messages;
    const existingTool = [...messages].reverse().flatMap((message) => message.parts).find(
      (part): part is Extract<AgentPart, { type: "tool_call" }> =>
        part.type === "tool_call" && part.tool_call_id === tool.tool_call_id,
    );
    const existingThinking = [...messages].reverse().flatMap((message) => message.parts).find(
      (part) => part.type === "thinking" && part.tool_call_id === tool.tool_call_id,
    );
    const name = isGenericToolLabel(tool.name) && existingTool ? existingTool.name : (tool.name || "Tool");
    const classified = existingThinking && isGenericToolLabel(tool.name)
      ? { type: "thinking" as const }
      : classifyTool(name, tool.title ?? existingTool?.title, tool.input ?? existingTool?.input);
    if (classified.type === "hide") return messages;
    if (classified.type === "thinking") {
      const text = thinkingText(tool);
      return patchCurrentTurnAssistant(messages, undefined, (message) => {
        const parts = [...message.parts];
        const existing = parts.findIndex(
          (row) => row.type === "thinking" && row.tool_call_id === tool.tool_call_id,
        );
        const next: AgentPart = { type: "thinking", text, tool_call_id: tool.tool_call_id };
        if (existing >= 0) parts[existing] = next;
        else parts.push(next);
        return { ...message, streaming: true, parts };
      });
    }
    if (classified.type === "plan") {
      const plan = planFromToolInput(tool.input) ?? { entries: [] };
      return patchCurrentTurnAssistant(messages, undefined, (message) => {
        const parts = [...message.parts];
        const existing = parts.findIndex((row) => row.type === "plan");
        const next: AgentPart = { type: "plan", plan };
        if (existing >= 0) parts[existing] = next;
        else parts.push(next);
        return { ...message, streaming: true, parts };
      });
    }
    const part: Extract<AgentPart, { type: "tool_call" }> = {
      type: "tool_call",
      tool_call_id: tool.tool_call_id,
      name,
      title: tool.title,
      status: tool.status,
      kind: classified.kind,
      input: tool.input,
      output: tool.output,
      content: tool.content,
    };
    return patchCurrentTurnAssistant(messages, undefined, (message) => {
      const parts = [...message.parts];
      const existing = parts.findIndex(
        (row) => row.type === "tool_call" && row.tool_call_id === tool.tool_call_id,
      );
      if (existing >= 0 && parts[existing]?.type === "tool_call") {
        parts[existing] = mergeToolPart(parts[existing], part);
      } else {
        parts.push(part);
      }
      return { ...message, streaming: true, parts };
    });
  }

  if (payload.type === "plan_updated") {
    return patchCurrentTurnAssistant(messages, undefined, (message) => {
      const planPart: AgentPart = { type: "plan", plan: payload.plan };
      const existing = message.parts.findIndex((row) => row.type === "plan");
      if (existing >= 0) {
        const parts = [...message.parts];
        parts[existing] = planPart;
        return { ...message, streaming: true, parts };
      }
      return { ...message, streaming: true, parts: [...message.parts, planPart] };
    });
  }

  return messages;
}

export function textFromParts(parts: AgentPart[]): string {
  return parts
    .filter((part): part is Extract<AgentPart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function assistantCopyText(message: AgentMessage): string {
  return message.parts
    .flatMap((part) => {
      if (part.type === "text" && part.text.trim()) return [part.text.trim()];
      if (part.type === "error" && part.message.trim()) return [part.message.trim()];
      return [];
    })
    .join("\n\n")
    .trim();
}

export function currentPlanFromMessages(messages: AgentMessage[]): unknown | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (part.type === "plan") return part.plan;
    }
  }
  return null;
}

export function stopStreamingMessages(messages: AgentMessage[]): AgentMessage[] {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return messages;
  return [
    ...messages.slice(0, -1),
    {
      ...last,
      streaming: false,
      parts: last.parts.map((part) =>
        part.type === "tool_call" && part.status === "running"
          ? { ...part, status: "completed" }
          : part,
      ),
    },
  ];
}
