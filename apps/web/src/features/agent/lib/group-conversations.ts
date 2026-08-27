export type ConversationListItem = {
  id: string;
  title?: string | null;
  cwd: string;
};

export type ConversationCwdGroup = {
  cwd: string;
  conversations: ConversationListItem[];
};

export function groupConversationsByCwd(
  items: ConversationListItem[],
): ConversationCwdGroup[] {
  const groups = new Map<string, ConversationListItem[]>();
  for (const item of items) {
    const cwd = item.cwd || "";
    const list = groups.get(cwd) ?? [];
    list.push(item);
    groups.set(cwd, list);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cwd, conversations]) => ({ cwd, conversations }));
}
