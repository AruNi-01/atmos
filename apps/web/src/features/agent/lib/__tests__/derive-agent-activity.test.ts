import { describe, expect, it } from "bun:test";
import type { AgentChatEvent, AgentEvent, AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { foldMessagesFromEvent } from "@/features/agent/lib/agent-chat-events";
import { deriveAgentActivity, runningBackgroundTools } from "@/features/agent/lib/chat-helpers";

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
        params: { type: "read", path: "a.ts" },
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

  it("stays generating after session create completes while the turn is still open", () => {
    expect(deriveAgentActivity([
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
      assistant([{
        type: "session_lifecycle",
        action: "create",
        status: "completed",
        duration_ms: 800,
      }], { streaming: false }),
    ], true)).toMatchObject({ busy: true, kind: "working", label: "Generating" });

    expect(deriveAgentActivity([
      assistant([{
        type: "session_lifecycle",
        action: "create",
        status: "completed",
        duration_ms: 800,
      }], { streaming: false }),
    ], false)).toEqual({ busy: false });
  });

  it("keeps generating for any open turn even when streaming was cleared mid-content", () => {
    expect(deriveAgentActivity([
      assistant([{ type: "text", text: "partial" }], { streaming: false }),
    ], true)).toMatchObject({ busy: true, kind: "working", label: "Generating" });
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
          params: { type: "read", path: "a.ts" },
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
          params: { type: "read", path: "a.ts" },
        },
        {
          type: "tool_call",
          tool_call_id: "t2",
          name: "Read",
          kind: "read",
          status: "failed",
          params: { type: "read", path: "b.ts" },
        },
        {
          type: "tool_call",
          tool_call_id: "t3",
          name: "Read",
          kind: "read",
          status: "completed",
          params: { type: "read", path: "c.ts" },
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
          params: { type: "search", query: "repo" },
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
          params: { type: "read", path: "a.ts" },
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
      tool_call: {
        tool_call_id: "t1",
        name: "Read",
        kind: "read",
        status: "running",
        params: { type: "read", path: "a.ts" },
      },
    }), "chat-1");
    expect(deriveAgentActivity(messages, false)).toMatchObject({ kind: "working", label: "Reading" });

    messages = foldMessagesFromEvent(messages, event(5, {
      type: "tool_call_completed",
      tool_call: {
        tool_call_id: "t1",
        name: "Read",
        kind: "read",
        status: "completed",
        params: { type: "read", path: "a.ts" },
      },
    }), "chat-1");
    expect(deriveAgentActivity(messages, false)).toMatchObject({ kind: "working", label: "Reading" });

    messages = foldMessagesFromEvent(messages, event(6, {
      type: "tool_call_started",
      tool_call: {
        tool_call_id: "t2",
        name: "Execute",
        title: "ls -la ~/.grok",
        kind: "execute",
        status: "running",
        params: {
          type: "execute",
          command: "ls -la ~/.grok 2>/dev/null | head",
          background: true,
        },
      },
    }), "chat-1");
    const afterBackground = deriveAgentActivity(messages, false);
    expect(afterBackground).toMatchObject({ kind: "working", label: "Reading" });
    expect(JSON.stringify(afterBackground)).not.toContain("ls -la");
  });

  it("shows short verbs for live tools and never the command or path", () => {
    const foreground = deriveAgentActivity([
      assistant([{
        type: "tool_call",
        tool_call_id: "t1",
        name: "Bash",
        kind: "execute",
        status: "running",
        title: "Execute: gh pr view 275",
        params: { type: "execute", command: "gh pr view 275", background: false },
      }], { streaming: true }),
    ], false);
    expect(foreground).toMatchObject({ busy: true, kind: "working", label: "Executing" });
    expect(JSON.stringify(foreground)).not.toContain("gh pr view");

    expect(deriveAgentActivity([
      assistant([{
        type: "tool_call",
        tool_call_id: "t4",
        name: "Tool",
        kind: "other",
        status: "running",
        title: "SomeVendorTool",
        params: { type: "other", value: null },
      }], { streaming: true }),
    ], false)).toMatchObject({ busy: true, kind: "working", label: "Working" });
  });

  it("labels web_search as searching", () => {
    expect(deriveAgentActivity([
      assistant([{
        type: "tool_call",
        tool_call_id: "t-web",
        name: "WebSearch",
        kind: "web_search",
        status: "running",
        params: { type: "web_search", query: "atmos" },
      }], { streaming: true }),
    ], false)).toMatchObject({ busy: true, kind: "working", label: "Searching" });
  });

  it("ignores background execute so they do not keep the turn busy", () => {
    expect(deriveAgentActivity([
      assistant([
        { type: "thinking", text: "launch a watcher" },
        {
          type: "tool_call",
          tool_call_id: "t-bg",
          name: "Execute",
          kind: "execute",
          status: "running",
          title: "sleep loop",
          params: { type: "execute", command: "i=1; while true; do sleep 1; done", background: true },
        },
        { type: "text", text: "it is running in the background" },
      ], { streaming: false }),
    ], false)).toEqual({ busy: false });

    expect(deriveAgentActivity([
      assistant([
        { type: "thinking", text: "launch a watcher" },
        {
          type: "tool_call",
          tool_call_id: "t-bg",
          name: "Execute",
          kind: "execute",
          status: "running",
          title: "sleep 60",
          params: { type: "execute", command: "sleep 60", background: true },
        },
      ], { streaming: true }),
    ], false)).toMatchObject({ busy: true, kind: "thinking", label: "Thinking" });

    expect(runningBackgroundTools([
      assistant([{
        type: "tool_call",
        tool_call_id: "t-bg",
        name: "Execute",
        kind: "execute",
        status: "running",
        title: "sleep 60",
        params: { type: "execute", command: "sleep 60", background: true },
      }], { streaming: false }),
    ]).map((part) => part.tool_call_id)).toEqual(["t-bg"]);

    expect(deriveAgentActivity([
      assistant([{
        type: "tool_call",
        tool_call_id: "t-bg",
        name: "Execute",
        kind: "execute",
        status: "running",
        title: "count",
        params: { type: "execute", command: "count", background: true },
      }], { streaming: false }),
    ], false)).toEqual({ busy: false });

    expect(runningBackgroundTools([
      assistant([{
        type: "tool_call",
        tool_call_id: "t-bg",
        name: "Execute",
        kind: "execute",
        status: "completed",
        title: "count",
        params: { type: "execute", command: "count", background: true },
        result: { type: "execute", output: "DONE\n", exit_code: 0 },
      }], { streaming: false }),
    ])).toEqual([]);
  });
});
