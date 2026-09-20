import { describe, expect, it } from "bun:test";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import {
  currentTurnSubagentTasks,
  displaySubagentType,
  formatSubagentTaskLine,
  inlineSubagentTasksByMessageId,
  isClaudeTaskNotificationText,
  isSubagentDispatchAckText,
  messagesForSubagent,
  subagentChildActivity,
  subagentResultText,
  subagentTaskStatus,
  titleCaseSubagentType,
} from "@/features/agent/lib/subagent-tasks";

function assistant(parts: AgentPart[], extra: Partial<AgentMessage> = {}): AgentMessage {
  return { id: "a1", role: "assistant", parts, ...extra };
}

function subagent(partial: Partial<AgentToolCallPart> & Pick<AgentToolCallPart, "tool_call_id">): AgentToolCallPart {
  return {
    type: "tool_call",
    name: "Task",
    title: "Explore tests",
    kind: "subagent",
    status: "running",
    params: {
      type: "subagent",
      description: "Inspect the relevant test coverage",
      agent_type: "explore",
    },
    ...partial,
  };
}

describe("subagent task labels", () => {
  it("title-cases agent types and formats the dock line", () => {
    expect(titleCaseSubagentType("explore")).toBe("Explore");
    expect(titleCaseSubagentType("general-purpose")).toBe("General Purpose");
    expect(titleCaseSubagentType("generalPurpose")).toBe("General Purpose");
    const part = subagent({ tool_call_id: "s1" });
    expect(displaySubagentType(part)).toBe("Explore");
    expect(formatSubagentTaskLine(part)).toBe("Explore - Inspect the relevant test coverage");
    expect(subagentTaskStatus(part)).toBe("running");
  });

  it("falls back to title when description is missing", () => {
    const part = subagent({
      tool_call_id: "s2",
      title: "Map the repo",
      params: { type: "subagent", description: "", agent_type: "explore" },
    });
    expect(formatSubagentTaskLine(part)).toBe("Explore - Map the repo");
  });
});

describe("currentTurnSubagentTasks", () => {
  it("collects top-level subagents from the current turn and keeps child tools", () => {
    const parent = subagent({ tool_call_id: "parent" });
    const childRead: AgentToolCallPart = {
      type: "tool_call",
      tool_call_id: "child-read",
      name: "Read",
      kind: "read",
      status: "completed",
      parent_tool_call_id: "parent",
      params: { type: "read", path: "a.ts" },
    };
    const nested = subagent({
      tool_call_id: "child-sub",
      parent_tool_call_id: "parent",
      params: { type: "subagent", description: "Nested explore", agent_type: "explore" },
    });
    const sibling = subagent({
      tool_call_id: "sibling",
      status: "completed",
      params: { type: "subagent", description: "Write the summary", agent_type: "generalPurpose" },
    });

    const tasks = currentTurnSubagentTasks([
      { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
      assistant([parent, childRead, nested, sibling]),
    ]);

    expect(tasks.items.map((item) => item.tool_call_id)).toEqual(["parent", "sibling"]);
    expect(tasks.tools.map((item) => item.tool_call_id)).toEqual([
      "parent",
      "child-read",
      "child-sub",
      "sibling",
    ]);
    expect(formatSubagentTaskLine(tasks.items[1]!)).toBe("General Purpose - Write the summary");
  });

  it("does not leak subagents from the previous user turn", () => {
    const previous = subagent({ tool_call_id: "old" });
    const current = subagent({
      tool_call_id: "new",
      params: { type: "subagent", description: "Now", agent_type: "explore" },
    });
    const tasks = currentTurnSubagentTasks([
      { id: "u1", role: "user", parts: [{ type: "text", text: "first" }] },
      assistant([previous]),
      { id: "u2", role: "user", parts: [{ type: "text", text: "next" }] },
      assistant([current]),
    ]);
    expect(tasks.items.map((item) => item.tool_call_id)).toEqual(["new"]);
  });

  it("does not treat a Claude task-notification user turn as a new prompt", () => {
    const parent = subagent({
      tool_call_id: "call_task_1",
      status: "completed",
      params: { type: "subagent", description: "Explore atmos monorepo", agent_type: "Explore" },
    });
    const notice = "<task-notification>\n<task-id>a827867c2504be0f1</task-id>\n<tool-use-id>call_task_1</tool-use-id>\n</task-notification>";
    expect(isClaudeTaskNotificationText(notice)).toBe(true);
    const tasks = currentTurnSubagentTasks([
      { id: "u1", role: "user", parts: [{ type: "text", text: "启动一个 subagent" }] },
      assistant([parent]),
      { id: "u2", role: "user", parts: [{ type: "text", text: notice }] },
      assistant([{ type: "text", text: "探索完成" }]),
    ]);
    expect(tasks.items.map((item) => item.tool_call_id)).toEqual(["call_task_1"]);
  });

  it("returns empty when the current turn has no subagents", () => {
    expect(currentTurnSubagentTasks([
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
      assistant([{ type: "text", text: "hello" }]),
    ])).toEqual({ items: [], tools: [] });
  });

  it("keeps completed current-turn rows until a follow-up is pending", () => {
    const done = subagent({
      tool_call_id: "done",
      status: "completed",
      params: { type: "subagent", description: "Inspect tests", agent_type: "explore" },
    });
    const running = subagent({
      tool_call_id: "live",
      params: { type: "subagent", description: "Still going", agent_type: "explore" },
    });
    const messages: AgentMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
      assistant([done, running]),
    ];
    expect(currentTurnSubagentTasks(messages).items.map((item) => item.tool_call_id)).toEqual([
      "done",
      "live",
    ]);
    expect(
      currentTurnSubagentTasks(messages, { followUpPending: true }).items.map(
        (item) => item.tool_call_id,
      ),
    ).toEqual(["live"]);
  });

  it("hides the dock when a follow-up is pending and every subagent has finished", () => {
    const done = subagent({
      tool_call_id: "done",
      status: "completed",
      params: { type: "subagent", description: "Inspect tests", agent_type: "explore" },
    });
    const failed = subagent({
      tool_call_id: "fail",
      status: "failed",
      params: { type: "subagent", description: "Broke", agent_type: "explore" },
    });
    expect(
      currentTurnSubagentTasks(
        [
          { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
          assistant([done, failed]),
        ],
        { followUpPending: true },
      ),
    ).toEqual({ items: [], tools: [] });
  });
});

describe("inlineSubagentTasksByMessageId", () => {
  it("keeps previous-turn cards in live mode and inlines every turn in transcript mode", () => {
    const previous = subagent({
      tool_call_id: "old",
      status: "completed",
      params: { type: "subagent", description: "First", agent_type: "explore" },
    });
    const current = subagent({
      tool_call_id: "new",
      params: { type: "subagent", description: "Now", agent_type: "explore" },
    });
    const messages: AgentMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "first" }] },
      assistant([previous], { id: "a-old" }),
      { id: "u2", role: "user", parts: [{ type: "text", text: "next" }] },
      assistant([current], { id: "a-new" }),
    ];
    const live = inlineSubagentTasksByMessageId(messages, { mode: "live" });
    expect([...live.keys()]).toEqual(["a-old"]);
    expect(live.get("a-old")?.map((part) => part.tool_call_id)).toEqual(["old"]);
    const transcript = inlineSubagentTasksByMessageId(messages, { mode: "transcript" });
    expect([...transcript.keys()]).toEqual(["a-old", "a-new"]);
    expect(transcript.get("a-new")?.map((part) => part.tool_call_id)).toEqual(["new"]);
  });

  it("does not put nested or grok chrome subagents on the host message card", () => {
    const parent = subagent({ tool_call_id: "parent" });
    const nested = subagent({
      tool_call_id: "child-sub",
      parent_tool_call_id: "parent",
      params: { type: "subagent", description: "Nested", agent_type: "explore" },
    });
    const grok = subagent({
      tool_call_id: "sa-plan",
      params: { type: "subagent", description: "goal plan writer", agent_type: "general-purpose" },
    });
    const messages: AgentMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
      assistant([parent, nested, grok], { id: "a1" }),
    ];
    const live = inlineSubagentTasksByMessageId(messages, {
      mode: "live",
      excludeIds: ["sa-plan"],
    });
    expect(live.size).toBe(0);
    const transcript = inlineSubagentTasksByMessageId(messages, {
      mode: "transcript",
      excludeIds: ["sa-plan"],
    });
    expect(transcript.get("a1")?.map((part) => part.tool_call_id)).toEqual(["parent"]);
  });
});

describe("messagesForSubagent", () => {
  const childRead: AgentToolCallPart = {
    type: "tool_call",
    tool_call_id: "child-read",
    name: "Read",
    kind: "read",
    status: "running",
    parent_tool_call_id: "parent",
    params: { type: "read", path: "a.ts" },
  };

  it("projects descendants without the parent row and ignores later turns", () => {
    const parent = subagent({ tool_call_id: "parent" });
    const nested = subagent({
      tool_call_id: "child-sub",
      parent_tool_call_id: "parent",
      params: { type: "subagent", description: "Nested explore", agent_type: "explore" },
    });
    const later = subagent({
      tool_call_id: "later",
      params: { type: "subagent", description: "Later", agent_type: "explore" },
    });
    const projected = messagesForSubagent(
      [
        { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
        assistant([parent, childRead, nested]),
        { id: "u2", role: "user", parts: [{ type: "text", text: "next" }] },
        assistant([later]),
      ],
      "parent",
    );

    expect(projected).not.toBeNull();
    expect(projected![0]).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "Inspect the relevant test coverage" }],
    });
    expect(projected![1]?.role).toBe("assistant");
    expect(projected![1]?.streaming).toBe(true);
    expect(projected![1]?.completed_at).toBeUndefined();
    const ids = projected![1]!.parts
      .filter((part): part is AgentToolCallPart => part.type === "tool_call")
      .map((part) => part.tool_call_id);
    expect(ids).toEqual(["child-read", "child-sub"]);
  });

  it("stamps host timestamps and nested thinking onto the overlay turn", () => {
    const parent = subagent({
      tool_call_id: "parent",
      status: "completed",
      result: { type: "text", text: "mapped the repo" },
    });
    const projected = messagesForSubagent(
      [
        {
          id: "u1",
          role: "user",
          created_at: "2026-09-15T15:05:58.000Z",
          parts: [{ type: "text", text: "go" }],
        },
        assistant(
          [
            parent,
            { type: "thinking", text: "hmm", duration_ms: 4000, parent_tool_call_id: "parent" },
            { type: "text", text: "nested hello", parent_tool_call_id: "parent" },
          ],
          {
            created_at: "2026-09-15T15:06:03.000Z",
            completed_at: "2026-09-15T15:08:53.000Z",
            worked_ms: 170_000,
          },
        ),
      ],
      "parent",
    );
    expect(projected![0]?.created_at).toBe("2026-09-15T15:05:58.000Z");
    expect(projected![1]).toMatchObject({
      created_at: "2026-09-15T15:06:03.000Z",
      thinking_ms: 4000,
      worked_ms: 175_000,
      completed_at: "2026-09-15T15:08:53.000Z",
      streaming: false,
    });
  });

  it("still projects a historical subagent after a later user turn", () => {
    const previous = subagent({
      tool_call_id: "old",
      status: "completed",
      result: { type: "text", text: "mapped the repo" },
    });
    const current = subagent({
      tool_call_id: "new",
      params: { type: "subagent", description: "Now", agent_type: "explore" },
    });
    const projected = messagesForSubagent(
      [
        { id: "u1", role: "user", parts: [{ type: "text", text: "first" }] },
        assistant([previous]),
        { id: "u2", role: "user", parts: [{ type: "text", text: "next" }] },
        assistant([current]),
      ],
      "old",
    );

    expect(projected).not.toBeNull();
    expect(projected![1]?.streaming).toBe(false);
    expect(projected![1]?.completed_at).toBeTruthy();
    expect(projected![1]?.parts).toContainEqual({ type: "text", text: "mapped the repo" });
  });

  it("projects nested text and thinking and strips the selected parent tag", () => {
    const parent = subagent({ tool_call_id: "parent" });
    const projected = messagesForSubagent(
      [
        { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
        assistant([
          parent,
          childRead,
          { type: "thinking", text: "hmm", parent_tool_call_id: "parent" },
          { type: "text", text: "nested hello", parent_tool_call_id: "parent" },
          { type: "text", text: "parent reply" },
        ]),
      ],
      "parent",
    );

    expect(projected![1]?.parts).toEqual([
      expect.objectContaining({ type: "tool_call", tool_call_id: "child-read" }),
      { type: "thinking", text: "hmm" },
      { type: "text", text: "nested hello" },
    ]);
    expect(
      projected![1]?.parts.every((part) =>
        !("parent_tool_call_id" in part) || !part.parent_tool_call_id,
      ),
    ).toBe(true);
  });

  it("does not project Claude async-launch dispatch ack as the child answer", () => {
    const ack = "Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.) agentId: a827867c2504be0f1 The agent is working in the background.";
    expect(isSubagentDispatchAckText(ack)).toBe(true);
    const parent = subagent({
      tool_call_id: "parent",
      status: "completed",
      result: { type: "text", text: ack },
    });
    expect(subagentResultText(parent)).toBeNull();
    const projected = messagesForSubagent(
      [
        { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
        assistant([
          parent,
          { type: "text", text: ack, parent_tool_call_id: "parent" },
          { type: "text", text: "mapped the repo", parent_tool_call_id: "parent" },
        ]),
      ],
      "parent",
    );
    expect(projected![1]?.parts).toEqual([
      { type: "text", text: "mapped the repo" },
    ]);
  });

  it("uses the stored prompt as the overlay user message", () => {
    const parent = subagent({
      tool_call_id: "parent",
      status: "completed",
      params: {
        type: "subagent",
        description: "Inspect tests",
        agent_type: "explore",
        prompt: "Read the test files and report coverage gaps.",
      },
    });
    const projected = messagesForSubagent(
      [
        { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
        assistant([parent]),
      ],
      "parent",
    );
    expect(projected![0]?.parts).toEqual([
      { type: "text", text: "Read the test files and report coverage gaps." },
    ]);
    expect(projected![1]?.completed_at).toBeTruthy();
  });

  it("returns null when the tool call is missing", () => {
    expect(messagesForSubagent([], "missing")).toBeNull();
  });

  it("does not project wait/poll descendants into the overlay transcript", () => {
    const parent = subagent({ tool_call_id: "parent" });
    const waitPoll: AgentToolCallPart = {
      type: "tool_call",
      tool_call_id: "wait",
      name: "TaskOutput",
      title: "get_command_or_subagent_output",
      kind: "other",
      status: "running",
      parent_tool_call_id: "parent",
      params: { type: "other", value: { task_id: "parent" } },
    };
    const projected = messagesForSubagent(
      [
        { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
        assistant([parent, childRead, waitPoll]),
      ],
      "parent",
    );
    const ids = projected![1]!.parts
      .filter((part): part is AgentToolCallPart => part.type === "tool_call")
      .map((part) => part.tool_call_id);
    expect(ids).toEqual(["child-read"]);
    expect(JSON.stringify(projected)).not.toContain("TaskOutput");
    expect(JSON.stringify(projected)).not.toContain("get_command_or_subagent_output");
  });
});

describe("subagentChildActivity", () => {
  it("is generating when the parent is running with no child tools", () => {
    const activity = subagentChildActivity(
      [
        { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
        assistant([subagent({ tool_call_id: "parent" })]),
      ],
      "parent",
    );
    expect(activity).toMatchObject({ busy: true, label: "Generating" });
  });

  it("uses the child tool line while a descendant is running", () => {
    const activity = subagentChildActivity(
      [
        { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
        assistant([
          subagent({ tool_call_id: "parent" }),
          {
            type: "tool_call",
            tool_call_id: "child-read",
            name: "Read",
            kind: "read",
            status: "running",
            parent_tool_call_id: "parent",
            params: { type: "read", path: "a.ts" },
          },
        ]),
      ],
      "parent",
    );
    expect(activity.busy).toBe(true);
    if (activity.busy) {
      expect(activity.label).toContain("a.ts");
    }
  });

  it("uses the child Read line even when a nested wait-poll is also running", () => {
    const activity = subagentChildActivity(
      [
        { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
        assistant([
          subagent({ tool_call_id: "parent" }),
          {
            type: "tool_call",
            tool_call_id: "wait",
            name: "TaskOutput",
            title: "get_command_or_subagent_output",
            kind: "other",
            status: "running",
            parent_tool_call_id: "parent",
            params: { type: "other", value: { task_id: "parent" } },
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
        ]),
      ],
      "parent",
    );
    expect(activity.busy).toBe(true);
    if (activity.busy) {
      expect(activity.label).toContain("hello2.txt");
      expect(activity.label).not.toContain("Waiting");
    }
  });

  it("is generating when the parent is running with only a nested wait-poll", () => {
    const activity = subagentChildActivity(
      [
        { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
        assistant([
          subagent({ tool_call_id: "parent" }),
          {
            type: "tool_call",
            tool_call_id: "wait",
            name: "TaskOutput",
            title: "get_command_or_subagent_output",
            kind: "other",
            status: "running",
            parent_tool_call_id: "parent",
            params: { type: "other", value: { task_id: "parent" } },
          },
        ]),
      ],
      "parent",
    );
    expect(activity).toMatchObject({ busy: true, label: "Generating" });
    expect(JSON.stringify(activity)).not.toContain("Waiting");
  });

  it("is idle when the parent completed", () => {
    const activity = subagentChildActivity(
      [
        { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
        assistant([
          subagent({
            tool_call_id: "parent",
            status: "completed",
            result: { type: "text", text: "done" },
          }),
        ]),
      ],
      "parent",
    );
    expect(activity).toEqual({ busy: false });
  });

  it("is idle after the parent completed even if a Grok TaskOutput poll is still running", () => {
    const activity = subagentChildActivity(
      [
        { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
        assistant([
          subagent({
            tool_call_id: "parent",
            status: "completed",
            result: { type: "text", text: "done" },
          }),
          {
            type: "tool_call",
            tool_call_id: "wait",
            name: "Tool",
            title: "[subagent:general-purpose] Fix overlay UI layout (01a0a960)",
            kind: "other",
            status: "running",
            parent_tool_call_id: "parent",
            params: {
              type: "other",
              value: {
                task_ids: ["01a0a960-5042-7bf0-99d4-a284b33e03e3"],
                timeout_ms: 180000,
                variant: "TaskOutput",
              },
            },
          },
        ]),
      ],
      "parent",
    );
    expect(activity).toEqual({ busy: false });
  });

  it("does not project a Grok child-labeled TaskOutput poll into the overlay", () => {
    const parent = subagent({
      tool_call_id: "parent",
      status: "completed",
      result: { type: "text", text: "done" },
    });
    const poll: AgentToolCallPart = {
      type: "tool_call",
      tool_call_id: "wait",
      name: "Tool",
      title: "[subagent:general-purpose] Fix overlay UI layout (01a0a960)",
      kind: "other",
      status: "running",
      parent_tool_call_id: "parent",
      params: {
        type: "other",
        value: {
          task_ids: ["01a0a960-5042-7bf0-99d4-a284b33e03e3"],
          timeout_ms: 180000,
          variant: "TaskOutput",
        },
      },
    };
    const projected = messagesForSubagent(
      [
        { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
        assistant([parent, poll]),
      ],
      "parent",
    );
    const ids = projected![1]!.parts
      .filter((part): part is AgentToolCallPart => part.type === "tool_call")
      .map((part) => part.tool_call_id);
    expect(ids).toEqual([]);
    expect(JSON.stringify(projected)).not.toContain("TaskOutput");
    expect(JSON.stringify(projected)).not.toContain("01a0a960");
  });
});


