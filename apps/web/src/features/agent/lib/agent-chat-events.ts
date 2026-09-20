import {
  applyPartClosed,
  applyTextChunk,
  createPartStore,
  mergeToolCallState,
  type BackfillRequest,
  type Part,
  type PartStore,
  type TextChunk,
  type TextKind,
  type ToolCallState,
  type ToolStatus,
} from "@atmos/api-client/agent-chat";
import type {
  AgentChatEvent,
  AgentEvent,
  AgentMessage,
  AgentPart,
  AgentTool,
} from "@atmos/api-types/ws/dto/agent-chat";
import { settlePendingUserMessage } from "@/features/agent/lib/agent-chat-pending-echo";
import {
  defaultToolParams,
  isActiveToolStatus,
  wireToolKind,
} from "@/features/agent/lib/agent-tool-kind";
import { isLiveBackgroundToolCall } from "@/features/agent/lib/agent/background-command";
import { isGrokChromeSubagent } from "@/features/agent/lib/grok-chrome";

export type { AgentChatEvent, AgentEvent, AgentMessage, AgentPart };

export type FoldedChatEvent = {
  messages: AgentMessage[];
  backfill: BackfillRequest | null;
};

export function backfillInFlightKey(req: BackfillRequest): string {
  return `${req.partId}:${req.fromOffset}`;
}

export function takeBackfillRequest(
  inflight: Set<string>,
  req: BackfillRequest | null,
): BackfillRequest | null {
  if (!req) return null;
  const key = backfillInFlightKey(req);
  if (inflight.has(key)) return null;
  inflight.add(key);
  return req;
}

export function releaseBackfillRequest(inflight: Set<string>, req: BackfillRequest): void {
  inflight.delete(backfillInFlightKey(req));
}

type FoldedPartMeta = {
  part_id?: string;
  ordinal?: number;
  closed_at?: string | null;
};

function asMeta(part: AgentPart): FoldedPartMeta {
  return part as AgentPart & FoldedPartMeta;
}

function withMeta(part: AgentPart, meta: FoldedPartMeta): AgentPart {
  return Object.assign({}, part, meta);
}

export function agentChatEventFor(event: AgentChatEvent, chatId: string): boolean {
  return event.chat_id === chatId;
}

function asToolCallState(
  tool: AgentTool,
  fallbackStatus: ToolStatus,
): ToolCallState {
  return {
    tool_call_id: tool.tool_call_id,
    parent_tool_call_id: tool.parent_tool_call_id,
    status: (tool.status ?? fallbackStatus) as ToolStatus,
    name: tool.name,
    title: tool.title,
    kind: tool.kind != null ? wireToolKind(tool.kind) : undefined,
    params: tool.params,
    result: tool.result,
  };
}

function toolPartFromState(
  state: ToolCallState,
  existing?: Extract<AgentPart, { type: "tool_call" }>,
): Extract<AgentPart, { type: "tool_call" }> {
  const kind = state.kind ?? existing?.kind ?? "other";
  return {
    type: "tool_call",
    tool_call_id: state.tool_call_id,
    parent_tool_call_id: state.parent_tool_call_id ?? existing?.parent_tool_call_id,
    name: state.name ?? existing?.name ?? "",
    title: state.title ?? existing?.title,
    kind,
    status: state.status,
    params: state.params ?? existing?.params ?? defaultToolParams(kind),
    result: state.result === undefined ? existing?.result : state.result,
  };
}

function toolPartToState(part: Extract<AgentPart, { type: "tool_call" }>): ToolCallState {
  return {
    tool_call_id: part.tool_call_id,
    parent_tool_call_id: part.parent_tool_call_id,
    status: part.status as ToolStatus,
    name: part.name,
    title: part.title,
    kind: part.kind,
    params: part.params,
    result: part.result,
  };
}

function settleOrphanToolCalls(parts: AgentPart[]): AgentPart[] {
  return parts.map((part) => {
    if (part.type !== "tool_call") return part;
    if (!isActiveToolStatus(part.status)) return part;
    if (isLiveBackgroundToolCall(part)) return part;
    if (isGrokChromeSubagent(part)) return part;
    return { ...part, status: "completed" };
  });
}

function settleFinishedAssistant(message: AgentMessage): AgentMessage {
  if (message.role !== "assistant" || message.streaming) return message;
  return { ...message, parts: settleOrphanToolCalls(message.parts) };
}

function lastUserIndex(messages: AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

export function currentTurnHasRunningSubagent(messages: AgentMessage[]): boolean {
  const start = lastUserIndex(messages) + 1;
  for (let index = start; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    for (const part of message.parts) {
      if (
        part.type === "tool_call"
        && part.kind === "subagent"
        && !isGrokChromeSubagent(part)
        && isActiveToolStatus(part.status)
      ) {
        return true;
      }
    }
  }
  return false;
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

function hasActiveForegroundWork(parts: AgentPart[]): boolean {
  return parts.some((part) => {
    if (part.type !== "tool_call") return false;
    if (!isActiveToolStatus(part.status)) return false;
    if (isGrokChromeSubagent(part)) return false;
    return !isLiveBackgroundToolCall(part);
  });
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
  const id = preferred || `assistant:${messages[start - 1]?.id ?? messages.length}`;
  return [
    ...messages,
    patch({
      id,
      role: "assistant",
      parts: [],
    }),
  ];
}

function projectedPartId(part: AgentPart): string | undefined {
  const meta = asMeta(part);
  if (meta.part_id?.trim()) return meta.part_id.trim();
  if (part.type === "text") return part.message_id?.trim() || undefined;
  if (part.type === "thinking") return part.tool_call_id?.trim() || undefined;
  return undefined;
}

function partIsOpen(part: AgentPart): boolean {
  if (part.type !== "text" && part.type !== "thinking") return false;
  const closedAt = asMeta(part).closed_at;
  return closedAt == null;
}

function deriveStreaming(message: AgentMessage): AgentMessage {
  if (message.role !== "assistant") return message;
  return {
    ...message,
    streaming: message.parts.some(partIsOpen),
  };
}

function inferredClosedAt(part: AgentPart, message: AgentMessage): string | null {
  const meta = asMeta(part);
  if (meta.closed_at !== undefined) return meta.closed_at;
  if (message.streaming) return null;
  return message.completed_at ?? "closed";
}

function seedPartStore(messages: AgentMessage[]): PartStore {
  const store = createPartStore();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    message.parts.forEach((part, index) => {
      if (part.type !== "text" && part.type !== "thinking") return;
      const partId = projectedPartId(part);
      if (!partId || store.parts.has(partId)) return;
      const kind: TextKind = part.type === "thinking" ? "thinking" : "answer";
      const chunk: TextChunk = {
        type: "text_chunk",
        part_id: partId,
        message_id: message.id,
        parent_part_id: part.parent_tool_call_id ?? null,
        ordinal: asMeta(part).ordinal ?? index,
        kind,
        offset: 0,
        text: part.text ?? "",
      };
      applyTextChunk(store, chunk);
      const closedAt = inferredClosedAt(part, message);
      if (closedAt != null) {
        applyPartClosed(store, { type: "part_closed", part_id: partId });
        const created = store.parts.get(partId);
        if (created) created.closed_at = closedAt;
      }
    });
  }
  return store;
}

function collectDurations(messages: AgentMessage[]): Map<string, number> {
  const durations = new Map<string, number>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "thinking") continue;
      if (part.duration_ms == null || part.duration_ms <= 0) continue;
      const partId = projectedPartId(part);
      if (partId) durations.set(partId, part.duration_ms);
    }
  }
  return durations;
}

function toAgentPart(part: Part, durationMs?: number): AgentPart {
  const parent = part.parent_part_id ?? undefined;
  const meta: FoldedPartMeta = {
    part_id: part.id,
    ordinal: part.ordinal,
    closed_at: part.closed_at,
  };
  if (part.body.type === "text" && part.body.kind === "thinking") {
    return withMeta(
      {
        type: "thinking",
        text: part.body.text,
        tool_call_id: part.id,
        duration_ms: durationMs,
        parent_tool_call_id: parent,
      },
      meta,
    );
  }
  return withMeta(
    {
      type: "text",
      text: part.body.type === "text" ? part.body.text : "",
      parent_tool_call_id: parent,
      message_id: part.id,
    },
    meta,
  );
}

function upsertStoreParts(
  message: AgentMessage,
  store: PartStore,
  durations: Map<string, number>,
): AgentPart[] {
  const parts = [...message.parts];
  const storeParts = [...store.parts.values()]
    .filter((part) => part.message_id === message.id && part.body.type === "text")
    .sort((left, right) => left.ordinal - right.ordinal);

  for (const part of storeParts) {
    const agentPart = toAgentPart(part, durations.get(part.id));
    const existing = parts.findIndex((item) => projectedPartId(item) === part.id);
    if (existing >= 0) {
      parts[existing] = agentPart;
      continue;
    }
    let insertAt = parts.length;
    for (let index = 0; index < parts.length; index += 1) {
      const ordinal = asMeta(parts[index]!).ordinal;
      if (typeof ordinal === "number" && ordinal > part.ordinal) {
        insertAt = index;
        break;
      }
    }
    parts.splice(insertAt, 0, agentPart);
  }
  return parts;
}

function projectedPartUnchanged(previous: AgentPart, next: AgentPart): boolean {
  if (previous === next) return true;
  if (previous.type !== next.type) return false;
  if (projectedPartId(previous) !== projectedPartId(next)) return false;
  const prevMeta = asMeta(previous);
  const nextMeta = asMeta(next);
  if (prevMeta.closed_at !== nextMeta.closed_at) return false;
  if (prevMeta.ordinal !== nextMeta.ordinal) return false;
  if (previous.type === "text" && next.type === "text") {
    return previous.text === next.text
      && previous.parent_tool_call_id === next.parent_tool_call_id;
  }
  if (previous.type === "thinking" && next.type === "thinking") {
    return previous.text === next.text
      && previous.duration_ms === next.duration_ms
      && previous.parent_tool_call_id === next.parent_tool_call_id;
  }
  return false;
}

function reuseProjectedParts(previous: AgentPart[], next: AgentPart[]): AgentPart[] {
  if (previous.length !== next.length) return next;
  let changed = false;
  const reused = next.map((part, index) => {
    const prev = previous[index];
    if (prev && projectedPartUnchanged(prev, part)) return prev;
    changed = true;
    return part;
  });
  return changed ? reused : previous;
}

function projectMessages(
  messages: AgentMessage[],
  store: PartStore,
  durations: Map<string, number>,
): AgentMessage[] {
  let listChanged = false;
  const next = messages.map((message) => {
    if (message.role !== "assistant") return message;
    const parts = reuseProjectedParts(
      message.parts,
      upsertStoreParts(message, store, durations),
    );
    const streaming = parts.some(partIsOpen);
    if (parts === message.parts && Boolean(message.streaming) === streaming) {
      return message;
    }
    listChanged = true;
    return { ...message, parts, streaming };
  });
  return listChanged ? next : messages;
}

function bindPartToMessage(store: PartStore, partId: string, messageId: string): void {
  const part = store.parts.get(partId);
  if (part) part.message_id = messageId;
}

function ensureCurrentTurnAssistant(
  messages: AgentMessage[],
  preferredId?: string,
): { messages: AgentMessage[]; message: AgentMessage; index: number } {
  const existing = currentTurnAssistant(messages, preferredId);
  if (existing) {
    return { messages, message: existing.message, index: existing.index };
  }
  const start = lastUserIndex(messages) + 1;
  const id = preferredId?.trim() || `assistant:${messages[start - 1]?.id ?? messages.length}`;
  const created: AgentMessage = { id, role: "assistant", parts: [] };
  return { messages: [...messages, created], message: created, index: messages.length };
}

function folded(messages: AgentMessage[]): FoldedChatEvent {
  return { messages, backfill: null };
}

function applyTextToMessages(
  messages: AgentMessage[],
  chunk: TextChunk,
): FoldedChatEvent {
  const store = seedPartStore(messages);
  const durations = collectDurations(messages);
  const backfill = applyTextChunk(store, chunk);
  const target = ensureCurrentTurnAssistant(messages, chunk.message_id);
  bindPartToMessage(store, chunk.part_id, target.message.id);
  return { messages: projectMessages(target.messages, store, durations), backfill };
}

function closePartOnMessages(
  messages: AgentMessage[],
  partId: string,
  durationMs?: number | null,
): AgentMessage[] {
  const store = seedPartStore(messages);
  const durations = collectDurations(messages);
  if (durationMs != null && durationMs > 0) durations.set(partId, durationMs);
  applyPartClosed(store, { type: "part_closed", part_id: partId, duration_ms: durationMs });
  const next = projectMessages(messages, store, durations);
  if (durationMs == null || durationMs <= 0) return next;
  const host = store.parts.get(partId);
  if (!host) return next;
  return next.map((message) =>
    message.id === host.message_id
      ? { ...message, thinking_ms: (message.thinking_ms ?? 0) + durationMs }
      : message,
  );
}

function closeTurnTextParts(messages: AgentMessage[]): AgentMessage[] {
  const store = seedPartStore(messages);
  const durations = collectDurations(messages);
  const start = lastUserIndex(messages) + 1;
  const turnIds = new Set(
    messages.slice(start).filter((item) => item.role === "assistant").map((item) => item.id),
  );
  for (const part of store.parts.values()) {
    if (part.closed_at != null) continue;
    if (!turnIds.has(part.message_id)) continue;
    applyPartClosed(store, { type: "part_closed", part_id: part.id });
  }
  return projectMessages(messages, store, durations);
}

export function hydrateAgentChatMessages(
  persisted: AgentMessage[],
  liveEvents: AgentChatEvent[],
  chatId: string,
): AgentMessage[] {
  let messages = persisted.map((message) => ({
    ...message,
    parts: message.parts ?? [],
  }));
  for (const event of liveEvents) {
    messages = foldMessagesFromEvent(messages, event, chatId);
  }
  return messages.map(settleFinishedAssistant);
}

export function foldMessagesFromEvent(
  messages: AgentMessage[],
  event: AgentChatEvent,
  chatId: string,
): AgentMessage[] {
  return foldAgentChatEventResult(messages, event, chatId).messages;
}

export function foldAgentChatEventResult(
  messages: AgentMessage[],
  event: AgentChatEvent,
  chatId: string,
): FoldedChatEvent {
  return foldAgentChatEvent(messages, event, chatId);
}

function foldAgentChatEvent(
  messages: AgentMessage[],
  event: AgentChatEvent,
  chatId: string,
): FoldedChatEvent {
  if (!agentChatEventFor(event, chatId)) return { messages, backfill: null };
  const payload = event.payload as AgentEvent | undefined;
  if (!payload?.type) return { messages, backfill: null };

  if (payload.type === "user_message") {
    const parts: AgentPart[] = [{ type: "text", text: payload.text ?? "" }];
    for (const path of payload.attachments ?? []) {
      parts.push({
        type: "attachment",
        path,
        name: path.split(/[\\/]/).at(-1) ?? path,
      });
    }
    return folded(settlePendingUserMessage(messages, {
      id: payload.message_id,
      role: "user",
      kind: payload.kind,
      parts,
      created_at: payload.created_at,
    }));
  }

  if (payload.type === "text_chunk") {
    return applyTextToMessages(messages, payload);
  }

  if (payload.type === "part_closed") {
    return folded(closePartOnMessages(messages, payload.part_id, payload.duration_ms));
  }

  if (payload.type === "turn_completed") {
    const closed = closeTurnTextParts(messages);
    if (currentTurnHasRunningSubagent(closed) && payload.status !== "failed") {
      const current = currentTurnAssistant(closed);
      if (!current) return folded(closed);
      return folded(closed.map((item, index) =>
        index === current.index
          ? deriveStreaming({
              ...item,
              completed_at: payload.completed_at ?? item.completed_at ?? payload.turn_id,
              worked_ms: payload.worked_ms ?? item.worked_ms,
              thinking_ms: payload.thinking_ms ?? item.thinking_ms,
              usage: payload.usage ?? item.usage,
            })
          : item,
      ));
    }
    const errorMessage = payload.error?.trim();
    const failed = payload.status === "failed" && Boolean(errorMessage);
    const settled = closed.map((item) =>
      item.role === "assistant"
        ? deriveStreaming({ ...item, parts: settleOrphanToolCalls(item.parts) })
        : item,
    );
    if (!failed || !errorMessage) {
      const current = currentTurnAssistant(settled);
      if (!current) return folded(settled);
      return folded(settled.map((item, index) =>
        index === current.index
          ? deriveStreaming({
              ...item,
              worked_ms: payload.worked_ms ?? item.worked_ms,
              thinking_ms: payload.thinking_ms ?? item.thinking_ms,
              completed_at: payload.completed_at ?? item.completed_at,
              usage: payload.usage ?? item.usage,
            })
          : item,
      ));
    }
    return folded(patchCurrentTurnAssistant(settled, undefined, (message) =>
      deriveStreaming({
        ...message,
        parts: [
          ...message.parts.filter((part) => part.type !== "error"),
          { type: "error", message: errorMessage },
        ],
        worked_ms: payload.worked_ms ?? message.worked_ms,
        thinking_ms: payload.thinking_ms ?? message.thinking_ms,
        completed_at: payload.completed_at ?? message.completed_at,
        usage: payload.usage ?? message.usage,
      }),
    ));
  }

  if (payload.type === "usage_updated" && payload.turn) {
    const current = currentTurnAssistant(messages);
    if (!current) return folded(messages);
    return folded(messages.map((item, index) =>
      index === current.index ? { ...item, usage: payload.turn } : item,
    ));
  }

  if (
    payload.type === "tool_call_started" ||
    payload.type === "tool_call_updated" ||
    payload.type === "tool_call_completed" ||
    payload.type === "tool_call_failed"
  ) {
    const tool = payload.tool_call;
    if (!tool?.tool_call_id) return folded(messages);
    const existingTool = [...messages].reverse().flatMap((message) => message.parts).find(
      (part): part is Extract<AgentPart, { type: "tool_call" }> =>
        part.type === "tool_call" && part.tool_call_id === tool.tool_call_id,
    );
    const inferredStatus: ToolStatus =
      payload.type === "tool_call_started"
        ? "running"
        : payload.type === "tool_call_completed"
          ? "completed"
          : payload.type === "tool_call_failed"
            ? "failed"
            : "pending";
    const incoming = asToolCallState(tool, inferredStatus);
    const merged = existingTool
      ? mergeToolCallState(toolPartToState(existingTool), incoming)
      : incoming;
    const part = toolPartFromState(merged, existingTool);
    return folded(patchCurrentTurnAssistant(messages, undefined, (message) => {
      const parts = [...message.parts];
      const existing = parts.findIndex(
        (row) => row.type === "tool_call" && row.tool_call_id === tool.tool_call_id,
      );
      if (existing >= 0 && parts[existing]?.type === "tool_call") {
        parts[existing] = part;
      } else {
        parts.push(part);
      }
      if (!hasActiveForegroundWork(parts) && message.completed_at) {
        return deriveStreaming({
          ...message,
          parts: settleOrphanToolCalls(parts),
        });
      }
      return deriveStreaming({ ...message, parts });
    }));
  }

  if (payload.type === "plan_updated") {
    return folded(patchCurrentTurnAssistant(messages, undefined, (message) => {
      const planPart: AgentPart = { type: "plan", plan: payload.plan };
      const existing = message.parts.findIndex((row) => row.type === "plan");
      if (existing >= 0) {
        const parts = [...message.parts];
        parts[existing] = planPart;
        return deriveStreaming({ ...message, parts });
      }
      return deriveStreaming({ ...message, parts: [...message.parts, planPart] });
    }));
  }

  if (payload.type === "session_lifecycle") {
    return folded(patchCurrentTurnAssistant(messages, payload.message_id, (message) => {
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
      return deriveStreaming({ ...message, parts });
    }));
  }

  if (payload.type === "session_config_change") {
    return folded(patchCurrentTurnAssistant(messages, payload.message_id, (message) => {
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
      return deriveStreaming({ ...message, parts });
    }));
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
    return folded(messages);
  }

  if (payload.type === "session_hint") {
    return folded(patchCurrentTurnAssistant(messages, payload.message_id, (message) => {
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
      return deriveStreaming({ ...message, parts });
    }));
  }

  return folded(messages);
}

export function textFromParts(parts: AgentPart[]): string {
  return parts
    .filter((part): part is Extract<AgentPart, { type: "text" }> =>
      part.type === "text" && !part.parent_tool_call_id)
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function assistantCopyText(message: AgentMessage): string {
  return message.parts
    .flatMap((part) => {
      if (part.type === "text" && part.text.trim() && !part.parent_tool_call_id) {
        return [part.text.trim()];
      }
      if (part.type === "error" && part.message.trim()) return [part.message.trim()];
      return [];
    })
    .join("\n\n")
    .trim();
}

export function currentPlanFromMessages(messages: AgentMessage[]): unknown | null {
  const start = lastUserIndex(messages) + 1;
  for (let index = messages.length - 1; index >= start; index -= 1) {
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
    deriveStreaming({
      ...last,
      parts: settleOrphanToolCalls(
        last.parts.map((part) => {
          if (part.type !== "text" && part.type !== "thinking") return part;
          if (asMeta(part).closed_at != null) return part;
          return withMeta(part, { closed_at: new Date().toISOString() });
        }),
      ),
    }),
  ];
}
