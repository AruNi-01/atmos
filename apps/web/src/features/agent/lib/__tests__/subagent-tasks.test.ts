import { describe, expect, it } from "bun:test";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import {
  currentTurnSubagentTasks,
  displaySubagentType,
  formatSubagentTaskLine,
  messagesForSubagent,
  subagentChildActivity,
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
});
