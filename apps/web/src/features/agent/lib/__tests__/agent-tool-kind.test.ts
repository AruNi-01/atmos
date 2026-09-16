import { describe, expect, it } from "bun:test";
import {
  isEmptyToolJson,
  isGenericToolLabel,
  isPlaceholderToolParams,
  isSubagentWaitTool,
} from "@/features/agent/lib/agent-tool-kind";

describe("isGenericToolLabel", () => {
  it("treats kind names as generic so path and command can win", () => {
    expect(isGenericToolLabel("Read")).toBe(true);
    expect(isGenericToolLabel("Search")).toBe(true);
    expect(isGenericToolLabel("Run Script")).toBe(true);
    expect(isGenericToolLabel("write")).toBe(true);
    expect(isGenericToolLabel("fileChange")).toBe(true);
    expect(isGenericToolLabel("commandExecution")).toBe(true);
    expect(isGenericToolLabel("command_execution")).toBe(true);
    expect(isGenericToolLabel("ReadFile")).toBe(false);
  });
});

describe("isSubagentWaitTool", () => {
  it("treats Grok's child-labeled TaskOutput poll as wait chrome", () => {
    expect(isSubagentWaitTool({
      name: "Tool",
      title: "[subagent:general-purpose] Fix overlay UI layout (01a0a960)",
      params: {
        type: "other",
        value: {
          task_ids: ["01a0a960-5042-7bf0-99d4-a284b33e03e3"],
          timeout_ms: 180000,
          variant: "TaskOutput",
        },
      },
    })).toBe(true);
    expect(isSubagentWaitTool({
      name: "get_command_or_subagent_output",
      title: "TaskOutput",
    })).toBe(true);
    expect(isSubagentWaitTool({
      name: "Read",
      title: "AgentPromptComposer.tsx",
      params: { type: "read", path: "a.ts" },
    })).toBe(false);
  });
});

describe("empty ACP other payloads", () => {
  it("treats null and {} as placeholder params, not JSON to show", () => {
    expect(isEmptyToolJson({})).toBe(true);
    expect(isEmptyToolJson(null)).toBe(true);
    expect(isPlaceholderToolParams({ type: "other", value: {} })).toBe(true);
    expect(isPlaceholderToolParams({ type: "search", query: "foo" })).toBe(false);
  });
});
