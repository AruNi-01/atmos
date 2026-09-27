// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { AgentChatEvent } from "@atmos/api-types/ws/dto/agent-chat";
import { agentChatEventFromMessage, eventsForChat } from "./foreign-event";

function event(chatId: string): AgentChatEvent {
  return {
    chat_id: chatId,
    event_id: "e1",
    revision: 1,
    payload: {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    },
  };
}

describe("eventsForChat", () => {
  test("matches only the open chat id", () => {
    expect(eventsForChat(event("chat-a"), "chat-a")).toBe(true);
    expect(eventsForChat(event("chat-b"), "chat-a")).toBe(false);
  });

  test("ignores notifications for a different event", () => {
    expect(agentChatEventFromMessage({
      type: "notification",
      payload: { event: "terminal_title_updated", data: { workspace_id: "ws" } },
    })).toBeNull();
    expect(agentChatEventFromMessage({
      type: "notification",
      payload: { event: "agent_chat_event", data: event("chat-a") },
    })?.chat_id).toBe("chat-a");
  });
});
