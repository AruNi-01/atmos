import { describe, expect, it } from "bun:test";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import {
  currentTurnSubagentTasks,
  displaySubagentType,
  formatSubagentTaskLine,
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
    expect(formatSubagentTaskLine(part)).toBe("# Explore: Inspect the relevant test coverage");
    expect(subagentTaskStatus(part)).toBe("running");
  });

  it("falls back to title when description is missing", () => {
    const part = subagent({
      tool_call_id: "s2",
      title: "Map the repo",
      params: { type: "subagent", description: "", agent_type: "explore" },
    });
    expect(formatSubagentTaskLine(part)).toBe("# Explore: Map the repo");
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
    expect(formatSubagentTaskLine(tasks.items[1]!)).toBe("# General Purpose: Write the summary");
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
});
