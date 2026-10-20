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
  AgentSessionUsage,
  AgentTool,
  GrokGoal,
  GrokWorkflow,
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
  sessionUsage: AgentSessionUsage | null;
  grokGoal: GrokGoal | null;
  grokWorkflow: GrokWorkflow | null;
  commands: SlashCommand[];
  store: PartStore;
};

export type AppliedChatEvent = {
  state: ChatTranscriptState;
  backfill: BackfillRequest | null;
};

export const AGENT_CHAT_RESYNC_REPLAY_LIMIT = 256;

export type AppliedChatResync = {
  state: ChatTranscriptState;
  backfills: BackfillRequest[];
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

function seedStore(messages: AgentMessage[], openPartIds?: ReadonlySet<string>): PartStore {
  const store = createPartStore();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    message.parts.forEach((part, index) => {
      if (part.type === "text" || part.type === "thinking") {
        const partId =
          part.type === "thinking"
            ? part.tool_call_id || `${message.id}:${index}`
            : part.message_id || `${message.id}:${index}`;
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
        const closed = openPartIds ? !openPartIds.has(partId) : !message.streaming;
        if (closed) {
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
  snapshot?: {
    session_usage?: AgentSessionUsage | null;
    grok_goal?: GrokGoal | null;
    grok_workflow?: GrokWorkflow | null;
  } | null,
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
    sessionUsage: snapshot?.session_usage ?? null,
    grokGoal: snapshot?.grok_goal ?? null,
    grokWorkflow: snapshot?.grok_workflow ?? null,
    commands: [],
    store: seedStore(normalized),
  };
}

export function transcriptFromAgentChatSnapshot(
  chatId: string,
  snapshot: AgentChatSnapshot,
): ChatTranscriptState {
  const state = createChatTranscript(chatId, snapshot.messages ?? [], snapshot.meta);
  return {
    ...state,
    pendingPermission: snapshot.pending_permission ?? null,
    pendingSessionOp: snapshot.pending_session_op ?? null,
    queue: snapshot.queue ?? [],
    runningTurnId: snapshot.running_turn_id ?? null,
    commands: normalizeSlashCommands(snapshot.meta?.available_commands),
  };
}

export function rememberChatEvent(
  recent: AgentChatEvent[],
  event: AgentChatEvent,
  limit = AGENT_CHAT_RESYNC_REPLAY_LIMIT,
): boolean {
  recent.push(event);
  const extra = recent.length - limit;
  if (extra <= 0) return false;
  recent.splice(0, extra);
  return true;
}

export function pruneChatEvents(recent: AgentChatEvent[], after: number): void {
  let write = 0;
  for (const event of recent) {
    if ((event.revision ?? 0) > after) {
      recent[write] = event;
      write += 1;
    }
  }
  recent.length = write;
}

export function applyAgentChatResync(
  chatId: string,
  snapshot: AgentChatSnapshot,
  recentEvents: ReadonlyArray<AgentChatEvent>,
): AppliedChatResync {
  let state = transcriptFromAgentChatSnapshot(chatId, snapshot);
  const after = snapshot.meta?.last_event_seq ?? 0;
  const backfills: BackfillRequest[] = [];
  for (const event of recentEvents) {
    if (!eventsForChat(event, chatId)) continue;
    const revision = event.revision ?? 0;
    if (revision <= after) continue;
    const next = applyChatEvent(state, event);
    state = next.state;
    if (next.backfill) backfills.push(next.backfill);
  }
  return { state, backfills };
}

function mergeUsageSession(
  existing: AgentSessionUsage | null,
  session: AgentSessionUsage,
): AgentSessionUsage {
  return {
    ...(existing ?? {}),
    ...session,
    used: session.used ?? existing?.used ?? null,
    context_window:
      session.context_window ?? session.size ?? existing?.context_window ?? existing?.size ?? null,
  };
}

function mergeContextUsage(
  existing: AgentSessionUsage | null,
  update: { used: number; context_window?: number | null },
): AgentSessionUsage {
  return {
    ...(existing ?? {}),
    used: update.used,
    context_window: update.context_window ?? existing?.context_window ?? existing?.size ?? null,
    size: undefined,
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
  const found = currentTurnAssistantAt(messages);
  return found?.message ?? null;
}

function currentTurnAssistantAt(
  messages: AgentMessage[],
): { message: AgentMessage; index: number } | null {
  const start = currentTurnStart(messages);
  for (let index = messages.length - 1; index >= start; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") return { message, index };
  }
  return null;
}

function shouldAdoptSnapshotAssistant(prev: AgentMessage, snap: AgentMessage): boolean {
  if (prev.role !== "assistant" || snap.role !== "assistant") return false;
  if (prev.id === snap.id) return false;
  const prevTools = new Set(
    prev.parts
      .filter(
        (part): part is Extract<AgentPart, { type: "tool_call" }> => part.type === "tool_call",
      )
      .map((part) => part.tool_call_id)
      .filter(Boolean),
  );
  if (prevTools.size > 0) {
    for (const part of snap.parts) {
      if (part.type === "tool_call" && prevTools.has(part.tool_call_id)) return true;
    }
  }
  const id = prev.id.trim();
  if (id === "assistant" || id.startsWith("assistant:")) return true;
  return !prev.parts.some((part) => part.type === "text" || part.type === "thinking");
}

function withCurrentAssistant(
  messages: AgentMessage[],
  turnId: string | null | undefined,
  patch: (message: AgentMessage) => AgentMessage,
): AgentMessage[] {
  const current = currentTurnAssistant(messages);
  if (!current) {
    return [
      ...messages,
      patch({
        id: turnId?.trim() || "assistant",
        role: "assistant",
        parts: [],
        streaming: true,
      }),
    ];
  }
  return messages.map((message) => (message === current ? patch(message) : message));
}

function adoptToolMessageId(messages: AgentMessage[], messageId: string): AgentMessage[] {
  const current = currentTurnAssistant(messages);
  if (!current || current.id === messageId) return messages;
  const hasText = current.parts.some((part) => part.type === "text" || part.type === "thinking");
  if (hasText) return messages;
  return messages.map((message) => (message === current ? { ...message, id: messageId } : message));
}

function upsertAssistantPart(
  messages: AgentMessage[],
  messageId: string,
  partId: string,
  nextPart: AgentPart,
  streaming: boolean,
): AgentMessage[] {
  const hosted = adoptToolMessageId(messages, messageId);
  const index = hosted.findIndex(
    (message) => message.id === messageId && message.role === "assistant",
  );
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
  const status =
    payload.type === "tool_call_started"
      ? "running"
      : payload.type === "tool_call_completed"
        ? "completed"
        : payload.type === "tool_call_failed"
          ? "failed"
          : tool.status;
  const kind = wireToolKind(tool.kind);
  const errorResult =
    payload.type === "tool_call_failed" && payload.error?.trim()
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

export function applyChatEvent(
  state: ChatTranscriptState,
  event: AgentChatEvent,
): AppliedChatEvent {
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
    const index = state.messages.findIndex(
      (message) => message.id === nextMessage.id && message.role === "user",
    );
    const messages =
      index >= 0
        ? state.messages.map((message, messageIndex) =>
            messageIndex === index ? nextMessage : message,
          )
        : [...state.messages, nextMessage];
    return { state: { ...state, messages }, backfill: null };
  }

  if (payload.type === "turn_snapshot") {
    const incoming = payload.messages ?? [];
    if (incoming.length === 0) return unchanged(state);
    const open = new Set(payload.open_part_ids ?? []);
    const stamped = incoming.map((message) => {
      const parts = message.parts.map((part, index) => stampPart(message, part, index));
      const streaming = parts.some((part) => {
        if (part.type === "text") return open.has(part.message_id ?? "");
        if (part.type === "thinking") return open.has(part.tool_call_id ?? "");
        return false;
      });
      return { ...message, parts, streaming };
    });
    const byId = new Map(stamped.map((message) => [message.id, message]));
    const seen = new Set<string>();
    const messages: AgentMessage[] = [];
    for (const message of state.messages) {
      const snap = byId.get(message.id);
      if (snap) {
        seen.add(message.id);
        messages.push(snap);
      } else {
        messages.push(message);
      }
    }
    for (const snap of stamped) {
      if (seen.has(snap.id)) continue;
      const current = snap.role === "assistant" ? currentTurnAssistantAt(messages) : null;
      if (
        current &&
        !seen.has(current.message.id) &&
        shouldAdoptSnapshotAssistant(current.message, snap)
      ) {
        seen.add(snap.id);
        messages[current.index] = snap;
        continue;
      }
      seen.add(snap.id);
      messages.push(snap);
    }
    return {
      state: {
        ...state,
        messages,
        store: seedStore(messages, open),
      },
      backfill: null,
    };
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
    payload.type === "tool_call_started" ||
    payload.type === "tool_call_updated" ||
    payload.type === "tool_call_completed" ||
    payload.type === "tool_call_failed"
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
      const existing = parts.findIndex(
        (part) => part.type === "tool_call" && part.tool_call_id === toolPart.tool_call_id,
      );
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
        ? [
            ...message.parts.filter((part) => part.type !== "error"),
            { type: "error" as const, message: errorText },
          ]
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

  if (payload.type === "plan_updated") {
    const messages = withCurrentAssistant(
      state.messages,
      event.turn_id ?? payload.turn_id,
      (message) => {
        const planPart: AgentPart = { type: "plan", plan: payload.plan };
        const existing = message.parts.findIndex((part) => part.type === "plan");
        if (existing >= 0) {
          const parts = [...message.parts];
          parts[existing] = planPart;
          return { ...message, parts };
        }
        return { ...message, parts: [...message.parts, planPart] };
      },
    );
    return { state: { ...state, messages }, backfill: null };
  }

  if (payload.type === "usage_updated") {
    let next = state;
    if (payload.turn) {
      const current = currentTurnAssistant(next.messages);
      if (current) {
        next = {
          ...next,
          messages: next.messages.map((message) =>
            message === current ? { ...message, usage: payload.turn } : message,
          ),
        };
      }
    }
    if (payload.session) {
      next = {
        ...next,
        sessionUsage: mergeUsageSession(next.sessionUsage, payload.session),
      };
    }
    if (next === state) return unchanged(state);
    return { state: next, backfill: null };
  }

  if (payload.type === "context_usage_updated") {
    return {
      state: {
        ...state,
        sessionUsage: mergeContextUsage(state.sessionUsage, {
          used: payload.used,
          context_window: payload.context_window,
        }),
      },
      backfill: null,
    };
  }

  if (payload.type === "grok_goal_updated") {
    return { state: { ...state, grokGoal: payload.grok_goal ?? null }, backfill: null };
  }

  if (payload.type === "grok_workflow_updated") {
    return { state: { ...state, grokWorkflow: payload.grok_workflow ?? null }, backfill: null };
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
