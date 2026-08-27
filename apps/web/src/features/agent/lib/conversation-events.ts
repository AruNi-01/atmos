export type ConversationClientEventPayload = {
  conversation_id?: string;
  payload?: {
    type?: string;
    message_id?: string;
    text?: string;
    turn_id?: string;
  };
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
