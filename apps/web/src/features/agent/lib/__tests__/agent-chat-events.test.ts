import { describe, expect, it } from "bun:test";
import {
  currentPlanFromMessages,
  foldMessagesFromEvent,
  textFromParts,
} from "@/features/agent/lib/agent-chat-events";
import type { AgentChatEvent, AgentEvent } from "@atmos/api-types/ws/dto/agent-chat";

function chatEvent(
  chatId: string,
  sequence: number,
  payload: AgentEvent,
): AgentChatEvent {
  return { chat_id: chatId, event_id: `evt-${sequence}`, sequence, payload };
}

describe("agent chat fold stays on AgentMessage", () => {
  it("available_commands_updated does not create a message", () => {
    const event = chatEvent("chat-1", 1, {
      type: "available_commands_updated",
      commands: [{ name: "plan", description: "Create a plan" }],
    });
    expect(foldMessagesFromEvent([], event, "chat-1")).toEqual([]);
  });

  it("two subscribers fold the same send into the same message id", () => {
    const event = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "msg-1",
      text: "hello-s16",
    });
    const center = foldMessagesFromEvent([], event, "chat-1");
    const standalone = foldMessagesFromEvent([], event, "chat-1");
    expect(center).toEqual(standalone);
    expect(center[0]).toMatchObject({ id: "msg-1", role: "user" });
    expect(textFromParts(center[0]!.parts)).toBe("hello-s16");
    expect(foldMessagesFromEvent(center, event, "other")).toEqual(center);
  });

  it("folds assistant deltas into a new message after the user row", () => {
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    });
    const delta = chatEvent("chat-1", 2, {
      type: "assistant_message_delta",
      turn_id: "t1",
      message_id: "a1",
      delta: "hel",
    });
    const more = chatEvent("chat-1", 3, {
      type: "assistant_message_delta",
      turn_id: "t1",
      message_id: "a1",
      delta: "lo",
    });
    const messages = foldMessagesFromEvent(
      foldMessagesFromEvent([], user, "chat-1"),
      delta,
      "chat-1",
    );
    const next = foldMessagesFromEvent(messages, more, "chat-1");
    expect(next).toHaveLength(2);
    expect(next[0]?.id).toBe("u1");
    expect(next[1]?.id).toBe("a1");
    expect(next[1]?.streaming).toBe(true);
    expect(textFromParts(next[1]!.parts)).toBe("hello");
  });

  it("does not attach a later turn's thinking to a previous assistant", () => {
    const firstUser = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "explain atmos",
    });
    const firstDelta = chatEvent("chat-1", 2, {
      type: "assistant_message_delta",
      message_id: "a1",
      delta: "first answer",
    });
    const done = chatEvent("chat-1", 3, { type: "turn_completed", turn_id: "t1" });
    const secondUser = chatEvent("chat-1", 4, {
      type: "user_message",
      turn_id: "t2",
      message_id: "u2",
      text: "draw a mermaid",
    });
    const reusedThinking = chatEvent("chat-1", 5, {
      type: "thinking_delta",
      message_id: "a1",
      delta: "the user wants a mermaid diagram",
    });
    let messages = foldMessagesFromEvent([], firstUser, "chat-1");
    messages = foldMessagesFromEvent(messages, firstDelta, "chat-1");
    messages = foldMessagesFromEvent(messages, done, "chat-1");
    messages = foldMessagesFromEvent(messages, secondUser, "chat-1");
    messages = foldMessagesFromEvent(messages, reusedThinking, "chat-1");
    expect(messages).toHaveLength(4);
    expect(messages.map((item) => item.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(textFromParts(messages[1]!.parts)).toBe("first answer");
    expect(messages[1]?.parts.some((part) => part.type === "thinking")).toBe(false);
    expect(messages[3]?.parts[0]).toMatchObject({
      type: "thinking",
      text: "the user wants a mermaid diagram",
    });
  });

  it("does not merge a later turn into a previous completed assistant", () => {
    const firstUser = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "one",
    });
    const firstDelta = chatEvent("chat-1", 2, {
      type: "assistant_message_delta",
      message_id: "a1",
      delta: "first",
    });
    const done = chatEvent("chat-1", 3, { type: "turn_completed", turn_id: "t1" });
    const secondUser = chatEvent("chat-1", 4, {
      type: "user_message",
      turn_id: "t2",
      message_id: "u2",
      text: "two",
    });
    const secondDelta = chatEvent("chat-1", 5, {
      type: "assistant_message_delta",
      message_id: "a2",
      delta: "second",
    });
    let messages = foldMessagesFromEvent([], firstUser, "chat-1");
    messages = foldMessagesFromEvent(messages, firstDelta, "chat-1");
    messages = foldMessagesFromEvent(messages, done, "chat-1");
    messages = foldMessagesFromEvent(messages, secondUser, "chat-1");
    messages = foldMessagesFromEvent(messages, secondDelta, "chat-1");
    expect(messages.map((item) => item.id)).toEqual(["u1", "a1", "u2", "a2"]);
    expect(textFromParts(messages[1]!.parts)).toBe("first");
    expect(textFromParts(messages[3]!.parts)).toBe("second");
  });

  it("folds tool calls into the live assistant message", () => {
    const tool = chatEvent("chat-1", 1, {
      type: "tool_call_started",
      turn_id: "t1",
      tool_call: { tool_call_id: "tool-1", name: "Read", title: "Read file", status: "running" },
    });
    const messages = foldMessagesFromEvent([], tool, "chat-1");
    expect(messages[0]?.parts[0]).toMatchObject({
      type: "tool_call",
      tool_call_id: "tool-1",
      name: "Read",
      kind: "read",
    });
  });

  it("keeps tool input and title when a completed event sends generic placeholders", () => {
    const begin = chatEvent("chat-1", 1, {
      type: "tool_call_started",
      turn_id: "t1",
      tool_call: {
        tool_call_id: "tool-1",
        name: "Read",
        title: "Read `/tmp/app/README.md`",
        status: "running",
        input: { variant: "ReadFile", target_file: "/tmp/app/README.md", limit: 150 },
      },
    });
    const done = chatEvent("chat-1", 2, {
      type: "tool_call_completed",
      turn_id: "t1",
      tool_call: {
        tool_call_id: "tool-1",
        name: "Tool",
        title: "Tool",
        status: "completed",
        input: null,
        output: {
          type: "ReadFile",
          FileContent: { absolute_path: "/tmp/app/README.md", raw_output: "# hi\n" },
        },
      },
    });
    const messages = foldMessagesFromEvent(
      foldMessagesFromEvent([], begin, "chat-1"),
      done,
      "chat-1",
    );
    expect(messages[0]?.parts[0]).toMatchObject({
      type: "tool_call",
      name: "Read",
      kind: "read",
      title: "Read `/tmp/app/README.md`",
      status: "completed",
      input: { variant: "ReadFile", target_file: "/tmp/app/README.md", limit: 150 },
    });
    expect((messages[0]?.parts[0] as { output?: { type?: string } }).output?.type).toBe("ReadFile");
  });

  it("reads the latest plan part from assistant messages", () => {
    const messages = foldMessagesFromEvent([], chatEvent("chat-1", 1, {
      type: "plan_updated",
      plan: { entries: [{ content: "Inspect", priority: "high", status: "completed" }] },
    }), "chat-1");
    expect(currentPlanFromMessages(messages)).toEqual({
      entries: [{ content: "Inspect", priority: "high", status: "completed" }],
    });
  });

  it("classifies think tools into thinking parts and todo tools into plan parts", () => {
    const think = chatEvent("chat-1", 1, {
      type: "tool_call_started",
      tool_call: { tool_call_id: "t-think", name: "think", title: "hmm", status: "running" },
    });
    const todo = chatEvent("chat-1", 2, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "t-todo",
        name: "TodoWrite",
        status: "completed",
        input: { todos: [{ content: "Inspect", status: "pending" }] },
      },
    });
    const hidden = chatEvent("chat-1", 3, {
      type: "tool_call_started",
      tool_call: { tool_call_id: "t-mode", name: "SwitchMode", title: "switch", status: "completed" },
    });
    let messages = foldMessagesFromEvent([], think, "chat-1");
    messages = foldMessagesFromEvent(messages, todo, "chat-1");
    messages = foldMessagesFromEvent(messages, hidden, "chat-1");
    expect(messages[0]?.parts.map((part) => part.type)).toEqual(["thinking", "plan"]);
    expect(messages[0]?.parts[0]).toMatchObject({ type: "thinking", text: "hmm", tool_call_id: "t-think" });
    expect(currentPlanFromMessages(messages)).toEqual({
      entries: [{ content: "Inspect", priority: "medium", status: "pending" }],
    });
  });

  it("stamps thinking duration when thinking completes", () => {
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    });
    const thinking = chatEvent("chat-1", 2, {
      type: "thinking_delta",
      message_id: "a1",
      delta: "hmm",
    });
    const done = chatEvent("chat-1", 3, {
      type: "thinking_completed",
      message_id: "a1",
      thinking_ms: 4000,
    });
    const messages = foldMessagesFromEvent(
      foldMessagesFromEvent(foldMessagesFromEvent([], user, "chat-1"), thinking, "chat-1"),
      done,
      "chat-1",
    );
    expect(messages[1]).toMatchObject({
      id: "a1",
      thinking_ms: 4000,
      parts: [{ type: "thinking", text: "hmm" }],
    });
  });

  it("stamps worked duration onto the last assistant when the turn completes", () => {
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    });
    const delta = chatEvent("chat-1", 2, {
      type: "assistant_message_delta",
      message_id: "a1",
      delta: "hello",
    });
    const done = chatEvent("chat-1", 3, {
      type: "turn_completed",
      turn_id: "t1",
      worked_ms: 14000,
      thinking_ms: 4000,
      completed_at: "2026-08-28T12:00:14.000Z",
    });
    const messages = foldMessagesFromEvent(
      foldMessagesFromEvent(foldMessagesFromEvent([], user, "chat-1"), delta, "chat-1"),
      done,
      "chat-1",
    );
    expect(messages[1]).toMatchObject({
      id: "a1",
      streaming: false,
      worked_ms: 14000,
      thinking_ms: 4000,
      completed_at: "2026-08-28T12:00:14.000Z",
    });
  });
});
