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
    ], false)).toMatchObject({ busy: true, kind: "working", label: "Read a.ts" });
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

  it("follows later parent execute instead of a stuck subagent or wait Tool", () => {
    const activity = deriveAgentActivity([
      assistant([
        {
          type: "tool_call",
          tool_call_id: "sub",
          name: "Task",
          kind: "subagent",
          status: "running",
          params: { type: "subagent", description: "Inspect tests", agent_type: "explore" },
        },
        {
          type: "tool_call",
          tool_call_id: "wait",
          name: "TaskOutput",
          kind: "other",
          status: "running",
          params: { type: "other", value: { task_id: "child1" } },
        },
        {
          type: "tool_call",
          tool_call_id: "bash",
          name: "Bash",
          kind: "execute",
          status: "running",
          params: { type: "execute", command: "ls", background: false },
        },
      ], { streaming: true }),
    ], true);
    expect(activity).toMatchObject({ busy: true, kind: "working", label: "Execute ls" });
  });

  it("omits nested child tools from parent activity", () => {
    const activity = deriveAgentActivity([
      assistant([
        {
          type: "tool_call",
          tool_call_id: "sub",
          name: "spawn_subagent",
          kind: "subagent",
          status: "completed",
          params: { type: "subagent", description: "Read hello", agent_type: "explore" },
        },
        {
          type: "tool_call",
          tool_call_id: "child-read",
          name: "Read",
          kind: "read",
          status: "running",
          parent_tool_call_id: "sub",
          params: { type: "read", path: "hello2.txt" },
        },
        {
          type: "tool_call",
          tool_call_id: "bash",
          name: "Bash",
          kind: "execute",
          status: "running",
          params: { type: "execute", command: "pwd", background: false },
        },
      ], { streaming: true }),
    ], true);
    expect(activity).toMatchObject({ busy: true, kind: "working", label: "Execute pwd" });
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
    expect(activity).toMatchObject({ busy: true, kind: "working", label: "Read a.ts" });
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
    expect(activity).toMatchObject({ busy: true, kind: "working", label: "Read c.ts" });
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
    expect(activity).toMatchObject({ busy: true, kind: "working", label: "Search repo" });
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
    expect(deriveAgentActivity(messages, false)).toMatchObject({ kind: "working", label: "Read a.ts" });

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
    expect(deriveAgentActivity(messages, false)).toMatchObject({ kind: "working", label: "Read a.ts" });

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
    expect(afterBackground).toMatchObject({ kind: "working", label: "Read a.ts" });
    expect(JSON.stringify(afterBackground)).not.toContain("ls -la");
  });

  it("shows the tool headline instead of a short verb", () => {
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
    expect(foreground).toMatchObject({
      busy: true,
      kind: "working",
      label: "Execute: gh pr view 275",
      trail: "none",
    });

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
    ], false)).toMatchObject({ busy: true, kind: "working", label: "SomeVendorTool" });
  });

  it("labels web_search with the query", () => {
    expect(deriveAgentActivity([
      assistant([{
        type: "tool_call",
        tool_call_id: "t-web",
        name: "WebSearch",
        kind: "web_search",
        status: "running",
        params: { type: "web_search", query: "atmos" },
      }], { streaming: true }),
    ], false)).toMatchObject({ busy: true, kind: "working", label: "Search atmos" });
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

  it("does not invent wait copy from a running subagent or nested child tools", () => {
    const activity = deriveAgentActivity([
      assistant([
        {
          type: "tool_call",
          tool_call_id: "parent",
          name: "Task",
          kind: "subagent",
          status: "running",
          params: {
            type: "subagent",
            description: "Explore activity indicator spacing",
            agent_type: "explore",
          },
        },
        {
          type: "tool_call",
          tool_call_id: "child-read",
          name: "Read",
          kind: "read",
          status: "running",
          parent_tool_call_id: "parent",
          params: { type: "read", path: "a.ts" },
        },
      ], { streaming: true }),
    ], true);
    expect(activity).toMatchObject({ busy: true, kind: "working", label: "Tool" });
    expect(JSON.stringify(activity)).not.toContain("Waiting");
    expect(JSON.stringify(activity)).not.toContain("a.ts");
  });

  it("maps an active vendor wait-poll tool", () => {
    const activity = deriveAgentActivity([
      assistant([
        {
          type: "tool_call",
          tool_call_id: "parent",
          name: "Task",
          kind: "subagent",
          status: "running",
          params: {
            type: "subagent",
            description: "Explore activity indicator spacing",
            agent_type: "explore",
          },
        },
        {
          type: "tool_call",
          tool_call_id: "child-read",
          name: "Read",
          kind: "read",
          status: "completed",
          parent_tool_call_id: "parent",
          params: { type: "read", path: "a.ts" },
        },
        {
          type: "tool_call",
          tool_call_id: "wait",
          name: "TaskOutput",
          kind: "other",
          status: "running",
          params: { type: "other", value: null },
        },
      ], { streaming: true }),
    ], true);
    expect(activity).toMatchObject({
      busy: true,
      kind: "working",
      label: "Waiting for 1 background agent to finish",
    });
  });

  it("maps an active wait-poll even when parent_tool_call_id points at the spawn", () => {
    const activity = deriveAgentActivity([
      assistant([
        {
          type: "tool_call",
          tool_call_id: "parent",
          name: "spawn_subagent",
          kind: "subagent",
          status: "running",
          params: {
            type: "subagent",
            description: "Explore files",
            agent_type: "explore",
          },
        },
        {
          type: "thinking",
          text: "child thought",
          parent_tool_call_id: "parent",
        },
        {
          type: "tool_call",
          tool_call_id: "child-read",
          name: "Read",
          kind: "read",
          status: "running",
          parent_tool_call_id: "parent",
          params: { type: "read", path: "hello2.txt" },
        },
        {
          type: "tool_call",
          tool_call_id: "wait",
          name: "get_command_or_subagent_output",
          kind: "other",
          status: "running",
          parent_tool_call_id: "parent",
          params: { type: "other", value: { task_id: "parent" } },
        },
      ], { streaming: true }),
    ], true);
    expect(activity).toMatchObject({
      busy: true,
      kind: "working",
      label: "Waiting for 1 background agent to finish",
    });
    expect(JSON.stringify(activity)).not.toContain("hello2.txt");
  });

  it("counts two nested wait-poll tools as two background agents", () => {
    const activity = deriveAgentActivity([
      assistant([
        {
          type: "tool_call",
          tool_call_id: "one",
          name: "Task",
          kind: "subagent",
          status: "running",
          params: { type: "subagent", description: "Explore files", agent_type: "explore" },
        },
        {
          type: "tool_call",
          tool_call_id: "two",
          name: "Agent",
          kind: "subagent",
          status: "running",
          params: { type: "subagent", description: "Write summary", agent_type: "generalPurpose" },
        },
        {
          type: "tool_call",
          tool_call_id: "wait-1",
          name: "TaskOutput",
          kind: "other",
          status: "running",
          parent_tool_call_id: "one",
          params: { type: "other", value: null },
        },
        {
          type: "tool_call",
          tool_call_id: "wait-2",
          name: "AgentOutput",
          kind: "other",
          status: "running",
          title: "get_command_or_subagent_output",
          parent_tool_call_id: "two",
          params: { type: "other", value: null },
        },
      ], { streaming: true }),
    ], true);
    expect(activity).toMatchObject({
      busy: true,
      kind: "working",
      label: "Waiting for 2 background agents to finish",
    });
  });

  it("lets a later main-agent tool win over a wait poll", () => {
    const activity = deriveAgentActivity([
      assistant([
        {
          type: "tool_call",
          tool_call_id: "parent",
          name: "Task",
          kind: "subagent",
          status: "running",
          params: { type: "subagent", description: "Explore files", agent_type: "explore" },
        },
        {
          type: "tool_call",
          tool_call_id: "wait",
          name: "TaskOutput",
          kind: "other",
          status: "running",
          params: { type: "other", value: null },
        },
        {
          type: "tool_call",
          tool_call_id: "read",
          name: "Read",
          kind: "read",
          status: "running",
          params: { type: "read", path: "a.ts" },
        },
      ], { streaming: true }),
    ], true);
    expect(activity).toMatchObject({ busy: true, kind: "working", label: "Read a.ts" });
  });

  it("counts active wait-poll tools, not subagent cards", () => {
    const activity = deriveAgentActivity([
      assistant([
        {
          type: "tool_call",
          tool_call_id: "one",
          name: "Task",
          kind: "subagent",
          status: "running",
          params: { type: "subagent", description: "Explore files", agent_type: "explore" },
        },
        {
          type: "tool_call",
          tool_call_id: "two",
          name: "Agent",
          kind: "subagent",
          status: "running",
          params: { type: "subagent", description: "Write summary", agent_type: "generalPurpose" },
        },
        {
          type: "tool_call",
          tool_call_id: "wait-1",
          name: "TaskOutput",
          kind: "other",
          status: "running",
          params: { type: "other", value: null },
        },
        {
          type: "tool_call",
          tool_call_id: "wait-2",
          name: "AgentOutput",
          kind: "other",
          status: "running",
          title: "get_command_or_subagent_output",
          params: { type: "other", value: null },
        },
      ], { streaming: true }),
    ], true);
    expect(activity).toMatchObject({
      busy: true,
      kind: "working",
      label: "Waiting for 2 background agents to finish",
    });
  });

  it("drops completed wait-poll tools from the streaming fallback", () => {
    const activity = deriveAgentActivity([
      assistant([
        {
          type: "tool_call",
          tool_call_id: "parent",
          name: "Task",
          kind: "subagent",
          status: "running",
          params: { type: "subagent", description: "Explore files", agent_type: "explore" },
        },
        {
          type: "tool_call",
          tool_call_id: "wait",
          name: "TaskOutput",
          kind: "other",
          status: "completed",
          params: { type: "other", value: null },
        },
      ], { streaming: true }),
    ], true);
    expect(activity).toMatchObject({ busy: true, kind: "working", label: "Tool" });
    expect(JSON.stringify(activity)).not.toContain("Waiting");
  });
});
