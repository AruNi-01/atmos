import { describe, expect, it } from "bun:test";
import { byteLength } from "@atmos/api-client/agent-chat";
import {
  currentPlanFromMessages,
  currentTurnHasRunningSubagent,
  foldAgentChatEventResult,
  foldMessagesFromEvent,
  hydrateAgentChatMessages,
  takeBackfillRequest,
  textFromParts,
} from "@/features/agent/lib/agent-chat-events";
import type { AgentChatEvent, AgentEvent, AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";

function chatEvent(
  chatId: string,
  revision: number,
  payload: AgentEvent,
): AgentChatEvent {
  return { chat_id: chatId, event_id: `evt-${revision}`, revision, payload };
}

function textChunk(
  revision: number,
  input: {
    part_id: string;
    message_id: string;
    text: string;
    offset?: number;
    ordinal?: number;
    kind?: "answer" | "thinking";
    parent_part_id?: string | null;
  },
): AgentChatEvent {
  return chatEvent("chat-1", revision, {
    type: "text_chunk",
    part_id: input.part_id,
    message_id: input.message_id,
    parent_part_id: input.parent_part_id ?? null,
    ordinal: input.ordinal ?? 0,
    kind: input.kind ?? "answer",
    offset: input.offset ?? 0,
    text: input.text,
  });
}

function partClosed(
  revision: number,
  partId: string,
  durationMs?: number,
): AgentChatEvent {
  return chatEvent("chat-1", revision, {
    type: "part_closed",
    part_id: partId,
    duration_ms: durationMs,
  });
}

describe("agent chat fold stays on AgentMessage", () => {
  it("available_commands_updated does not create a message", () => {
    const event = chatEvent("chat-1", 1, {
      type: "available_commands_updated",
      commands: [{ name: "plan", description: "Create a plan" }],
    });
    expect(foldMessagesFromEvent([], event, "chat-1")).toEqual([]);
  });

  it("ignores grok x.ai unknown notifications and surfaces turn_completed errors", () => {
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    });
    const chunk = textChunk(2, {
      part_id: "a1",
      message_id: "a1",
      text: "partial",
    });
    const noise = chatEvent("chat-1", 3, {
      type: "unknown",
      event_type: "x.ai/announcements/update",
      payload: {},
    });
    const failed = chatEvent("chat-1", 4, {
      type: "turn_completed",
      turn_id: "t1",
      status: "failed",
      error: "401 Unauthorized",
    });
    let messages = foldMessagesFromEvent([], user, "chat-1");
    messages = foldMessagesFromEvent(messages, chunk, "chat-1");
    messages = foldMessagesFromEvent(messages, noise, "chat-1");
    expect(messages).toHaveLength(2);
    expect(textFromParts(messages[1]!.parts)).toBe("partial");
    messages = foldMessagesFromEvent(messages, failed, "chat-1");
    expect(messages[1]?.parts).toMatchObject([
      { type: "text", text: "partial", message_id: "a1" },
      { type: "error", message: "401 Unauthorized" },
    ]);
  });

  it("failed turn_completed creates an assistant error when the turn has no assistant yet", () => {
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    });
    const failed = chatEvent("chat-1", 2, {
      type: "turn_completed",
      turn_id: "t1",
      status: "failed",
      error: "GLM Coding Plan expired",
    });
    let messages = foldMessagesFromEvent([], user, "chat-1");
    messages = foldMessagesFromEvent(messages, failed, "chat-1");
    expect(messages).toHaveLength(2);
    expect(messages[1]?.role).toBe("assistant");
    expect(messages[1]?.streaming).toBe(false);
    expect(messages[1]?.parts).toEqual([
      { type: "error", message: "GLM Coding Plan expired" },
    ]);
  });

  it("session-op and rewind events do not create or delete messages", () => {
    const existing: AgentMessage[] = [
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "keep me" }],
      },
    ];
    expect(foldMessagesFromEvent([], chatEvent("chat-1", 1, {
      type: "session_op_requested",
      request: {
        request_id: "op-1",
        kind: "rewind",
        title: "Rewind to this turn",
        options: [{ option_id: "keep", name: "Keep conversation" }],
      },
    }), "chat-1")).toEqual([]);
    expect(foldMessagesFromEvent(existing, chatEvent("chat-1", 2, {
      type: "session_op_resolved",
      request_id: "op-1",
      option_id: "keep",
      outcome: "applied",
    }), "chat-1")).toEqual(existing);
    expect(foldMessagesFromEvent(existing, chatEvent("chat-1", 3, {
      type: "session_forked",
      parent_chat_id: "chat-1",
      chat_id: "chat-2",
    }), "chat-1")).toEqual(existing);
    expect(foldMessagesFromEvent(existing, chatEvent("chat-1", 4, {
      type: "rewind_view_updated",
      until_turn_id: "t1",
    }), "chat-1")).toEqual(existing);
  });

  it("permission chrome stays off the transcript fold", () => {
    const existing: AgentMessage[] = [
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "run ls" }],
      },
    ];
    expect(foldMessagesFromEvent(existing, chatEvent("chat-1", 2, {
      type: "permission_requested",
      request: {
        request_id: "perm-1",
        tool: "Bash",
        description: "ls -la",
        options: [
          { option_id: "allow_once", name: "Allow once", kind: "allow_once" },
          { option_id: "allow_always", name: "Allow always", kind: "allow_always" },
          { option_id: "reject_once", name: "Reject once", kind: "reject_once" },
          { option_id: "reject_always", name: "Reject always", kind: "reject_always" },
        ],
      },
    }), "chat-1")).toEqual(existing);
    expect(foldMessagesFromEvent(existing, chatEvent("chat-1", 3, {
      type: "permission_resolved",
      request_id: "perm-1",
      option_id: "allow_once",
    }), "chat-1")).toEqual(existing);
  });

  it("config_updated does not create a message", () => {
    const event = chatEvent("chat-1", 1, {
      type: "config_updated",
      descriptor: {
        identity: { id: "grok", name: "Grok" },
        capabilities: {
          steer: "unsupported",
          resume: "unsupported",
          permission: "unsupported",
          configure: "supported",
          fork: "unsupported",
          rewind: "unsupported",
        },
        support: {
          models: "supported",
          thinking: "unsupported",
          modes: "unsupported",
          permission_modes: "unsupported",
        },
        supported_options: {
          models: [{ id: "grok-4", label: "Grok 4" }],
          thinking: { type: "none" },
          modes: [],
        },
        current_config: { model: "grok-4", mode: "agent" },
      },
    });
    expect(foldMessagesFromEvent([], event, "chat-1")).toEqual([]);
  });

  it("replaces a pending user echo with the persisted user_message id", () => {
    const pending = {
      id: "pending:msg-1",
      role: "user" as const,
      parts: [{ type: "text" as const, text: "hello-s16" }],
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const event = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "msg-1",
      text: "hello-s16",
    });
    const folded = foldMessagesFromEvent([pending], event, "chat-1");
    expect(folded).toHaveLength(1);
    expect(folded[0]).toMatchObject({
      id: "msg-1",
      role: "user",
      created_at: "2026-01-01T00:00:00.000Z",
    });
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

  it("folds text chunks into a new message after the user row", () => {
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    });
    const first = textChunk(2, {
      part_id: "a1",
      message_id: "a1",
      text: "hel",
    });
    const more = textChunk(3, {
      part_id: "a1",
      message_id: "a1",
      offset: byteLength("hel"),
      text: "lo",
    });
    const messages = foldMessagesFromEvent(
      foldMessagesFromEvent([], user, "chat-1"),
      first,
      "chat-1",
    );
    const next = foldMessagesFromEvent(messages, more, "chat-1");
    expect(next).toHaveLength(2);
    expect(next[0]?.id).toBe("u1");
    expect(next[1]?.id).toBe("a1");
    expect(next[1]?.streaming).toBe(true);
    expect(textFromParts(next[1]!.parts)).toBe("hello");
  });

  it("applies identical consecutive chunks by offset instead of dropping them", () => {
    const first = textChunk(1, {
      part_id: "p1",
      message_id: "a1",
      text: "hello",
    });
    const second = textChunk(2, {
      part_id: "p1",
      message_id: "a1",
      offset: byteLength("hello"),
      text: "hello",
    });
    const messages = foldMessagesFromEvent(
      foldMessagesFromEvent([], first, "chat-1"),
      second,
      "chat-1",
    );
    expect(textFromParts(messages[0]!.parts)).toBe("hellohello");
  });

  it("does not merge nested subagent text into the parent reply", () => {
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    });
    const parentDelta = textChunk(2, {
      part_id: "parent-1",
      message_id: "a1",
      text: "parent ",
      ordinal: 0,
    });
    const nested = textChunk(3, {
      part_id: "nested-1",
      message_id: "a1",
      text: "nested",
      ordinal: 1,
      parent_part_id: "sub-1",
    });
    const moreParent = textChunk(4, {
      part_id: "parent-2",
      message_id: "a1",
      text: "reply",
      ordinal: 2,
    });
    let messages = foldMessagesFromEvent([], user, "chat-1");
    messages = foldMessagesFromEvent(messages, parentDelta, "chat-1");
    messages = foldMessagesFromEvent(messages, nested, "chat-1");
    messages = foldMessagesFromEvent(messages, moreParent, "chat-1");
    expect(messages[1]?.parts).toMatchObject([
      { type: "text", text: "parent ", message_id: "parent-1" },
      { type: "text", text: "nested", parent_tool_call_id: "sub-1", message_id: "nested-1" },
      { type: "text", text: "reply", message_id: "parent-2" },
    ]);
    expect(textFromParts(messages[1]!.parts)).toBe("parent \nreply");
  });

  it("does not attach a later turn's thinking to a previous assistant", () => {
    const firstUser = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "explain atmos",
    });
    const firstDelta = textChunk(2, {
      part_id: "a1",
      message_id: "a1",
      text: "first answer",
    });
    const done = chatEvent("chat-1", 3, { type: "turn_completed", turn_id: "t1" });
    const secondUser = chatEvent("chat-1", 4, {
      type: "user_message",
      turn_id: "t2",
      message_id: "u2",
      text: "draw a mermaid",
    });
    const laterThinking = textChunk(5, {
      part_id: "think-2",
      message_id: "a2",
      kind: "thinking",
      text: "the user wants a mermaid diagram",
    });
    let messages = foldMessagesFromEvent([], firstUser, "chat-1");
    messages = foldMessagesFromEvent(messages, firstDelta, "chat-1");
    messages = foldMessagesFromEvent(messages, done, "chat-1");
    messages = foldMessagesFromEvent(messages, secondUser, "chat-1");
    messages = foldMessagesFromEvent(messages, laterThinking, "chat-1");
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
    const firstDelta = textChunk(2, {
      part_id: "a1",
      message_id: "a1",
      text: "first",
    });
    const done = chatEvent("chat-1", 3, { type: "turn_completed", turn_id: "t1" });
    const secondUser = chatEvent("chat-1", 4, {
      type: "user_message",
      turn_id: "t2",
      message_id: "u2",
      text: "two",
    });
    const secondDelta = textChunk(5, {
      part_id: "a2",
      message_id: "a2",
      text: "second",
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

  it("does not copy a previous turn session lifecycle onto the next assistant", () => {
    const firstUser = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hello",
    });
    const lifecycle = chatEvent("chat-1", 2, {
      type: "session_lifecycle",
      turn_id: "t1",
      message_id: "session-t1",
      action: "create",
      status: "completed",
      duration_ms: 10_000,
    });
    const firstDelta = textChunk(3, {
      part_id: "a1:0",
      message_id: "a1",
      text: "Hello! How can I help?",
    });
    const done = chatEvent("chat-1", 4, { type: "turn_completed", turn_id: "t1" });
    const secondUser = chatEvent("chat-1", 5, {
      type: "user_message",
      turn_id: "t2",
      message_id: "u2",
      text: "介绍一下这个项目",
    });
    const replayedLifecycle = chatEvent("chat-1", 6, {
      type: "session_lifecycle",
      turn_id: "t1",
      message_id: "session-t1",
      action: "create",
      status: "completed",
      duration_ms: 10_000,
    });
    const replayedText = textChunk(7, {
      part_id: "a1:0",
      message_id: "a1",
      text: "Hello! How can I help?",
    });
    const secondDelta = textChunk(8, {
      part_id: "a2:0",
      message_id: "a2",
      text: "这是 Atmos",
    });
    let messages = foldMessagesFromEvent([], firstUser, "chat-1");
    messages = foldMessagesFromEvent(messages, lifecycle, "chat-1");
    messages = foldMessagesFromEvent(messages, firstDelta, "chat-1");
    messages = foldMessagesFromEvent(messages, done, "chat-1");
    messages = foldMessagesFromEvent(messages, secondUser, "chat-1");
    messages = foldMessagesFromEvent(messages, replayedLifecycle, "chat-1");
    messages = foldMessagesFromEvent(messages, replayedText, "chat-1");
    messages = foldMessagesFromEvent(messages, secondDelta, "chat-1");
    expect(messages.map((item) => item.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(messages[1]?.parts.some((part) => part.type === "session_lifecycle")).toBe(true);
    expect(messages[3]?.parts.some((part) => part.type === "session_lifecycle")).toBe(false);
    expect(textFromParts(messages[1]!.parts)).toBe("Hello! How can I help?");
    expect(textFromParts(messages[3]!.parts)).toBe("这是 Atmos");
  });

  it("folds tool calls into the live assistant message", () => {
    const tool = chatEvent("chat-1", 1, {
      type: "tool_call_started",
      turn_id: "t1",
      tool_call: {
        tool_call_id: "tool-1",
        name: "Read",
        title: "Read file",
        kind: "read",
        status: "running",
        params: { type: "read", path: "/tmp/app/README.md" },
      },
    });
    const messages = foldMessagesFromEvent([], tool, "chat-1");
    expect(messages[0]?.parts[0]).toMatchObject({
      type: "tool_call",
      tool_call_id: "tool-1",
      name: "Read",
      kind: "read",
      params: { type: "read", path: "/tmp/app/README.md" },
    });
  });

  it("defaults tool status from the event type when the payload omits it", () => {
    const started = foldMessagesFromEvent([], chatEvent("chat-1", 1, {
      type: "tool_call_started",
      turn_id: "t1",
      tool_call: {
        tool_call_id: "tool-1",
        name: "Read",
        kind: "read",
        params: { type: "read", path: "a.ts" },
      } as never,
    }), "chat-1");
    expect(started[0]?.parts[0]).toMatchObject({ type: "tool_call", status: "running" });

    const failed = foldMessagesFromEvent(started, chatEvent("chat-1", 2, {
      type: "tool_call_failed",
      turn_id: "t1",
      tool_call: {
        tool_call_id: "tool-1",
        name: "Read",
        kind: "read",
        params: { type: "read", path: "a.ts" },
      } as never,
    }), "chat-1");
    expect(failed[0]?.parts[0]).toMatchObject({ type: "tool_call", status: "failed" });
  });

  it("overwrites name and title when a completed event sends them", () => {
    const begin = chatEvent("chat-1", 1, {
      type: "tool_call_started",
      turn_id: "t1",
      tool_call: {
        tool_call_id: "tool-1",
        name: "Read",
        title: "Read `/tmp/app/README.md`",
        kind: "read",
        status: "running",
        params: { type: "read", path: "/tmp/app/README.md", limit: 150 },
      },
    });
    const done = chatEvent("chat-1", 2, {
      type: "tool_call_completed",
      turn_id: "t1",
      tool_call: {
        tool_call_id: "tool-1",
        name: "Tool",
        title: "Tool",
        kind: "read",
        status: "completed",
        params: { type: "read", path: "/tmp/app/README.md", limit: 150 },
        result: { type: "file_content", path: "/tmp/app/README.md", text: "# hi\n" },
      },
    });
    const messages = foldMessagesFromEvent(
      foldMessagesFromEvent([], begin, "chat-1"),
      done,
      "chat-1",
    );
    expect(messages[0]?.parts[0]).toMatchObject({
      type: "tool_call",
      name: "Tool",
      kind: "read",
      title: "Tool",
      status: "completed",
      params: { type: "read", path: "/tmp/app/README.md", limit: 150 },
      result: { type: "file_content", path: "/tmp/app/README.md", text: "# hi\n" },
    });
    expect(JSON.stringify(messages[0]?.parts[0])).not.toContain("\"input\"");
    expect(JSON.stringify(messages[0]?.parts[0])).not.toContain("\"output\"");
  });

  it("keeps prior optionals when a later event omits them", () => {
    const begin = chatEvent("chat-1", 1, {
      type: "tool_call_started",
      turn_id: "t1",
      tool_call: {
        tool_call_id: "tool-1",
        name: "Search",
        title: "Check LLM providers, DB backend, app names",
        kind: "search",
        status: "running",
        params: { type: "search", query: "Check LLM providers, DB backend, app names" },
      },
    });
    const done = chatEvent("chat-1", 2, {
      type: "tool_call_completed",
      turn_id: "t1",
      tool_call: {
        tool_call_id: "tool-1",
        status: "completed",
        result: { type: "text", text: "crates/llm/src/lib.rs" },
      } as never,
    });
    const messages = foldMessagesFromEvent(
      foldMessagesFromEvent([], begin, "chat-1"),
      done,
      "chat-1",
    );
    expect(messages[0]?.parts[0]).toMatchObject({
      type: "tool_call",
      name: "Search",
      kind: "search",
      title: "Check LLM providers, DB backend, app names",
      status: "completed",
      params: { type: "search", query: "Check LLM providers, DB backend, app names" },
      result: { type: "text", text: "crates/llm/src/lib.rs" },
    });
  });

  it("does not regress completed status when a running event is replayed", () => {
    const done = chatEvent("chat-1", 1, {
      type: "tool_call_completed",
      turn_id: "t1",
      tool_call: {
        tool_call_id: "tool-1",
        name: "Read",
        kind: "read",
        status: "completed",
        params: { type: "read", path: "a.ts" },
        result: { type: "file_content", path: "a.ts", text: "ok" },
      },
    });
    const replay = chatEvent("chat-1", 2, {
      type: "tool_call_started",
      turn_id: "t1",
      tool_call: {
        tool_call_id: "tool-1",
        status: "running",
      } as never,
    });
    const messages = foldMessagesFromEvent(
      foldMessagesFromEvent([], done, "chat-1"),
      replay,
      "chat-1",
    );
    expect(messages[0]?.parts[0]).toMatchObject({
      type: "tool_call",
      status: "completed",
      name: "Read",
      params: { type: "read", path: "a.ts" },
    });
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

  it("clears the composer plan when a new user turn starts", () => {
    let messages = foldMessagesFromEvent([], chatEvent("chat-1", 1, {
      type: "plan_updated",
      plan: { entries: [{ content: "Inspect", priority: "high", status: "in_progress" }] },
    }), "chat-1");
    expect(currentPlanFromMessages(messages)).not.toBeNull();
    messages = foldMessagesFromEvent(messages, chatEvent("chat-1", 2, {
      type: "user_message",
      turn_id: "t2",
      message_id: "u2",
      text: "next",
    }), "chat-1");
    expect(currentPlanFromMessages(messages)).toBeNull();
    messages = foldMessagesFromEvent(messages, chatEvent("chat-1", 3, {
      type: "plan_updated",
      plan: { entries: [{ content: "Fix fold", priority: "high", status: "pending" }] },
    }), "chat-1");
    expect(currentPlanFromMessages(messages)).toEqual({
      entries: [{ content: "Fix fold", priority: "high", status: "pending" }],
    });
  });

  it("does not reclassify think or TodoWrite tool names into thinking or plan parts", () => {
    const think = chatEvent("chat-1", 1, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "t-think",
        name: "think",
        title: "hmm",
        kind: "other",
        status: "running",
        params: { type: "other", value: null },
      },
    });
    const todo = chatEvent("chat-1", 2, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "t-todo",
        name: "TodoWrite",
        kind: "other",
        status: "completed",
        params: { type: "other", value: { todos: [{ content: "Inspect", status: "pending" }] } },
      },
    });
    const hidden = chatEvent("chat-1", 3, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "t-mode",
        name: "SwitchMode",
        title: "switch",
        kind: "other",
        status: "completed",
        params: { type: "other", value: null },
      },
    });
    let messages = foldMessagesFromEvent([], think, "chat-1");
    messages = foldMessagesFromEvent(messages, todo, "chat-1");
    messages = foldMessagesFromEvent(messages, hidden, "chat-1");
    expect(messages[0]?.parts.map((part) => part.type)).toEqual(["tool_call", "tool_call", "tool_call"]);
    expect(messages[0]?.parts[0]).toMatchObject({
      type: "tool_call",
      name: "think",
      kind: "other",
      title: "hmm",
    });
  });

  it("keeps a vendor todo_write payload as an other tool_call", () => {
    const started = chatEvent("chat-1", 1, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "t-todo",
        name: "Tool",
        title: "todo_write",
        kind: "other",
        status: "running",
        params: { type: "other", value: { merge: true } },
      },
    });
    const updated = chatEvent("chat-1", 2, {
      type: "tool_call_updated",
      tool_call: {
        tool_call_id: "t-todo",
        name: "Tool",
        title: "todo_write",
        kind: "other",
        status: "running",
        params: {
          type: "other",
          value: {
            merge: true,
            todos: [
              { content: "Inspect", status: "in_progress" },
              { content: "Patch", status: "pending" },
            ],
          },
        },
      },
    });
    let messages = foldMessagesFromEvent([], started, "chat-1");
    expect(messages[0]?.parts.map((part) => part.type)).toEqual(["tool_call"]);
    messages = foldMessagesFromEvent(messages, updated, "chat-1");
    expect(messages[0]?.parts.map((part) => part.type)).toEqual(["tool_call"]);
    expect(messages[0]?.parts[0]).toMatchObject({
      type: "tool_call",
      kind: "other",
      title: "todo_write",
    });
  });

  it("merges same-id tool progress in place after later assistant text", () => {
    const started = chatEvent("chat-1", 1, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "t-edit",
        name: "Edit",
        kind: "edit",
        status: "running",
        params: { type: "edit", path: "a.ts" },
      },
    });
    const text = textChunk(2, {
      part_id: "a1",
      message_id: "a1",
      text: "## 验证",
    });
    const completed = chatEvent("chat-1", 3, {
      type: "tool_call_completed",
      tool_call: {
        tool_call_id: "t-edit",
        name: "Edit",
        kind: "edit",
        status: "completed",
        params: { type: "edit", path: "a.ts" },
      },
    });
    let messages = foldMessagesFromEvent([], started, "chat-1");
    messages = foldMessagesFromEvent(messages, text, "chat-1");
    messages = foldMessagesFromEvent(messages, completed, "chat-1");
    expect(messages[0]?.parts.map((part) => part.type)).toEqual(["tool_call", "text"]);
    expect(messages[0]?.parts[0]).toMatchObject({
      type: "tool_call",
      tool_call_id: "t-edit",
      status: "completed",
    });
  });

  it("completes stuck tools when the turn ends but keeps background execute running", () => {
    const todo = chatEvent("chat-1", 1, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "t-other",
        name: "Tool",
        title: "SomeVendorTool",
        kind: "other",
        status: "running",
        params: { type: "other", value: null },
      },
    });
    const bg = chatEvent("chat-1", 2, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "t-bg",
        name: "Execute",
        title: "sleep 60",
        kind: "execute",
        status: "running",
        params: { type: "execute", command: "sleep 60", background: true },
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

  it("copies background execute params and still shows TaskOutput when it arrives as other", () => {
    const start = chatEvent("chat-1", 1, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "call-bg",
        name: "Execute",
        title: "count",
        kind: "execute",
        status: "running",
        params: { type: "execute", command: "count", background: true, task_id: "task-1" },
      },
    });
    const stream = chatEvent("chat-1", 2, {
      type: "tool_call_updated",
      tool_call: {
        tool_call_id: "call-bg",
        name: "Execute",
        title: "count",
        kind: "execute",
        status: "running",
        params: { type: "execute", command: "count", background: true, task_id: "task-1" },
        result: { type: "execute", output: "1\n" },
      },
    });
    const poll = chatEvent("chat-1", 3, {
      type: "tool_call_completed",
      tool_call: {
        tool_call_id: "call-poll",
        name: "TaskOutput",
        title: "Get task output: task-1",
        kind: "other",
        status: "completed",
        params: { type: "other", value: { task_id: "task-1" } },
        result: { type: "other", value: { output: "1\n2\n3\n" } },
      },
    });
    const finished = chatEvent("chat-1", 4, {
      type: "tool_call_completed",
      tool_call: {
        tool_call_id: "call-bg",
        name: "Execute",
        title: "count",
        kind: "execute",
        status: "completed",
        params: { type: "execute", command: "count", background: true, task_id: "task-1" },
        result: { type: "execute", output: "1\n2\n3\nDONE\n", exit_code: 0 },
      },
    });
    let messages = foldMessagesFromEvent([], start, "chat-1");
    messages = foldMessagesFromEvent(messages, stream, "chat-1");
    messages = foldMessagesFromEvent(messages, poll, "chat-1");
    const live = messages[0]?.parts.find((part) => part.type === "tool_call" && part.tool_call_id === "call-bg");
    expect(live).toMatchObject({
      type: "tool_call",
      status: "running",
      kind: "execute",
      params: { type: "execute", command: "count", background: true, task_id: "task-1" },
    });
    expect(messages[0]?.parts.some((part) => part.type === "tool_call" && part.tool_call_id === "call-poll")).toBe(true);
    messages = foldMessagesFromEvent(messages, finished, "chat-1");
    const done = messages[0]?.parts.find((part) => part.type === "tool_call" && part.tool_call_id === "call-bg");
    expect(done).toMatchObject({ status: "completed" });
    expect(JSON.stringify(done)).toContain("DONE");
    expect(messages[0]?.parts.some((part) => part.type === "tool_call" && part.name === "TaskOutput")).toBe(true);
  });

  it("updates one subagent card from dispatch through child completion", () => {
    const started = chatEvent("chat-1", 1, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "subagent-1",
        name: "Task",
        title: "Explore tests",
        kind: "subagent",
        status: "running",
        params: {
          type: "subagent",
          description: "Inspect the relevant test coverage",
          agent_type: "explore",
          task_id: "child-1",
        },
      },
    });
    const progress = chatEvent("chat-1", 2, {
      type: "tool_call_updated",
      tool_call: {
        tool_call_id: "subagent-1",
        name: "Task",
        title: "Explore tests",
        kind: "subagent",
        status: "running",
        params: {
          type: "subagent",
          description: "Inspect the relevant test coverage",
          agent_type: "explore",
          task_id: "child-1",
        },
      },
    });
    const completed = chatEvent("chat-1", 3, {
      type: "tool_call_completed",
      tool_call: {
        tool_call_id: "subagent-1",
        name: "Task",
        title: "Explore tests",
        kind: "subagent",
        status: "completed",
        params: {
          type: "subagent",
          description: "Inspect the relevant test coverage",
          agent_type: "explore",
          task_id: "child-1",
        },
        result: { type: "text", text: "Tests are covered." },
      },
    });

    let messages = foldMessagesFromEvent([], started, "chat-1");
    messages = foldMessagesFromEvent(messages, progress, "chat-1");
    messages = foldMessagesFromEvent(messages, completed, "chat-1");
    const cards = messages[0]?.parts.filter(
      (part) => part.type === "tool_call" && part.tool_call_id === "subagent-1",
    );
    expect(cards).toHaveLength(1);
    expect(cards?.[0]).toMatchObject({
      status: "completed",
      result: { type: "text", text: "Tests are covered." },
    });
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
    const thinking = textChunk(4, {
      part_id: "think-1",
      message_id: "a1",
      kind: "thinking",
      text: "hmm",
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

  it("closes text parts on turn_completed while a current-turn subagent is still running", () => {
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "explore",
    });
    const started = chatEvent("chat-1", 2, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "sub-1",
        name: "Agent",
        kind: "subagent",
        status: "running",
        params: { type: "subagent", description: "Explore atmos monorepo", agent_type: "Explore" },
      },
    });
    const done = chatEvent("chat-1", 3, {
      type: "turn_completed",
      turn_id: "t1",
      worked_ms: 12_000,
      completed_at: "2026-09-15T15:06:11.000Z",
    });
    let messages = foldMessagesFromEvent([], user, "chat-1");
    messages = foldMessagesFromEvent(messages, started, "chat-1");
    expect(currentTurnHasRunningSubagent(messages)).toBe(true);
    messages = foldMessagesFromEvent(messages, done, "chat-1");
    expect(messages[1]?.streaming).toBe(false);
    expect(messages[1]?.completed_at).toBe("2026-09-15T15:06:11.000Z");
    expect(messages[1]?.worked_ms).toBe(12_000);
    expect(currentTurnHasRunningSubagent(messages)).toBe(true);

    const child = chatEvent("chat-1", 4, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "read-1",
        name: "Read",
        kind: "read",
        status: "running",
        parent_tool_call_id: "sub-1",
        params: { type: "read", path: "AGENTS.md" },
      },
    });
    messages = foldMessagesFromEvent(messages, child, "chat-1");
    expect(messages[1]?.streaming).toBe(false);
    expect(messages[1]?.completed_at).toBe("2026-09-15T15:06:11.000Z");

    const childDone = chatEvent("chat-1", 5, {
      type: "tool_call_completed",
      tool_call: {
        tool_call_id: "read-1",
        name: "Read",
        kind: "read",
        status: "completed",
        parent_tool_call_id: "sub-1",
        params: { type: "read", path: "AGENTS.md" },
      },
    });
    messages = foldMessagesFromEvent(messages, childDone, "chat-1");
    expect(messages[1]?.streaming).toBe(false);

    const finished = chatEvent("chat-1", 6, {
      type: "tool_call_completed",
      tool_call: {
        tool_call_id: "sub-1",
        name: "Agent",
        kind: "subagent",
        status: "completed",
        params: { type: "subagent", description: "Explore atmos monorepo", agent_type: "Explore" },
      },
    });
    messages = foldMessagesFromEvent(messages, finished, "chat-1");
    expect(currentTurnHasRunningSubagent(messages)).toBe(false);
    expect(messages[1]?.streaming).toBe(false);
    expect(messages[1]?.completed_at).toBe("2026-09-15T15:06:11.000Z");
  });

  it("keeps streaming until the part closes or the turn completes", () => {
    const chunk = textChunk(1, {
      part_id: "a1",
      message_id: "a1",
      text: "hi",
    });
    let messages = foldMessagesFromEvent([], chunk, "chat-1");
    expect(messages[0]?.streaming).toBe(true);
    messages = foldMessagesFromEvent(messages, partClosed(2, "a1"), "chat-1");
    expect(messages[0]?.streaming).toBe(false);
    expect(textFromParts(messages[0]!.parts)).toBe("hi");
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

  it("stamps thinking duration when the thinking part closes", () => {
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    });
    const thinking = textChunk(2, {
      part_id: "think-1",
      message_id: "a1",
      kind: "thinking",
      text: "hmm",
    });
    const done = partClosed(3, "think-1", 4000);
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
    messages = foldMessagesFromEvent(messages, textChunk(2, {
      part_id: "think-1",
      message_id: "a1",
      kind: "thinking",
      text: "first",
      ordinal: 0,
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, partClosed(3, "think-1", 5000), "chat-1");
    messages = foldMessagesFromEvent(messages, chatEvent("chat-1", 4, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "t1",
        name: "Read",
        kind: "read",
        status: "running",
        params: { type: "read", path: "a.ts" },
      },
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, textChunk(5, {
      part_id: "think-2",
      message_id: "a1",
      kind: "thinking",
      text: "second",
      ordinal: 2,
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, partClosed(6, "think-2", 8000), "chat-1");
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
    expect(messages[1]?.parts.filter((part) => part.type === "thinking")).toMatchObject([
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
    const chunk = textChunk(2, {
      part_id: "a1",
      message_id: "a1",
      text: "hello",
    });
    const done = chatEvent("chat-1", 3, {
      type: "turn_completed",
      turn_id: "t1",
      worked_ms: 14000,
      thinking_ms: 4000,
      completed_at: "2026-08-28T12:00:14.000Z",
    });
    const messages = foldMessagesFromEvent(
      foldMessagesFromEvent(foldMessagesFromEvent([], user, "chat-1"), chunk, "chat-1"),
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
    const chunk = textChunk(2, {
      part_id: "a1",
      message_id: "a1",
      text: "hello",
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
    messages = foldMessagesFromEvent(messages, chunk, "chat-1");
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

  it("hydrates persisted rows then live chunks without comparing text", () => {
    const persisted: AgentMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "Hel", message_id: "p1" }],
        streaming: true,
      },
    ];
    const messages = hydrateAgentChatMessages(
      persisted,
      [
        textChunk(10, {
          part_id: "p1",
          message_id: "a1",
          offset: byteLength("Hel"),
          text: "lo",
        }),
      ],
      "chat-1",
    );
    expect(messages.map((item) => item.id)).toEqual(["u1", "a1"]);
    expect(textFromParts(messages[1]!.parts)).toBe("Hello");
    expect(messages[1]?.streaming).toBe(true);
  });

  it("ignores a contained replay chunk by offset rather than by text equality", () => {
    const persisted: AgentMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "Hello world", message_id: "p1" }],
        streaming: true,
      },
    ];
    const messages = hydrateAgentChatMessages(
      persisted,
      [
        textChunk(10, {
          part_id: "p1",
          message_id: "a1",
          text: "Hello world",
        }),
      ],
      "chat-1",
    );
    expect(textFromParts(messages[1]!.parts)).toBe("Hello world");
  });

  it("applies an overlapping chunk by keeping only the tail beyond current length", () => {
    const persisted: AgentMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "Hel", message_id: "p1" }],
        streaming: true,
      },
    ];
    const messages = hydrateAgentChatMessages(
      persisted,
      [
        textChunk(10, {
          part_id: "p1",
          message_id: "a1",
          text: "Hello",
        }),
      ],
      "chat-1",
    );
    expect(textFromParts(messages[1]!.parts)).toBe("Hello");
  });

  it("starts a new text part after tools instead of appending to the first block", () => {
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    });
    let messages = foldMessagesFromEvent([], user, "chat-1");
    messages = foldMessagesFromEvent(messages, textChunk(2, {
      part_id: "a1",
      message_id: "a1",
      text: "looking",
      ordinal: 0,
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, chatEvent("chat-1", 3, {
      type: "tool_call_started",
      turn_id: "t1",
      tool_call: {
        tool_call_id: "tool-1",
        name: "Read",
        kind: "read",
        status: "running",
        params: { type: "read", path: "a.ts" },
      },
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, textChunk(4, {
      part_id: "a2",
      message_id: "a2",
      text: "final",
      ordinal: 2,
    }), "chat-1");
    const parts = messages[1]?.parts ?? [];
    expect(parts.map((part) => part.type)).toEqual(["text", "tool_call", "text"]);
    expect(parts[0]).toMatchObject({ type: "text", text: "looking" });
    expect(parts[2]).toMatchObject({ type: "text", text: "final" });
  });

  it("updates the same part after tools instead of opening a new text block", () => {
    const first = "先从 tabs 看创建、关闭和重启后恢复时有";
    const second = "没有串数据。";
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    });
    let messages = foldMessagesFromEvent([], user, "chat-1");
    messages = foldMessagesFromEvent(messages, textChunk(2, {
      part_id: "a1",
      message_id: "a1",
      text: first,
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, chatEvent("chat-1", 3, {
      type: "tool_call_started",
      turn_id: "t1",
      tool_call: {
        tool_call_id: "tool-1",
        name: "Read",
        kind: "read",
        status: "running",
        params: { type: "read", path: "a.ts" },
      },
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, textChunk(4, {
      part_id: "a1",
      message_id: "a1",
      offset: byteLength(first),
      text: second,
    }), "chat-1");
    const parts = messages[1]?.parts ?? [];
    expect(parts.map((part) => part.type)).toEqual(["text", "tool_call"]);
    expect(parts[0]).toMatchObject({
      type: "text",
      text: `${first}${second}`,
      message_id: "a1",
    });
  });

  it("S18 gap at 300 with len 100 raises one backfill from 100 without duplicating text", () => {
    const prefix = "x".repeat(100);
    const suffix = "y".repeat(250);
    const server = `${prefix}${suffix}`;
    const user = chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "hi",
    });
    let messages = foldMessagesFromEvent([], user, "chat-1");
    messages = foldMessagesFromEvent(messages, textChunk(2, {
      part_id: "a1",
      message_id: "a1",
      text: prefix,
    }), "chat-1");
    expect(textFromParts(messages[1]!.parts)).toBe(prefix);

    const inflight = new Set<string>();
    const gap = textChunk(3, {
      part_id: "a1",
      message_id: "a1",
      offset: 300,
      text: "z".repeat(20),
    });
    const gapped = foldAgentChatEventResult(messages, gap, "chat-1");
    expect(gapped.backfill).toEqual({ partId: "a1", fromOffset: 100 });
    expect(textFromParts(gapped.messages[1]!.parts)).toBe(prefix);
    expect(textFromParts(gapped.messages[1]!.parts)).not.toContain("z");

    const first = takeBackfillRequest(inflight, gapped.backfill);
    expect(first).toEqual({ partId: "a1", fromOffset: 100 });
    expect(takeBackfillRequest(inflight, gapped.backfill)).toBeNull();

    messages = foldMessagesFromEvent(gapped.messages, textChunk(4, {
      part_id: "a1",
      message_id: "a1",
      offset: 100,
      text: suffix,
    }), "chat-1");
    expect(textFromParts(messages[1]!.parts)).toBe(server);

    messages = foldMessagesFromEvent(messages, gap, "chat-1");
    expect(textFromParts(messages[1]!.parts)).toBe(server);
  });

  it("keeps a settled assistant identity while a later turn streams", () => {
    let messages = foldMessagesFromEvent([], chatEvent("chat-1", 1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "one",
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, textChunk(2, {
      part_id: "a1",
      message_id: "a1",
      text: "done",
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, partClosed(3, "a1"), "chat-1");
    const settled = messages.find((message) => message.role === "assistant");
    expect(settled?.id).toBe("a1");

    messages = foldMessagesFromEvent(messages, chatEvent("chat-1", 4, {
      type: "user_message",
      turn_id: "t2",
      message_id: "u2",
      text: "two",
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, textChunk(5, {
      part_id: "a2",
      message_id: "a2",
      text: "hel",
    }), "chat-1");
    expect(messages.find((message) => message.id === "a1")).toBe(settled);

    messages = foldMessagesFromEvent(messages, textChunk(6, {
      part_id: "a2",
      message_id: "a2",
      offset: 3,
      text: "lo",
    }), "chat-1");
    expect(messages.find((message) => message.id === "a1")).toBe(settled);
    expect(textFromParts(messages.find((message) => message.id === "a2")!.parts)).toBe("hello");
  });
});
