// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  AgentChatCursorTracker,
  agentChatCursorFromMessage,
  parseRelayCtrl,
} from "./mobile-ws-transport";

describe("mobile ws transport helpers", () => {
  test("parseRelayCtrl reads server_offline without inventing a seq", () => {
    expect(parseRelayCtrl({ type: "relay_ctrl", code: "server_offline" })).toEqual({
      code: "server_offline",
    });
    expect(
      parseRelayCtrl({ type: "notification", payload: { event: "agent_chat_event" } }),
    ).toBeNull();
  });

  test("cursor tracker advances from subscribe and live revisions only for tracked chats", () => {
    const tracker = new AgentChatCursorTracker();
    tracker.noteSubscribe("chat-1", 4);
    tracker.noteRevision("chat-1", 9);
    tracker.noteRevision("chat-2", 80);
    expect(tracker.snapshots()).toEqual([{ chat_id: "chat-1", after_sequence: 9 }]);
    expect(
      agentChatCursorFromMessage({
        type: "notification",
        payload: {
          event: "agent_chat_event",
          data: { chat_id: "chat-1", event_id: "e", revision: 11, payload: { type: "text_delta" } },
        },
      }),
    ).toEqual({ chatId: "chat-1", revision: 11 });
    tracker.noteUnsubscribe("chat-1");
    expect(tracker.snapshots()).toEqual([]);
  });
});
