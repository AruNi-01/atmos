/** Page size for `agent_chat_list`. The server clamps this to at most 200. */
export const CHAT_LIST_PAGE_SIZE = 100;

/**
 * Cursor for the next chat page. The server treats the cursor as the last
 * seen chat id and returns the following slice. A full page whose last id did
 * not move means the cursor was ignored, so paging stops instead of repeating.
 */
export function nextChatListCursor(
  items: ReadonlyArray<{ id: string }>,
  pageSize: number,
  pageParam: string | null,
): string | undefined {
  if (items.length < pageSize) return undefined;
  const lastId = items[items.length - 1]?.id;
  if (!lastId || lastId === pageParam) return undefined;
  return lastId;
}
