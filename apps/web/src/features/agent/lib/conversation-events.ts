export type ConversationClientEventPayload = {
  conversation_id?: string;
  sequence?: number;
  payload?: {
    type?: string;
    message_id?: string;
    text?: string;
    turn_id?: string;
    kind?: string;
    delta?: string;
    status?: string;
    request?: {
      request_id?: string;
      tool?: string;
      description?: string;
      options?: Array<{ option_id: string; name: string }>;
    };
    request_id?: string;
    items?: Array<{ id: string; seq: number; status: string; prompt: string }>;
    tool_call?: {
      tool_call_id?: string;
      name?: string;
      title?: string;
      status?: string;
    };
    plan?: unknown;
  };
};

export type LiveTurn = {
  id: string;
  status: string;
  messages: Array<{
    id: string;
    role: string;
    kind?: string;
    parts: Array<{
      type: string;
      text?: string;
      name?: string;
      title?: string;
      status?: string;
      message?: string;
      tool_call_id?: string;
    }>;
  }>;
};

export type ConversationFanoutRow = {
  id: string;
  text: string;
};

export function conversationEventFor(
  event: ConversationClientEventPayload,
  conversationId: string,
): boolean {
  return event.conversation_id === conversationId;
}

export function foldUserRowsFromEvent(
  rows: ConversationFanoutRow[],
  event: ConversationClientEventPayload,
  conversationId: string,
): ConversationFanoutRow[] {
  if (!conversationEventFor(event, conversationId)) return rows;
  if (event.payload?.type !== "user_message") return rows;
  const id = event.payload.message_id;
  const text = event.payload.text;
  if (!id || !text) return rows;
  if (rows.some((row) => row.id === id)) return rows;
  return [...rows, { id, text }];
}

function upsertTurn(turns: LiveTurn[], turnId: string): LiveTurn[] {
  if (turns.some((turn) => turn.id === turnId)) return turns;
  return [...turns, { id: turnId, status: "running", messages: [] }];
}

function upsertMessage(
  turns: LiveTurn[],
  turnId: string,
  message: LiveTurn["messages"][number],
): LiveTurn[] {
  const next = upsertTurn(turns, turnId);
  return next.map((turn) => {
    if (turn.id !== turnId) return turn;
    const exists = turn.messages.some((item) => item.id === message.id);
    return {
      ...turn,
      messages: exists
        ? turn.messages.map((item) => (item.id === message.id ? message : item))
        : [...turn.messages, message],
    };
  });
}

export function foldTurnsFromEvent(
  turns: LiveTurn[],
  event: ConversationClientEventPayload,
  conversationId: string,
): LiveTurn[] {
  if (!conversationEventFor(event, conversationId)) return turns;
  const payload = event.payload;
  if (!payload?.type) return turns;
  if (payload.type === "turn_started" && payload.turn_id) {
    return upsertTurn(turns, payload.turn_id).map((turn) =>
      turn.id === payload.turn_id ? { ...turn, status: "running" } : turn,
    );
  }
  if (payload.type === "user_message" && payload.turn_id && payload.message_id) {
    return upsertMessage(turns, payload.turn_id, {
      id: payload.message_id,
      role: "user",
      kind: payload.kind,
      parts: [{ type: "text", text: payload.text ?? "" }],
    });
  }
  if (
    (payload.type === "assistant_message_delta" || payload.type === "thinking_delta") &&
    payload.message_id
  ) {
    const partType = payload.type === "thinking_delta" ? "thinking" : "text";
    const delta = payload.delta ?? payload.text ?? "";
    const turnId = payload.turn_id ?? turns[turns.length - 1]?.id;
    if (!turnId) return turns;
    const next = upsertTurn(turns, turnId);
    return next.map((turn) => {
      if (turn.id !== turnId) return turn;
      const existing = turn.messages.find((item) => item.id === payload.message_id);
      if (!existing) {
        return {
          ...turn,
          messages: [
            ...turn.messages,
            {
              id: payload.message_id!,
              role: "assistant",
              parts: [{ type: partType, text: delta }],
            },
          ],
        };
      }
      return {
        ...turn,
        messages: turn.messages.map((item) => {
          if (item.id !== payload.message_id) return item;
          const parts = [...item.parts];
          const last = parts[parts.length - 1];
          if (last && last.type === partType) {
            parts[parts.length - 1] = { ...last, text: `${last.text ?? ""}${delta}` };
          } else {
            parts.push({ type: partType, text: delta });
          }
          return { ...item, parts };
        }),
      };
    });
  }
  if (payload.type === "turn_completed" && payload.turn_id) {
    return turns.map((turn) =>
      turn.id === payload.turn_id ? { ...turn, status: payload.status ?? "completed" } : turn,
    );
  }
  if (
    (payload.type === "tool_call_started" ||
      payload.type === "tool_call_updated" ||
      payload.type === "tool_call_completed" ||
      payload.type === "tool_call_failed") &&
    payload.tool_call?.tool_call_id
  ) {
    const turnId = payload.turn_id ?? turns[turns.length - 1]?.id;
    if (!turnId) return turns;
    const tool = payload.tool_call;
    const part = {
      type: "tool_call",
      tool_call_id: tool.tool_call_id,
      name: tool.name,
      title: tool.title,
      status: tool.status,
    };
    const next = upsertTurn(turns, turnId);
    return next.map((turn) => {
      if (turn.id !== turnId) return turn;
      const assistant = [...turn.messages].reverse().find((item) => item.role === "assistant");
      if (!assistant) {
        return {
          ...turn,
          messages: [
            ...turn.messages,
            {
              id: `tool-${tool.tool_call_id}`,
              role: "assistant",
              parts: [part],
            },
          ],
        };
      }
      return {
        ...turn,
        messages: turn.messages.map((item) => {
          if (item.id !== assistant.id) return item;
          const parts = [...item.parts];
          const existing = parts.findIndex(
            (row) => row.type === "tool_call" && row.tool_call_id === tool.tool_call_id,
          );
          if (existing >= 0) {
            parts[existing] = { ...parts[existing], ...part };
          } else {
            parts.push(part);
          }
          return { ...item, parts };
        }),
      };
    });
  }
  if (payload.type === "plan_updated") {
    const turnId = payload.turn_id ?? turns[turns.length - 1]?.id;
    if (!turnId) return turns;
    const next = upsertTurn(turns, turnId);
    return next.map((turn) => {
      if (turn.id !== turnId) return turn;
      const assistant = [...turn.messages].reverse().find((item) => item.role === "assistant");
      if (!assistant) {
        return {
          ...turn,
          messages: [
            ...turn.messages,
            { id: `plan-${turnId}`, role: "assistant", parts: [{ type: "plan" }] },
          ],
        };
      }
      return {
        ...turn,
        messages: turn.messages.map((item) => {
          if (item.id !== assistant.id) return item;
          if (item.parts.some((row) => row.type === "plan")) return item;
          return { ...item, parts: [...item.parts, { type: "plan" }] };
        }),
      };
    });
  }
  return turns;
}
