import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";

export const PENDING_USER_ECHO_PREFIX = "pending:";

const PENDING_FLAG = Symbol("pendingUserEcho");

function markPending(message: AgentMessage): AgentMessage {
  Object.defineProperty(message, PENDING_FLAG, { value: true });
  return message;
}

export function isPendingUserEcho(message: AgentMessage | null | undefined): boolean {
  return Boolean(
    message
    && message.role === "user"
    && (
      message.id.startsWith(PENDING_USER_ECHO_PREFIX)
      || PENDING_FLAG in (message as object)
    ),
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
  return markPending({
    id: input.id ?? crypto.randomUUID(),
    role: "user",
    parts,
    created_at: input.createdAt ?? new Date().toISOString(),
  });
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
  if (
    !echoId.startsWith(PENDING_USER_ECHO_PREFIX)
    && !messages.some((item) => item.id === echoId && isPendingUserEcho(item))
  ) {
    return messages;
  }
  return messages.filter((item) => item.id !== echoId);
}

function pendingMatchesIncoming(pending: AgentMessage, incomingId: string): boolean {
  if (pending.id === incomingId) return true;
  if (pending.id === `${PENDING_USER_ECHO_PREFIX}${incomingId}`) return true;
  if (
    pending.id.startsWith(PENDING_USER_ECHO_PREFIX)
    && incomingId === pending.id.slice(PENDING_USER_ECHO_PREFIX.length)
  ) {
    return true;
  }
  return false;
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

  const pendingIndex = messages.findIndex(
    (item) => isPendingUserEcho(item) && pendingMatchesIncoming(item, incoming.id),
  );
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
    const settled = next.some((item) => item.id === echo.id || pendingMatchesIncoming(echo, item.id));
    if (settled) continue;
    next.push(echo);
  }
  return next;
}
