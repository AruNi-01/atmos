// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  freshChatTitleLookup,
  missingChatTitleKey,
  planChatTitleLookup,
  settleChatTitleLookup,
} from "./chat-title-lookup";

describe("chat title lookup", () => {
  test("asks once for chats the loaded list does not contain", () => {
    const titles = { known: "Known" };
    const missing = missingChatTitleKey(["known", "old"], titles, true, new Set());
    const plan = planChatTitleLookup(freshChatTitleLookup(), missing, ["known", "old"]);
    expect(plan.requested).toEqual(["old"]);

    const settled = settleChatTitleLookup(plan.state, plan.requested ?? [], titles, ["known", "old"]);
    expect(settled.stalled).toBe(true);
    expect(settled.gaveUp.has("old")).toBe(true);

    const again = missingChatTitleKey(["known", "old"], titles, true, settled.gaveUp);
    expect(planChatTitleLookup(settled, again, ["known", "old"]).requested).toBeNull();
  });

  test("a chat that appears after a missed lookup still loads", () => {
    const titles = { known: "Known" };
    const missed = settleChatTitleLookup(
      freshChatTitleLookup(),
      ["old"],
      titles,
      ["known", "old"],
    );
    const withNew = missingChatTitleKey(
      ["known", "old", "new"],
      titles,
      true,
      missed.gaveUp,
    );
    const plan = planChatTitleLookup(missed, withNew, ["known", "old", "new"]);
    expect(plan.requested).toEqual(["new"]);

    const found = settleChatTitleLookup(
      plan.state,
      plan.requested ?? [],
      { ...titles, new: "New chat" },
      ["known", "old", "new"],
    );
    expect(found.stalled).toBe(false);
    expect(found.gaveUp.has("new")).toBe(false);
  });

  test("a partial list keeps the chats it found and gives up the rest", () => {
    const state = freshChatTitleLookup();
    const missing = missingChatTitleKey(["old", "new"], {}, true, state.gaveUp);
    const plan = planChatTitleLookup(state, missing, ["old", "new"]);
    const settled = settleChatTitleLookup(
      plan.state,
      plan.requested ?? [],
      { new: "New chat" },
      ["old", "new"],
    );
    expect(settled.stalled).toBe(false);
    expect([...settled.gaveUp]).toEqual(["old"]);
  });
});
