import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";

export const PENDING_USER_ECHO_PREFIX = "pending:";

function echoText(message: AgentMessage): string {
  return message.parts
    .filter((part): part is Extract<AgentPart, { type: "text" }> =>
      part.type === "text" && !part.parent_tool_call_id)
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function isPendingUserEcho(message: AgentMessage | null | undefined): boolean {
  return Boolean(
    message
    && message.role === "user"
    && message.id.startsWith(PENDING_USER_ECHO_PREFIX),
  );
}

export function createPendingUserMessage(input: {
  id?: string;
  text: string;
  attachments?: Array<{ path: string; name?: string | null }>;
  createdAt?: string;
}): AgentMessage {
  const parts: AgentPart[] = [];
  const text = input.text.trim();
  if (text) parts.push({ type: "text", text });
  for (const attachment of input.attachments ?? []) {
    parts.push({
      type: "attachment",
      path: attachment.path,
      name: attachment.name ?? attachment.path.split(/[\\/]/).at(-1) ?? attachment.path,
    });
  }
  return {
    id: input.id ?? `${PENDING_USER_ECHO_PREFIX}${crypto.randomUUID()}`,
    role: "user",
    parts,
    created_at: input.createdAt ?? new Date().toISOString(),
  };
}

export function insertPendingUserMessage(
  messages: AgentMessage[],
  echo: AgentMessage,
): AgentMessage[] {
  if (messages.some((item) => item.id === echo.id)) return messages;
  return [...messages, echo];
}

export function removePendingUserMessage(
  messages: AgentMessage[],
  echoId: string,
): AgentMessage[] {
  if (!echoId.startsWith(PENDING_USER_ECHO_PREFIX)) return messages;
  return messages.filter((item) => item.id !== echoId);
}

/**
 * Replace the matching pending echo with the persisted user row so the bubble
 * keeps its place in the list. Falls back to append/replace-by-id.
 */
export function settlePendingUserMessage(
  messages: AgentMessage[],
  incoming: AgentMessage,
): AgentMessage[] {
  const existingIndex = messages.findIndex((item) => item.id === incoming.id);
  if (existingIndex >= 0) {
    return messages.map((item, index) =>
      index === existingIndex
        ? { ...incoming, created_at: incoming.created_at ?? item.created_at }
        : item,
    );
  }

  const incomingText = echoText(incoming);
  let pendingIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    if (!item || !isPendingUserEcho(item)) continue;
    if (incomingText && echoText(item) !== incomingText) continue;
    pendingIndex = index;
    break;
  }
  if (pendingIndex < 0) return [...messages, incoming];

  const next = messages.slice();
  const previous = next[pendingIndex]!;
  next[pendingIndex] = {
    ...incoming,
    created_at: incoming.created_at ?? previous.created_at,
  };
  return next;
}

/** Keep in-flight echoes across a snapshot load that has not persisted them yet. */
export function keepPendingUserEchoes(
  loaded: AgentMessage[],
  current: AgentMessage[],
): AgentMessage[] {
  const pending = current.filter(isPendingUserEcho);
  if (pending.length === 0) return loaded;
  const next = loaded.slice();
  for (const echo of pending) {
    const text = echoText(echo);
    const settled = next.some(
      (item) => item.role === "user" && echoText(item) === text,
    );
    if (settled || next.some((item) => item.id === echo.id)) continue;
    next.push(echo);
  }
  return next;
}
