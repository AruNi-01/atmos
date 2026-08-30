import { describe, expect, it } from "bun:test";
import type { AgentChatEvent, AgentEvent, AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { foldMessagesFromEvent } from "@/features/agent/lib/agent-chat-events";
import { deriveAgentActivity } from "@/features/agent/lib/chat-helpers";

function assistant(parts: AgentPart[], extra: Partial<AgentMessage> = {}): AgentMessage {
  return { id: "a1", role: "assistant", parts, ...extra };
}

describe("deriveAgentActivity", () => {
  it("is idle with no assistant turn in flight", () => {
    expect(deriveAgentActivity([], false)).toEqual({ busy: false });
    expect(deriveAgentActivity([{ id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] }], false))
      .toEqual({ busy: false });
  });

  it("uses thinking stars while the last streaming part is thought", () => {
    const activity = deriveAgentActivity([
      assistant([{ type: "thinking", text: "consider the files" }], { streaming: true }),
    ], false);
    expect(activity).toMatchObject({ busy: true, kind: "thinking" });
  });

  it("keeps working orbs for generating, tools, and answer streaming", () => {
    expect(deriveAgentActivity([], true)).toMatchObject({ busy: true, kind: "working" });
    expect(deriveAgentActivity([
      assistant([{
        type: "tool_call",
        tool_call_id: "t1",
        name: "Read",
        kind: "read",
        status: "running",
      }], { streaming: true }),
    ], false)).toMatchObject({ busy: true, kind: "working" });
    expect(deriveAgentActivity([
      assistant([{ type: "text", text: "here is the answer" }], { streaming: true }),
    ], false)).toMatchObject({ busy: true, kind: "working" });
  });

  it("shows creating or resuming while the session lifecycle is still running", () => {
    expect(deriveAgentActivity([
      assistant([{
        type: "session_lifecycle",
        action: "create",
        status: "running",
      }], { streaming: true }),
    ], false)).toMatchObject({ busy: true, kind: "working", label: "Creating session" });
    expect(deriveAgentActivity([
      assistant([{
        type: "session_lifecycle",
        action: "resume",
        status: "running",
      }], { streaming: true }),
    ], false)).toMatchObject({ busy: true, kind: "working", label: "Resuming session" });
  });

  it("lets a running tool take precedence over earlier thought", () => {
    const activity = deriveAgentActivity([
      assistant([
        { type: "thinking", text: "i will read the file" },
        {
          type: "tool_call",
          tool_call_id: "t1",
          name: "Read",
          kind: "read",
          status: "running",
        },
      ], { streaming: true }),
    ], false);
    expect(activity).toMatchObject({ busy: true, kind: "working", label: "Reading" });
  });

  it("follows the latest tool event instead of falling back to earlier thought", () => {
    const activity = deriveAgentActivity([
      assistant([
        { type: "thinking", text: "i will inspect the files" },
        {
          type: "tool_call",
          tool_call_id: "t1",
          name: "Read",
          kind: "read",
          status: "completed",
        },
        {
          type: "tool_call",
          tool_call_id: "t2",
          name: "Read",
          kind: "read",
          status: "failed",
        },
        {
          type: "tool_call",
          tool_call_id: "t3",
          name: "Read",
          kind: "read",
          status: "completed",
        },
      ], { streaming: true, thinking_ms: 6000 }),
    ], false);
    expect(activity).toMatchObject({ busy: true, kind: "working", label: "Reading" });
  });

  it("treats in-progress tool status as live work", () => {
    const activity = deriveAgentActivity([
      assistant([
        { type: "thinking", text: "search the repo" },
        {
          type: "tool_call",
          tool_call_id: "t1",
          name: "Grep",
          kind: "search",
          status: "InProgress",
        },
      ], { streaming: true }),
    ], false);
    expect(activity).toMatchObject({ busy: true, kind: "working", label: "Searching" });
  });

  it("returns to thinking when a later thought part arrives after tools", () => {
    const activity = deriveAgentActivity([
      assistant([
        { type: "thinking", text: "first pass" },
        {
          type: "tool_call",
          tool_call_id: "t1",
          name: "Read",
          kind: "read",
          status: "completed",
        },
        { type: "thinking", text: "now synthesize" },
      ], { streaming: true }),
    ], false);
    expect(activity).toMatchObject({ busy: true, kind: "thinking", label: "Thinking" });
  });

  it("updates the footer activity as live events arrive", () => {
    const event = (sequence: number, payload: AgentEvent): AgentChatEvent => ({
      chat_id: "chat-1",
      event_id: `evt-${sequence}`,
      sequence,
      payload,
    });
    let messages: AgentMessage[] = [];
    messages = foldMessagesFromEvent(messages, event(1, {
      type: "user_message",
      turn_id: "t1",
      message_id: "u1",
      text: "inspect the files",
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, event(2, {
      type: "thinking_delta",
      message_id: "a1",
      delta: "i will read the files",
    }), "chat-1");
    expect(deriveAgentActivity(messages, false)).toMatchObject({ kind: "thinking", label: "Thinking" });

    messages = foldMessagesFromEvent(messages, event(3, {
      type: "thinking_completed",
      message_id: "a1",
      thinking_ms: 6000,
    }), "chat-1");
    messages = foldMessagesFromEvent(messages, event(4, {
      type: "tool_call_started",
      tool_call: { tool_call_id: "t1", name: "Read", status: "running" },
    }), "chat-1");
    expect(deriveAgentActivity(messages, false)).toMatchObject({ kind: "working", label: "Reading" });

    messages = foldMessagesFromEvent(messages, event(5, {
      type: "tool_call_completed",
      tool_call: { tool_call_id: "t1", name: "Read", status: "completed" },
    }), "chat-1");
    expect(deriveAgentActivity(messages, false)).toMatchObject({ kind: "working", label: "Reading" });
  });
});
