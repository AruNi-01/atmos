// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { CHAT_LIST_PAGE_SIZE, nextChatListCursor } from "./chat-list-page";

function page(count: number, prefix = "chat") {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index + 1}` }));
}

describe("next chat list cursor", () => {
  test("a short page is the last page", () => {
    expect(nextChatListCursor(page(3), CHAT_LIST_PAGE_SIZE, null)).toBeUndefined();
  });

  test("a full page continues after its last id", () => {
    expect(nextChatListCursor(page(CHAT_LIST_PAGE_SIZE), CHAT_LIST_PAGE_SIZE, null)).toBe(
      `chat-${CHAT_LIST_PAGE_SIZE}`,
    );
  });

  test("a cursor that did not advance stops paging", () => {
    const items = page(CHAT_LIST_PAGE_SIZE);
    expect(nextChatListCursor(items, CHAT_LIST_PAGE_SIZE, items[items.length - 1]?.id ?? null)).toBeUndefined();
  });
});
