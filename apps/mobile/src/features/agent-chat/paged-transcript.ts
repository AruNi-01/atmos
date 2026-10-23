import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";

function toolPartsById(
  message: AgentMessage | undefined,
): Map<string, Extract<AgentPart, { type: "tool_call" }>> {
  const map = new Map<string, Extract<AgentPart, { type: "tool_call" }>>();
  if (!message) return map;
  for (const part of message.parts) {
    if (part.type === "tool_call") map.set(part.tool_call_id, part);
  }
  return map;
}

export function restoreToolDetailsOnMessage(
  incoming: AgentMessage,
  local?: AgentMessage,
): AgentMessage {
  if (!local) return incoming;
  const localTools = toolPartsById(local);
  return {
    ...incoming,
    parts: incoming.parts.map((part) => {
      if (part.type !== "tool_call") return part;
      const prev = localTools.get(part.tool_call_id);
      if (!prev) return part;
      if (part.detail_omitted && !prev.detail_omitted) {
        return {
          ...part,
          params: prev.params,
          result: prev.result,
          detail_omitted: false,
        };
      }
      return part;
    }),
  };
}

function isAfterWindow(message: AgentMessage, window: AgentMessage[]): boolean {
  const last = window[window.length - 1];
  if (message.created_at && last?.created_at) return message.created_at > last.created_at;
  return false;
}

export function mergePagedMessages(local: AgentMessage[], window: AgentMessage[]): AgentMessage[] {
  if (window.length === 0) return local;
  const windowIds = new Set(window.map((message) => message.id));
  const firstHit = local.findIndex((message) => windowIds.has(message.id));
  let lastHit = -1;
  for (let index = local.length - 1; index >= 0; index -= 1) {
    if (windowIds.has(local[index]!.id)) {
      lastHit = index;
      break;
    }
  }
  const prefix =
    firstHit >= 0
      ? local.slice(0, firstHit).filter((message) => !windowIds.has(message.id))
      : local.filter((message) => !windowIds.has(message.id) && !isAfterWindow(message, window));
  const suffix =
    lastHit >= 0
      ? local.slice(lastHit + 1).filter((message) => !windowIds.has(message.id))
      : local.filter((message) => !windowIds.has(message.id) && isAfterWindow(message, window));
  const localById = new Map(local.map((message) => [message.id, message]));
  const mergedWindow = window.map((incoming) =>
    restoreToolDetailsOnMessage(incoming, localById.get(incoming.id)),
  );
  const seen = new Set<string>();
  const next: AgentMessage[] = [];
  for (const message of [...prefix, ...mergedWindow, ...suffix]) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    next.push(message);
  }
  return next;
}

export function prependOlderMessages(local: AgentMessage[], older: AgentMessage[]): AgentMessage[] {
  const existing = new Set(local.map((message) => message.id));
  const prefix = older.filter((message) => !existing.has(message.id));
  return prefix.length === 0 ? local : [...prefix, ...local];
}

export function patchToolParts(messages: AgentMessage[], parts: AgentPart[]): AgentMessage[] {
  const byId = new Map(
    parts
      .filter(
        (part): part is Extract<AgentPart, { type: "tool_call" }> => part.type === "tool_call",
      )
      .map((part) => [part.tool_call_id, { ...part, detail_omitted: false }]),
  );
  if (byId.size === 0) return messages;
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (part.type !== "tool_call") return part;
      return byId.get(part.tool_call_id) ?? part;
    }),
  }));
}
