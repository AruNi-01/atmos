import { describe, expect, it } from "bun:test";
import {
  currentPlanFromMessages,
  dedupeAgentMessages,
  foldMessagesFromEvent,
  hydrateAgentChatMessages,
  textFromParts,
} from "@/features/agent/lib/agent-chat-events";
import type { AgentChatEvent, AgentEvent, AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";

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

  it("config_updated does not create a message", () => {
    const event = chatEvent("chat-1", 1, {
      type: "config_updated",
      model: "grok-4",
      mode: "agent",
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
    expect(center[0]?.created_at).toBeUndefined();
    expect(foldMessagesFromEvent(center, event, "other")).toEqual(center);
  });

  it("folds user message attachments onto the sent row", () => {
    const event = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "msg-1",
      text: "look at this",
      attachments: ["/tmp/chats/a/attachments/shot.png", "/tmp/notes.pdf"],
    });
    const folded = foldMessagesFromEvent([], event, "chat-1");
    expect(folded[0]?.parts).toEqual([
      { type: "text", text: "look at this" },
      {
        type: "attachment",
        path: "/tmp/chats/a/attachments/shot.png",
        name: "shot.png",
      },
      { type: "attachment", path: "/tmp/notes.pdf", name: "notes.pdf" },
    ]);
  });

  it("keeps the user message created_at from the live event", () => {
    const createdAt = "2026-07-29T13:23:00.000Z";
    const event = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "msg-1",
      text: "hello",
      created_at: createdAt,
    });
    const folded = foldMessagesFromEvent([], event, "chat-1");
    expect(folded[0]?.created_at).toBe(createdAt);
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

  it("defaults tool status from the event type when the payload omits it", () => {
    const started = foldMessagesFromEvent([], chatEvent("chat-1", 1, {
      type: "tool_call_started",
      turn_id: "t1",
      tool_call: { tool_call_id: "tool-1", name: "Read" },
    }), "chat-1");
    expect(started[0]?.parts[0]).toMatchObject({ type: "tool_call", status: "running" });

    const failed = foldMessagesFromEvent(started, chatEvent("chat-1", 2, {
      type: "tool_call_failed",
      turn_id: "t1",
      tool_call: { tool_call_id: "tool-1", name: "Read" },
    }), "chat-1");
    expect(failed[0]?.parts[0]).toMatchObject({ type: "tool_call", status: "failed" });
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

  it("promotes grok todo_write tools into a plan and drops the leftover card", () => {
    const started = chatEvent("chat-1", 1, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "t-todo",
        name: "Tool",
        title: "todo_write",
        status: "running",
        input: { merge: true },
      },
    });
    const updated = chatEvent("chat-1", 2, {
      type: "tool_call_updated",
      tool_call: {
        tool_call_id: "t-todo",
        name: "Tool",
        title: "todo_write",
        status: "running",
        input: {
          merge: true,
          todos: [
            { content: "Inspect", status: "in_progress" },
            { content: "Patch", status: "pending" },
          ],
        },
      },
    });
    let messages = foldMessagesFromEvent([], started, "chat-1");
    expect(messages[0]?.parts.every((part) => part.type !== "tool_call")).toBe(true);
    messages = foldMessagesFromEvent(messages, updated, "chat-1");
    expect(messages[0]?.parts.map((part) => part.type)).toEqual(["plan"]);
    expect(currentPlanFromMessages(messages)).toEqual({
      entries: [
        { content: "Inspect", priority: "medium", status: "in_progress" },
        { content: "Patch", priority: "medium", status: "pending" },
      ],
    });
  });

  it("completes stuck tools when the turn ends but keeps grok background commands running", () => {
    const todo = chatEvent("chat-1", 1, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "t-other",
        name: "Tool",
        title: "SomeVendorTool",
        status: "running",
      },
    });
    const bg = chatEvent("chat-1", 2, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "t-bg",
        name: "Tool",
        title: "[bg] sleep 60",
        status: "running",
        input: { command: "sleep 60" },
      },
    });
    const done = chatEvent("chat-1", 3, {
      type: "turn_completed",
      turn_id: "t1",
    });
    let messages = foldMessagesFromEvent([], todo, "chat-1");
    messages = foldMessagesFromEvent(messages, bg, "chat-1");
    messages = foldMessagesFromEvent(messages, done, "chat-1");
    expect(messages[0]?.streaming).toBe(false);
    const parts = messages[0]?.parts ?? [];
    expect(parts.find((part) => part.type === "tool_call" && part.tool_call_id === "t-other"))
      .toMatchObject({ status: "completed" });
    expect(parts.find((part) => part.type === "tool_call" && part.tool_call_id === "t-bg"))
      .toMatchObject({ status: "running" });
  });

  it("keeps grok background bash live, hides TaskOutput polls, and completes when the task ends", () => {
    const start = chatEvent("chat-1", 1, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "call-bg",
        name: "Execute",
        title: "Execute `count`",
        status: "running",
        input: {
          variant: "Bash",
          command: "count",
          is_background: true,
        },
      },
    });
    const started = chatEvent("chat-1", 2, {
      type: "tool_call_updated",
      tool_call: {
        tool_call_id: "call-bg",
        name: "BackgroundTaskStarted",
        title: "[bg] count (task-1)",
        status: "completed",
        output: {
          type: "BackgroundTaskStarted",
          task_id: "task-1",
          status: "running",
          command: "count",
          output_file: "/tmp/terminal/call-bg.log",
        },
      },
    });
    const stream = chatEvent("chat-1", 3, {
      type: "tool_call_updated",
      tool_call: {
        tool_call_id: "call-bg",
        name: "Tool",
        title: "Tool",
        status: "running",
        output: { type: "Bash", output: "1\n", command: "count" },
      },
    });
    const poll = chatEvent("chat-1", 4, {
      type: "tool_call_completed",
      tool_call: {
        tool_call_id: "call-poll",
        name: "TaskOutput",
        title: "Get task output: task-1",
        status: "completed",
        output: {
          type: "TaskOutput",
          Result: {
            task_id: "task-1",
            command: "count",
            status: "running",
            output: "1\n2\n3\n",
            output_file: "/tmp/terminal/call-bg.log",
          },
        },
      },
    });
    const finished = chatEvent("chat-1", 5, {
      type: "tool_call_completed",
      tool_call: {
        tool_call_id: "call-poll-2",
        name: "TaskOutput",
        title: "count (task-1)",
        status: "completed",
        output: {
          type: "TaskOutput",
          Result: {
            task_id: "task-1",
            command: "count",
            status: "completed",
            exit_code: 0,
            output: "1\n2\n3\nDONE\n",
            output_file: "/tmp/terminal/call-bg.log",
          },
        },
      },
    });
    let messages = foldMessagesFromEvent([], start, "chat-1");
    messages = foldMessagesFromEvent(messages, started, "chat-1");
    messages = foldMessagesFromEvent(messages, stream, "chat-1");
    messages = foldMessagesFromEvent(messages, poll, "chat-1");
    const live = messages[0]?.parts.find((part) => part.type === "tool_call" && part.tool_call_id === "call-bg");
    expect(live).toMatchObject({ type: "tool_call", status: "running", kind: "execute" });
    expect(messages[0]?.parts.some((part) => part.type === "tool_call" && part.tool_call_id === "call-poll")).toBe(false);
    messages = foldMessagesFromEvent(messages, finished, "chat-1");
    const done = messages[0]?.parts.find((part) => part.type === "tool_call" && part.tool_call_id === "call-bg");
    expect(done).toMatchObject({ status: "completed" });
    expect(JSON.stringify(done)).toContain("DONE");
    expect(messages[0]?.parts.some((part) => part.type === "tool_call" && part.name === "TaskOutput")).toBe(false);
  });

  it("folds create and resume session lifecycle onto the current assistant", () => {
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    });
    const running = chatEvent("chat-1", 2, {
      type: "session_lifecycle",
      turn_id: "t1",
      message_id: "session-t1",
      action: "create",
      status: "running",
    });
    const done = chatEvent("chat-1", 3, {
      type: "session_lifecycle",
      turn_id: "t1",
      message_id: "session-t1",
      action: "create",
      status: "completed",
      duration_ms: 1800,
    });
    const thinking = chatEvent("chat-1", 4, {
      type: "thinking_delta",
      message_id: "a1",
      delta: "hmm",
    });
    let messages = foldMessagesFromEvent([], user, "chat-1");
    messages = foldMessagesFromEvent(messages, running, "chat-1");
    expect(messages[1]?.parts[0]).toMatchObject({
      type: "session_lifecycle",
      action: "create",
      status: "running",
    });
    messages = foldMessagesFromEvent(messages, done, "chat-1");
    messages = foldMessagesFromEvent(messages, thinking, "chat-1");
    expect(messages).toHaveLength(2);
    expect(messages[1]?.parts.map((part) => part.type)).toEqual(["session_lifecycle", "thinking"]);
    expect(messages[1]?.parts[0]).toMatchObject({
      type: "session_lifecycle",
      action: "create",
      status: "completed",
      duration_ms: 1800,
    });
  });

  it("folds session config change onto the current assistant after lifecycle", () => {
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    });
    const lifecycle = chatEvent("chat-1", 2, {
      type: "session_lifecycle",
      turn_id: "t1",
      message_id: "session-t1",
      action: "resume",
      status: "completed",
    });
    const change = chatEvent("chat-1", 3, {
      type: "session_config_change",
      turn_id: "t1",
      message_id: "config-t1",
      model: { from: "opus", to: "grok-4" },
      mode: { to: "plan" },
    });
    let messages = foldMessagesFromEvent([], user, "chat-1");
    messages = foldMessagesFromEvent(messages, lifecycle, "chat-1");
    messages = foldMessagesFromEvent(messages, change, "chat-1");
    expect(messages[1]?.parts.map((part) => part.type)).toEqual([
      "session_lifecycle",
      "session_config_change",
    ]);
    expect(messages[1]?.parts[1]).toMatchObject({
      type: "session_config_change",
      model: { from: "opus", to: "grok-4" },
      mode: { to: "plan" },
    });
  });

  it("folds a session hint onto the current assistant after chrome", () => {
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    });
    const lifecycle = chatEvent("chat-1", 2, {
      type: "session_lifecycle",
      turn_id: "t1",
      message_id: "session-t1",
      action: "create",
      status: "completed",
    });
    const hint = chatEvent("chat-1", 3, {
      type: "session_hint",
      turn_id: "t1",
      message_id: "hint-t1-model_switch_failed",
      tone: "warning",
      kind: "model_switch_failed",
    });
    let messages = foldMessagesFromEvent([], user, "chat-1");
    messages = foldMessagesFromEvent(messages, lifecycle, "chat-1");
    messages = foldMessagesFromEvent(messages, hint, "chat-1");
    expect(messages[1]?.parts.map((part) => part.type)).toEqual([
      "session_lifecycle",
      "session_hint",
    ]);
    expect(messages[1]?.parts[1]).toMatchObject({
      type: "session_hint",
      tone: "warning",
      kind: "model_switch_failed",
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
      parts: [{ type: "thinking", text: "hmm", duration_ms: 4000 }],
    });
  });

  it("keeps each thinking block's duration when a later turn total arrives", () => {
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    });
    let messages = foldMessagesFromEvent([], user, "chat-1");
    messages = foldMessagesFromEvent(messages, chatEvent("chat-1", 2, {
      type: "thinking_delta",
      message_id: "a1",
      delta: "first",
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, chatEvent("chat-1", 3, {
      type: "thinking_completed",
      message_id: "a1",
      thinking_ms: 5000,
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, chatEvent("chat-1", 4, {
      type: "tool_call_started",
      tool_call: { tool_call_id: "t1", name: "Read", status: "running" },
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, chatEvent("chat-1", 5, {
      type: "thinking_delta",
      message_id: "a1",
      delta: "second",
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, chatEvent("chat-1", 6, {
      type: "thinking_completed",
      message_id: "a1",
      thinking_ms: 8000,
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, chatEvent("chat-1", 7, {
      type: "turn_completed",
      turn_id: "t1",
      worked_ms: 45000,
      thinking_ms: 13000,
    }), "chat-1");
    expect(messages[1]).toMatchObject({
      id: "a1",
      thinking_ms: 13000,
    });
    expect(messages[1]?.parts.filter((part) => part.type === "thinking")).toEqual([
      { type: "thinking", text: "first", duration_ms: 5000 },
      { type: "thinking", text: "second", duration_ms: 8000 },
    ]);
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

  it("attaches per-turn usage from usage_updated and turn_completed", () => {
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
    const usage = chatEvent("chat-1", 3, {
      type: "usage_updated",
      turn: { total_tokens: 150, input_tokens: 100, output_tokens: 50 },
    });
    const done = chatEvent("chat-1", 4, {
      type: "turn_completed",
      turn_id: "t1",
      usage: { total_tokens: 150, input_tokens: 100, output_tokens: 50 },
    });
    let messages = foldMessagesFromEvent([], user, "chat-1");
    messages = foldMessagesFromEvent(messages, delta, "chat-1");
    messages = foldMessagesFromEvent(messages, usage, "chat-1");
    expect(messages[1]?.usage).toEqual({
      total_tokens: 150,
      input_tokens: 100,
      output_tokens: 50,
    });
    messages = foldMessagesFromEvent(messages, done, "chat-1");
    expect(messages[1]?.streaming).toBe(false);
    expect(messages[1]?.usage).toEqual({
      total_tokens: 150,
      input_tokens: 100,
      output_tokens: 50,
    });
  });

  it("hydrates persisted rows then live deltas without duplicating ids", () => {
    const persisted: AgentMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "Hel" }], streaming: true },
    ];
    const messages = hydrateAgentChatMessages(
      persisted,
      [
        chatEvent("chat-1", 10, {
          type: "assistant_message_delta",
          message_id: "a1",
          delta: "lo",
        }),
      ],
      "chat-1",
      9,
    );
    expect(messages.map((item) => item.id)).toEqual(["u1", "a1"]);
    expect(textFromParts(messages[1]!.parts)).toBe("Hello");
    expect(messages[1]?.streaming).toBe(true);
  });

  it("dedupes a snapshot that already contains the live assistant id", () => {
    const persisted: AgentMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "Hello" }], streaming: true },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "Hello" }], streaming: true },
    ];
    const messages = hydrateAgentChatMessages(persisted, [], "chat-1", 0);
    expect(messages.map((item) => item.id)).toEqual(["u1", "a1"]);
    expect(textFromParts(messages[1]!.parts)).toBe("Hello");
  });

  it("keeps later-turn copies of a reused assistant id unique", () => {
    const persisted: AgentMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "one" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "first" }] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "two" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "second" }] },
    ];
    const messages = dedupeAgentMessages(persisted);
    expect(messages.map((item) => item.id)).toEqual(["u1", "a1", "u2", "a1:3"]);
    expect(textFromParts(messages[1]!.parts)).toBe("first");
    expect(textFromParts(messages[3]!.parts)).toBe("second");
  });
});
