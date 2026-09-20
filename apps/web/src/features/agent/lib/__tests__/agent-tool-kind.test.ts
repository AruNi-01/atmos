import { describe, expect, it } from "bun:test";
import {
  isEmptyToolJson,
  isPlanModeChromeTool,
  isSubagentWaitTool,
} from "@/features/agent/lib/agent-tool-kind";

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
  it("treats null and {} as empty JSON", () => {
    expect(isEmptyToolJson({})).toBe(true);
    expect(isEmptyToolJson(null)).toBe(true);
    expect(isEmptyToolJson({ query: "foo" })).toBe(false);
  });
});

describe("plan mode chrome", () => {
  it("hides enter/exit plan tools but keeps update_plan / plan documents", () => {
    expect(isPlanModeChromeTool({ name: "EnterPlanMode" })).toBe(true);
    expect(isPlanModeChromeTool({ name: "ExitPlanMode" })).toBe(true);
    expect(isPlanModeChromeTool({ name: "Tool", title: "Exit plan mode" })).toBe(true);
    expect(isPlanModeChromeTool({ name: "update_plan" })).toBe(false);
    expect(isPlanModeChromeTool({ name: "updatePlan" })).toBe(false);
  });
});
