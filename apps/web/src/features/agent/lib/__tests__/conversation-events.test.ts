import { describe, expect, it } from "bun:test";
import { foldUserRowsFromEvent } from "@/features/agent/lib/conversation-events";

describe("S16 standalone and center-stage share conversation events", () => {
  it("two subscribers fold the same send into the same message id", () => {
    const event = {
      conversation_id: "conv-1",
      payload: { type: "user_message", message_id: "msg-1", text: "hello-s16" },
    };
    const center = foldUserRowsFromEvent([], event, "conv-1");
    const standalone = foldUserRowsFromEvent([], event, "conv-1");
    expect(center).toEqual(standalone);
    expect(center).toEqual([{ id: "msg-1", text: "hello-s16" }]);
    expect(foldUserRowsFromEvent(center, event, "other")).toEqual(center);
  });
});
