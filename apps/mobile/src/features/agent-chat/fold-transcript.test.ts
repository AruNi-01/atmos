// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { AgentChatEvent, AgentChatPayload } from "@atmos/api-types/ws/dto/agent-chat";
import { applyChatEvent, createChatTranscript } from "./fold-transcript";

function event(chatId: string, payload: AgentChatPayload, revision = 1): AgentChatEvent {
  return {
    chat_id: chatId,
    event_id: `e${revision}`,
    revision,
    payload,
  };
}

function answer(text: string, offset: number, revision: number): AgentChatEvent {
  return event(
    "chat-1",
    {
      type: "text_chunk",
      part_id: "p1",
      message_id: "a1",
      ordinal: 0,
      kind: "answer",
      offset,
      text,
    },
    revision,
  );
}

function messageText(state: ReturnType<typeof createChatTranscript>, messageId: string): string {
  const message = state.messages.find((item) => item.id === messageId);
  return (message?.parts ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

describe("applyChatEvent", () => {
  test("two text_chunk events concatenate", () => {
    const first = applyChatEvent(createChatTranscript("chat-1"), answer("hello", 0, 1));
    const second = applyChatEvent(first.state, answer(" world", 5, 2));
    expect(messageText(second.state, "a1")).toBe("hello world");
    expect(second.state.messages).toEqual([
      expect.objectContaining({
        id: "a1",
        role: "assistant",
        streaming: true,
      }),
    ]);
    expect(second.backfill).toBeNull();
  });

  test("user_message then text keeps both messages", () => {
    const user = applyChatEvent(
      createChatTranscript("chat-1"),
      event(
        "chat-1",
        {
          type: "user_message",
          turn_id: "t1",
          message_id: "u1",
          text: "hi",
        },
        1,
      ),
    );
    const reply = applyChatEvent(user.state, answer("yo", 0, 2));
    expect(
      reply.state.messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(""),
      })),
    ).toEqual([
      { id: "u1", role: "user", text: "hi" },
      { id: "a1", role: "assistant", text: "yo" },
    ]);
  });

  test("a foreign chat id does not change the open transcript", () => {
    const state = createChatTranscript("chat-1");
    const next = applyChatEvent(
      state,
      event("chat-2", {
        type: "user_message",
        turn_id: "t1",
        message_id: "u9",
        text: "other chat",
      }),
    );
    expect(next.state).toBe(state);
    expect(next.state.messages).toEqual([]);
    expect(next.backfill).toBeNull();
  });

  test("a text gap returns the backfill request from applyTextChunk", () => {
    const first = applyChatEvent(createChatTranscript("chat-1"), answer("hi", 0, 1));
    const gap = applyChatEvent(first.state, answer("z", 10, 2));
    expect(messageText(gap.state, "a1")).toBe("hi");
    expect(gap.backfill).toEqual({ partId: "p1", fromOffset: 2 });
  });

  test("turn_snapshot replaces the current turn without dropping history", () => {
    const priorUser = applyChatEvent(
      createChatTranscript("chat-1"),
      event(
        "chat-1",
        {
          type: "user_message",
          turn_id: "t0",
          message_id: "u0",
          text: "old",
        },
        1,
      ),
    );
    const priorReply = applyChatEvent(priorUser.state, answer("prior", 0, 2));
    const user = applyChatEvent(
      priorReply.state,
      event(
        "chat-1",
        {
          type: "user_message",
          turn_id: "t1",
          message_id: "u1",
          text: "hi",
        },
        3,
      ),
    );
    const live = applyChatEvent(
      user.state,
      event(
        "chat-1",
        {
          type: "text_chunk",
          part_id: "p2",
          message_id: "assistant:u1",
          ordinal: 0,
          kind: "answer",
          offset: 0,
          text: "Hel",
        },
        4,
      ),
    );
    const snap = applyChatEvent(
      live.state,
      event(
        "chat-1",
        {
          type: "turn_snapshot",
          turn_id: "t1",
          messages: [
            {
              id: "a2",
              role: "assistant",
              parts: [{ type: "text", text: "Hello", message_id: "p2" }],
              streaming: true,
            },
          ],
          open_part_ids: ["p2"],
        },
        5,
      ),
    );
    expect(snap.state.messages.map((message) => message.id)).toEqual(["u0", "a1", "u1", "a2"]);
    expect(messageText(snap.state, "a1")).toBe("prior");
    expect(messageText(snap.state, "a2")).toBe("Hello");
    expect(snap.state.messages[3]?.streaming).toBe(true);
  });

  test("turn_snapshot adopts a tool-first provisional row instead of duplicating it", () => {
    const user = applyChatEvent(
      createChatTranscript("chat-1"),
      event(
        "chat-1",
        {
          type: "user_message",
          turn_id: "t1",
          message_id: "u1",
          text: "search",
        },
        1,
      ),
    );
    const started = applyChatEvent(
      user.state,
      event(
        "chat-1",
        {
          type: "tool_call_started",
          tool_call: {
            tool_call_id: "search-1",
            name: "Search",
            kind: "search",
            status: "running",
            params: { type: "search", query: "search" },
          },
        },
        2,
      ),
    );
    const snap = applyChatEvent(
      started.state,
      event(
        "chat-1",
        {
          type: "turn_snapshot",
          turn_id: "t1",
          messages: [
            {
              id: "tool-search-1",
              role: "assistant",
              parts: [
                {
                  type: "tool_call",
                  tool_call_id: "search-1",
                  name: "Search",
                  kind: "search",
                  status: "running",
                  params: { type: "search", query: "search" },
                },
              ],
              streaming: true,
            },
          ],
          open_part_ids: [],
        },
        3,
      ),
    );
    expect(snap.state.messages.map((message) => message.id)).toEqual(["u1", "tool-search-1"]);
    expect(
      snap.state.messages.filter((message) =>
        message.parts.some((part) => part.type === "tool_call" && part.tool_call_id === "search-1"),
      ),
    ).toHaveLength(1);
  });

  test("available_commands_updated stores slash commands and does not add a message", () => {
    const next = applyChatEvent(
      createChatTranscript("chat-1"),
      event("chat-1", {
        type: "available_commands_updated",
        commands: [{ name: "/fork", description: "Fork this chat" }],
      }),
    );
    expect(next.state.messages).toEqual([]);
    expect(next.state.commands).toEqual([
      { name: "fork", description: "Fork this chat", hint: null },
    ]);
  });
});
