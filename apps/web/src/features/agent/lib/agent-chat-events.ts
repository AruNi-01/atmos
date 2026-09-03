import type {
  AgentChatEvent,
  AgentEvent,
  AgentMessage,
  AgentPart,
} from "@atmos/api-types/ws/dto/agent-chat";
import {
  defaultToolParams,
  isActiveToolStatus,
  isGenericToolLabel,
  isPlaceholderToolParams,
  isPlaceholderToolResult,
  wireToolKind,
} from "@/features/agent/lib/agent-tool-kind";
import { isLiveBackgroundToolCall } from "@/features/agent/lib/agent/background-command";

export type { AgentChatEvent, AgentEvent, AgentMessage, AgentPart };

export function agentChatEventFor(event: AgentChatEvent, chatId: string): boolean {
  return event.chat_id === chatId;
}

function mergeToolPart(
  existing: Extract<AgentPart, { type: "tool_call" }>,
  incoming: Extract<AgentPart, { type: "tool_call" }>,
): Extract<AgentPart, { type: "tool_call" }> {
  return {
    type: "tool_call",
    tool_call_id: incoming.tool_call_id || existing.tool_call_id,
    name:
      isGenericToolLabel(incoming.name) && existing.name
        ? existing.name
        : incoming.name || existing.name,
    title:
      isGenericToolLabel(incoming.title) && existing.title
        ? existing.title
        : (incoming.title ?? existing.title),
    kind: incoming.kind === "other" && existing.kind !== "other" ? existing.kind : incoming.kind,
    status: incoming.status ?? existing.status,
    params:
      isPlaceholderToolParams(incoming.params) && !isPlaceholderToolParams(existing.params)
        ? existing.params
        : (incoming.params ?? existing.params),
    result:
      isPlaceholderToolResult(incoming.result) && !isPlaceholderToolResult(existing.result)
        ? existing.result
        : incoming.result == null
          ? existing.result
          : incoming.result,
  };
}

function settleOrphanToolCalls(parts: AgentPart[]): AgentPart[] {
  return parts.map((part) => {
    if (part.type !== "tool_call") return part;
    if (!isActiveToolStatus(part.status)) return part;
    if (isLiveBackgroundToolCall(part)) return part;
    return { ...part, status: "completed" };
  });
}

function settleFinishedAssistant(message: AgentMessage): AgentMessage {
  if (message.role !== "assistant" || message.streaming) return message;
  return { ...message, parts: settleOrphanToolCalls(message.parts) };
}

function upsertMessage(messages: AgentMessage[], message: AgentMessage): AgentMessage[] {
  const exists = messages.some((item) => item.id === message.id);
  if (!exists) return [...messages, message];
  return messages.map((item) =>
    item.id === message.id
      ? { ...message, created_at: message.created_at ?? item.created_at }
      : item,
  );
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
  const duplicate = messages.findIndex((item) => item.id === id);
  if (duplicate >= 0) {
    return messages.map((item, index) => (index === duplicate ? patch(item) : item));
  }
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
    next[next.length - 1] = { ...last, type, text: `${last.text ?? ""}${delta}` };
    return next;
  }
  next.push({ type, text: delta });
  return next;
}

function stampThinkingPart(
  parts: AgentPart[],
  durationMs: number | null | undefined,
): AgentPart[] {
  if (durationMs == null || durationMs <= 0) return parts;
  const next = [...parts];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const part = next[index];
    if (part?.type !== "thinking") continue;
    next[index] = {
      ...part,
      duration_ms: part.duration_ms != null && part.duration_ms > 0
        ? part.duration_ms + durationMs
        : durationMs,
    };
    break;
  }
  return next;
}

export function dedupeAgentMessages(messages: AgentMessage[]): AgentMessage[] {
  const seen = new Set<string>();
  let hasDuplicate = false;
  for (const message of messages) {
    if (seen.has(message.id)) {
      hasDuplicate = true;
      break;
    }
    seen.add(message.id);
  }
  if (!hasDuplicate) return messages;

  const result: AgentMessage[] = [];
  const indexById = new Map<string, number>();
  for (const message of messages) {
    const existingIndex = indexById.get(message.id);
    if (existingIndex === undefined) {
      indexById.set(message.id, result.length);
      result.push(message);
      continue;
    }
    const userBetween = result.slice(existingIndex + 1).some((item) => item.role === "user");
    if (!userBetween) {
      result[existingIndex] = mergeSameIdMessages(result[existingIndex]!, message);
      continue;
    }
    let nextId = `${message.id}:${result.length}`;
    while (indexById.has(nextId)) nextId = `${nextId}:dup`;
    indexById.set(nextId, result.length);
    result.push({ ...message, id: nextId });
  }
  return result;
}

function mergeSameIdMessages(previous: AgentMessage, incoming: AgentMessage): AgentMessage {
  const parts = [...previous.parts];
  for (const part of incoming.parts) {
    if (part.type === "text") {
      const index = parts.findIndex((item) => item.type === "text");
      if (index >= 0 && parts[index]?.type === "text") {
        const existing = parts[index].text ?? "";
        const next = part.text ?? "";
        parts[index] = {
          type: "text",
          text: next.startsWith(existing)
            ? next
            : existing.startsWith(next)
              ? existing
              : next.length >= existing.length
                ? next
                : existing,
        };
      } else {
        parts.push(part);
      }
      continue;
    }
    if (part.type === "tool_call") {
      const index = parts.findIndex(
        (item) => item.type === "tool_call" && item.tool_call_id === part.tool_call_id,
      );
      if (index >= 0 && parts[index]?.type === "tool_call") {
        parts[index] = mergeToolPart(parts[index], part);
      } else {
        parts.push(part);
      }
      continue;
    }
    if (part.type === "thinking") {
      const index = parts.findIndex(
        (item) => item.type === "thinking" && item.tool_call_id === part.tool_call_id,
      );
      if (index >= 0 && parts[index]?.type === "thinking") {
        const existing = parts[index].text ?? "";
        const next = part.text ?? "";
        parts[index] = {
          ...parts[index],
          text: next.startsWith(existing)
            ? next
            : existing.startsWith(next)
              ? existing
              : next.length >= existing.length
                ? next
                : existing,
        };
      } else {
        parts.push(part);
      }
      continue;
    }
    parts.push(part);
  }
  return {
    ...previous,
    ...incoming,
    id: previous.id,
    created_at: incoming.created_at ?? previous.created_at,
    parts,
    streaming: incoming.streaming ?? previous.streaming,
  };
}

export function hydrateAgentChatMessages(
  persisted: AgentMessage[],
  liveEvents: AgentChatEvent[],
  chatId: string,
  afterSequence: number,
): AgentMessage[] {
  let messages = dedupeAgentMessages(
    persisted.map((message) => ({
      ...message,
      parts: message.parts ?? [],
    })),
  );
  for (const event of liveEvents) {
    if (typeof event.sequence === "number" && event.sequence <= afterSequence) continue;
    messages = foldMessagesFromEvent(messages, event, chatId);
  }
  return messages.map(settleFinishedAssistant);
}

export function foldMessagesFromEvent(
  messages: AgentMessage[],
  event: AgentChatEvent,
  chatId: string,
): AgentMessage[] {
  return dedupeAgentMessages(foldAgentChatEvent(messages, event, chatId));
}

function foldAgentChatEvent(
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
      created_at: payload.created_at,
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
      parts: stampThinkingPart(message.parts, payload.thinking_ms),
      thinking_ms: payload.thinking_ms != null
        ? (message.thinking_ms ?? 0) + payload.thinking_ms
        : message.thinking_ms,
    }));
  }

  if (payload.type === "turn_completed") {
    const errorMessage = payload.error?.trim();
    const failed = payload.status === "failed" && Boolean(errorMessage);
    const settled = messages.map((item) =>
      item.role === "assistant"
        ? { ...item, streaming: false, parts: settleOrphanToolCalls(item.parts) }
        : item,
    );
    if (!failed || !errorMessage) {
      const current = currentTurnAssistant(settled);
      if (!current) return settled;
      return settled.map((item, index) =>
        index === current.index
          ? {
              ...item,
              worked_ms: payload.worked_ms ?? item.worked_ms,
              thinking_ms: payload.thinking_ms ?? item.thinking_ms,
              completed_at: payload.completed_at ?? item.completed_at,
              usage: payload.usage ?? item.usage,
            }
          : item,
      );
    }
    return patchCurrentTurnAssistant(settled, undefined, (message) => ({
      ...message,
      streaming: false,
      parts: [
        ...message.parts.filter((part) => part.type !== "error"),
        { type: "error", message: errorMessage },
      ],
      worked_ms: payload.worked_ms ?? message.worked_ms,
      thinking_ms: payload.thinking_ms ?? message.thinking_ms,
      completed_at: payload.completed_at ?? message.completed_at,
      usage: payload.usage ?? message.usage,
    }));
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
    const name = isGenericToolLabel(tool.name) && existingTool ? existingTool.name : (tool.name || "Tool");
    const kind = wireToolKind(tool.kind);
    const part: Extract<AgentPart, { type: "tool_call" }> = {
      type: "tool_call",
      tool_call_id: tool.tool_call_id,
      name,
      title: tool.title,
      status: tool.status
        ?? (payload.type === "tool_call_started"
          ? "running"
          : payload.type === "tool_call_completed"
            ? "completed"
            : payload.type === "tool_call_failed"
              ? "failed"
              : undefined),
      kind,
      params: tool.params ?? existingTool?.params ?? defaultToolParams(kind),
      result: tool.result ?? existingTool?.result,
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

  if (payload.type === "session_lifecycle") {
    return patchCurrentTurnAssistant(messages, payload.message_id, (message) => {
      const next: AgentPart = {
        type: "session_lifecycle",
        action: payload.action,
        status: payload.status,
        duration_ms: payload.duration_ms,
        error: payload.error,
      };
      const parts = [...message.parts];
      const existing = parts.findIndex((row) => row.type === "session_lifecycle");
      if (existing >= 0) parts[existing] = next;
      else parts.unshift(next);
      return { ...message, streaming: true, parts };
    });
  }

  if (payload.type === "session_config_change") {
    return patchCurrentTurnAssistant(messages, payload.message_id, (message) => {
      const next: AgentPart = {
        type: "session_config_change",
        model: payload.model,
        mode: payload.mode,
      };
      const parts = [...message.parts];
      const existing = parts.findIndex((row) => row.type === "session_config_change");
      if (existing >= 0) {
        parts[existing] = next;
      } else {
        const afterSession = parts.findLastIndex((row) => row.type === "session_lifecycle");
        parts.splice(afterSession + 1, 0, next);
      }
      return { ...message, streaming: true, parts };
    });
  }

  if (
    payload.type === "session_op_requested"
    || payload.type === "session_op_resolved"
    || payload.type === "session_forked"
    || payload.type === "rewind_view_updated"
    || payload.type === "permission_requested"
    || payload.type === "permission_resolved"
    || payload.type === "unknown"
  ) {
    return messages;
  }

  if (payload.type === "session_hint") {
    return patchCurrentTurnAssistant(messages, payload.message_id, (message) => {
      const next: AgentPart = {
        type: "session_hint",
        tone: payload.tone,
        kind: payload.kind,
      };
      const parts = [...message.parts];
      const existing = parts.findIndex(
        (row) => row.type === "session_hint" && row.kind === payload.kind,
      );
      if (existing >= 0) {
        parts[existing] = next;
      } else {
        const afterChrome = parts.findLastIndex(
          (row) =>
            row.type === "session_lifecycle"
            || row.type === "session_config_change"
            || row.type === "session_hint",
        );
        parts.splice(afterChrome + 1, 0, next);
      }
      return { ...message, streaming: true, parts };
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
      parts: settleOrphanToolCalls(last.parts),
    },
  ];
}
