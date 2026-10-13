import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";

function fingerprintParts(message: AgentMessage): string {
  return (message.parts ?? [])
    .map((part) => {
      if (part.type === "text") return `t:${part.text.slice(0, 48)}`;
      if (part.type === "thinking") return `h:${(part.text ?? "").slice(0, 24)}`;
      if (part.type === "tool_call") return `c:${part.tool_call_id}`;
      if (part.type === "attachment") return `a:${part.path}`;
      if (part.type === "error") return `e:${part.message.slice(0, 24)}`;
      return part.type;
    })
    .join("|");
}

/** Stable list key. Never use a raw row index — old sessions without ids get a fingerprint. */
export function stableAgentMessageKey(message: AgentMessage | undefined, index: number): string {
  const id = message?.id?.trim();
  if (id) return id;
  if (!message) return `legacy:empty:${index}`;
  const created = message.created_at?.trim() || "";
  const mark = fingerprintParts(message);
  if (created || mark) return `legacy:${message.role}:${created}:${mark}`;
  return `legacy:${message.role}:row:${index}`;
}

export function withStableAgentMessageIds(messages: AgentMessage[]): AgentMessage[] {
  const used = new Set<string>();
  for (const message of messages) {
    const id = message.id?.trim();
    if (id) used.add(id);
  }
  let changed = false;
  const next = messages.map((message, index) => {
    if (message.id?.trim()) return message;
    changed = true;
    let id = stableAgentMessageKey(message, index);
    if (used.has(id)) {
      let n = 2;
      while (used.has(`${id}#${n}`)) n += 1;
      id = `${id}#${n}`;
    }
    used.add(id);
    return { ...message, id };
  });
  return changed ? next : messages;
}
