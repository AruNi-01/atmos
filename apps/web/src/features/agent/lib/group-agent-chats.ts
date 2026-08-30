export type AgentChatListItem = {
  id: string;
  title?: string | null;
  cwd: string;
};

export type AgentChatCwdGroup = {
  cwd: string;
  chats: AgentChatListItem[];
};

export function groupChatsByCwd(
  items: AgentChatListItem[],
): AgentChatCwdGroup[] {
  const groups = new Map<string, AgentChatListItem[]>();
  for (const item of items) {
    const cwd = item.cwd || "";
    const list = groups.get(cwd) ?? [];
    list.push(item);
    groups.set(cwd, list);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cwd, chats]) => ({ cwd, chats }));
}
