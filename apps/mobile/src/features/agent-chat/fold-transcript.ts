import {
  applyPartClosed,
  applyTextChunk,
  applyToolCall,
  createPartStore,
  type BackfillRequest,
  type Part,
  type PartStore,
  type ToolCallState,
} from "@atmos/api-client/agent-chat";
import type {
  AgentChatEvent,
  AgentChatPayload,
  AgentChatSnapshot,
  AgentMessage,
  AgentPart,
  AgentQueueItem,
  AgentSessionOpRequest,
  AgentTool,
} from "@atmos/api-types/ws/dto/agent-chat";
import { normalizeSlashCommands, type SlashCommand } from "./composer-suggestions";
import { eventsForChat } from "./foreign-event";
import { defaultToolParams, wireToolKind } from "./tool-kind";

export type PendingPermission = NonNullable<AgentChatSnapshot["pending_permission"]>;

export type ChatTranscriptState = {
  chatId: string;
  messages: AgentMessage[];
  pendingPermission: PendingPermission | null;
  pendingSessionOp: AgentSessionOpRequest | null;
  queue: AgentQueueItem[];
  runningTurnId: string | null;
  commands: SlashCommand[];
  store: PartStore;
};

export type AppliedChatEvent = {
  state: ChatTranscriptState;
  backfill: BackfillRequest | null;
};

type ToolEvent = Extract<
  AgentChatPayload,
  { type: "tool_call_started" | "tool_call_updated" | "tool_call_completed" | "tool_call_failed" }
>;

function stampPart(message: AgentMessage, part: AgentPart, index: number): AgentPart {
  if (part.type === "text" && !part.message_id) {
    return { ...part, message_id: `${message.id}:${index}` };
  }
  if (part.type === "thinking" && !part.tool_call_id) {
    return { ...part, tool_call_id: `${message.id}:${index}` };
  }
  return part;
}

function seedStore(messages: AgentMessage[]): PartStore {
  const store = createPartStore();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    message.parts.forEach((part, index) => {
      if (part.type === "text" || part.type === "thinking") {
        const partId = part.type === "thinking"
          ? (part.tool_call_id || `${message.id}:${index}`)
          : (part.message_id || `${message.id}:${index}`);
        applyTextChunk(store, {
          type: "text_chunk",
          part_id: partId,
          message_id: message.id,
          parent_part_id: part.parent_tool_call_id ?? null,
          ordinal: index,
          kind: part.type === "thinking" ? "thinking" : "answer",
          offset: 0,
          text: part.text,
        });
        if (!message.streaming) {
          applyPartClosed(store, { type: "part_closed", part_id: partId });
        }
        return;
      }
      if (part.type === "tool_call") {
        applyToolCall(store, {
          tool_call_id: part.tool_call_id,
          parent_tool_call_id: part.parent_tool_call_id,
          status: part.status,
          name: part.name,
          title: part.title,
          kind: part.kind,
          params: part.params,
          result: part.result,
        });
      }
    });
  }
  return store;
}

export function createChatTranscript(
  chatId: string,
  messages: AgentMessage[] = [],
): ChatTranscriptState {
  const normalized = messages.map((message) => ({
    ...message,
    parts: message.parts.map((part, index) => stampPart(message, part, index)),
    streaming: message.role === "assistant" ? Boolean(message.streaming) : false,
  }));
  return {
    chatId,
    messages: normalized,
    pendingPermission: null,
    pendingSessionOp: null,
    queue: [],
    runningTurnId: null,
    commands: [],
    store: seedStore(normalized),
  };
}

function sameStreamPart(part: AgentPart, partId: string): boolean {
  if (part.type === "text") return part.message_id === partId;
  if (part.type === "thinking") return part.tool_call_id === partId;
  return false;
}

function assistantStreaming(store: PartStore, messageId: string): boolean {
  for (const part of store.parts.values()) {
    if (part.message_id !== messageId) continue;
    if (part.body.type === "text" && part.closed_at == null) return true;
  }
  return false;
}

function textPartFromStore(part: Part): AgentPart | null {
  if (part.body.type !== "text") return null;
  if (part.body.kind === "thinking") {
    return {
      type: "thinking",
      text: part.body.text,
      tool_call_id: part.id,
      parent_tool_call_id: part.parent_part_id,
      message_id: part.message_id,
    };
  }
  return {
    type: "text",
    text: part.body.text,
    parent_tool_call_id: part.parent_part_id,
    message_id: part.id,
  };
}

function currentTurnStart(messages: AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index + 1;
  }
  return 0;
}

function currentTurnAssistant(messages: AgentMessage[]): AgentMessage | null {
  const start = currentTurnStart(messages);
  for (let index = messages.length - 1; index >= start; index -= 1) {
    if (messages[index]?.role === "assistant") return messages[index] ?? null;
  }
  return null;
}

function withCurrentAssistant(
  messages: AgentMessage[],
  turnId: string | null | undefined,
  patch: (message: AgentMessage) => AgentMessage,
): AgentMessage[] {
  const current = currentTurnAssistant(messages);
  if (!current) {
    return [...messages, patch({
      id: turnId?.trim() || "assistant",
      role: "assistant",
      parts: [],
      streaming: true,
    })];
  }
  return messages.map((message) => (message === current ? patch(message) : message));
}

function adoptToolMessageId(messages: AgentMessage[], messageId: string): AgentMessage[] {
  const current = currentTurnAssistant(messages);
  if (!current || current.id === messageId) return messages;
  const hasText = current.parts.some((part) => part.type === "text" || part.type === "thinking");
  if (hasText) return messages;
  return messages.map((message) => (
    message === current ? { ...message, id: messageId } : message
  ));
}

function upsertAssistantPart(
  messages: AgentMessage[],
  messageId: string,
  partId: string,
  nextPart: AgentPart,
  streaming: boolean,
): AgentMessage[] {
  const hosted = adoptToolMessageId(messages, messageId);
  const index = hosted.findIndex((message) => message.id === messageId && message.role === "assistant");
  if (index < 0) {
    return [...hosted, { id: messageId, role: "assistant", parts: [nextPart], streaming }];
  }
  const current = hosted[index]!;
  const parts = [...current.parts];
  const partIndex = parts.findIndex((part) => sameStreamPart(part, partId));
  if (partIndex >= 0) parts[partIndex] = nextPart;
  else parts.push(nextPart);
  const next = [...hosted];
  next[index] = { ...current, parts, streaming };
  return next;
}

function toolStateFromEvent(payload: ToolEvent): ToolCallState {
  const tool: AgentTool = payload.tool_call;
  const status = payload.type === "tool_call_started"
    ? "running"
    : payload.type === "tool_call_completed"
      ? "completed"
      : payload.type === "tool_call_failed"
        ? "failed"
        : tool.status;
  const kind = wireToolKind(tool.kind);
  const errorResult = payload.type === "tool_call_failed" && payload.error?.trim()
    ? { type: "error" as const, message: payload.error }
    : null;
  return {
    tool_call_id: tool.tool_call_id,
    parent_tool_call_id: tool.parent_tool_call_id,
    status,
    name: tool.name,
    title: tool.title,
    kind,
    params: tool.params ?? defaultToolParams(kind),
    result: tool.result ?? errorResult,
  };
}

function toolPartFromState(tool: ToolCallState): Extract<AgentPart, { type: "tool_call" }> {
  const kind = wireToolKind(tool.kind);
  return {
    type: "tool_call",
    tool_call_id: tool.tool_call_id,
    parent_tool_call_id: tool.parent_tool_call_id,
    name: tool.name ?? "",
    title: tool.title,
    kind,
    status: tool.status,
    params: tool.params ?? defaultToolParams(kind),
    result: tool.result,
  };
}

function closeOpenText(store: PartStore) {
  for (const part of store.parts.values()) {
    if (part.body.type === "text" && part.closed_at == null) {
      applyPartClosed(store, { type: "part_closed", part_id: part.id });
    }
  }
}

function unchanged(state: ChatTranscriptState): AppliedChatEvent {
  return { state, backfill: null };
}

export function applyChatEvent(state: ChatTranscriptState, event: AgentChatEvent): AppliedChatEvent {
  if (!eventsForChat(event, state.chatId)) return unchanged(state);
  const payload = event.payload;
  if (!payload?.type) return unchanged(state);

  if (payload.type === "user_message") {
    const parts: AgentPart[] = [{ type: "text", text: payload.text }];
    for (const path of payload.attachments ?? []) {
      parts.push({
        type: "attachment",
        path,
        name: path.split(/[\\/]/).filter(Boolean).at(-1) ?? path,
      });
    }
    const nextMessage: AgentMessage = {
      id: payload.message_id,
      role: "user",
      kind: payload.kind,
      parts,
      created_at: payload.created_at,
      streaming: false,
    };
    const index = state.messages.findIndex((message) => message.id === nextMessage.id && message.role === "user");
    const messages = index >= 0
      ? state.messages.map((message, messageIndex) => (messageIndex === index ? nextMessage : message))
      : [...state.messages, nextMessage];
    return { state: { ...state, messages }, backfill: null };
  }

  if (payload.type === "text_chunk") {
    const backfill = applyTextChunk(state.store, payload);
    const stored = state.store.parts.get(payload.part_id);
    if (!stored || stored.body.type !== "text" || (stored.text.length === 0 && backfill)) {
      return { state, backfill };
    }
    const nextPart = textPartFromStore(stored);
    if (!nextPart) return { state, backfill };
    const messages = upsertAssistantPart(
      state.messages,
      payload.message_id,
      payload.part_id,
      nextPart,
      assistantStreaming(state.store, payload.message_id),
    );
    return { state: { ...state, messages }, backfill };
  }

  if (payload.type === "part_closed") {
    applyPartClosed(state.store, payload);
    const stored = state.store.parts.get(payload.part_id);
    if (!stored) return unchanged(state);
    const messages = state.messages.map((message) => {
      if (message.id !== stored.message_id || message.role !== "assistant") return message;
      const parts = message.parts.map((part) => {
        if (!sameStreamPart(part, payload.part_id)) return part;
        if (part.type === "thinking" && payload.duration_ms != null) {
          return { ...part, duration_ms: payload.duration_ms };
        }
        return part;
      });
      return {
        ...message,
        parts,
        streaming: assistantStreaming(state.store, message.id),
      };
    });
    return { state: { ...state, messages }, backfill: null };
  }

  if (
    payload.type === "tool_call_started"
    || payload.type === "tool_call_updated"
    || payload.type === "tool_call_completed"
    || payload.type === "tool_call_failed"
  ) {
    if (!payload.tool_call?.tool_call_id) return unchanged(state);
    const incoming = toolStateFromEvent(payload);
    applyToolCall(state.store, incoming);
    const stored = state.store.parts.get(incoming.tool_call_id);
    const merged = stored?.body.type === "tool_call" ? stored.body.tool : incoming;
    const toolPart = toolPartFromState(merged);
    const active = toolPart.status === "running" || toolPart.status === "pending";
    const messages = withCurrentAssistant(state.messages, event.turn_id, (message) => {
      const parts = [...message.parts];
      const existing = parts.findIndex((part) => part.type === "tool_call" && part.tool_call_id === toolPart.tool_call_id);
      if (existing >= 0) parts[existing] = toolPart;
      else parts.push(toolPart);
      return { ...message, parts, streaming: Boolean(message.streaming) || active };
    });
    return { state: { ...state, messages }, backfill: null };
  }

  if (payload.type === "turn_started") {
    return { state: { ...state, runningTurnId: payload.turn_id }, backfill: null };
  }

  if (payload.type === "turn_completed") {
    closeOpenText(state.store);
    const current = currentTurnAssistant(state.messages);
    const errorText = payload.error?.trim() ?? "";
    const messages = state.messages.map((message) => {
      if (message.role !== "assistant") return message;
      if (!current || message !== current) {
        return message.streaming ? { ...message, streaming: false } : message;
      }
      const parts = errorText
        ? [...message.parts.filter((part) => part.type !== "error"), { type: "error" as const, message: errorText }]
        : message.parts;
      return {
        ...message,
        parts,
        streaming: false,
        worked_ms: payload.worked_ms ?? message.worked_ms,
        thinking_ms: payload.thinking_ms ?? message.thinking_ms,
        completed_at: payload.completed_at ?? message.completed_at,
        usage: payload.usage ?? message.usage,
      };
    });
    const runningTurnId = state.runningTurnId === payload.turn_id ? null : state.runningTurnId;
    return { state: { ...state, messages, runningTurnId }, backfill: null };
  }

  if (payload.type === "permission_requested") {
    const request = payload.request;
    return {
      state: {
        ...state,
        pendingPermission: {
          request_id: request.request_id,
          tool: request.tool ?? "",
          description: request.description ?? "",
          content_markdown: request.content_markdown,
          options: request.options,
          questions: request.questions,
          plan_todos: request.plan_todos,
          status: "pending",
        },
      },
      backfill: null,
    };
  }

  if (payload.type === "permission_resolved") {
    if (state.pendingPermission?.request_id !== payload.request_id) return unchanged(state);
    return { state: { ...state, pendingPermission: null }, backfill: null };
  }

  if (payload.type === "session_op_requested") {
    return { state: { ...state, pendingSessionOp: payload.request }, backfill: null };
  }

  if (payload.type === "session_op_resolved") {
    if (state.pendingSessionOp?.request_id !== payload.request_id) return unchanged(state);
    return { state: { ...state, pendingSessionOp: null }, backfill: null };
  }

  if (payload.type === "available_commands_updated") {
    return {
      state: {
        ...state,
        commands: normalizeSlashCommands(payload.commands),
      },
      backfill: null,
    };
  }

  if (payload.type === "queue_updated") {
    return {
      state: {
        ...state,
        queue: payload.items.map((item) => ({
          id: item.id,
          seq: item.seq,
          status: item.status,
          prompt: item.prompt,
          display_prompt: item.display_prompt,
          attachments: item.attachments,
        })),
      },
      backfill: null,
    };
  }

  return unchanged(state);
}
