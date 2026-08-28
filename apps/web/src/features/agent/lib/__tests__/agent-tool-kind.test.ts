import { describe, expect, it } from "bun:test";
import { planFromToolInput, classifyTool, thinkingText } from "@/features/agent/lib/agent-tool-kind";

describe("classifyTool", () => {
  it("maps provider names onto closed kinds", () => {
    expect(classifyTool("Read")).toEqual({ type: "tool", kind: "read" });
    expect(classifyTool("Bash")).toEqual({ type: "tool", kind: "execute" });
    expect(classifyTool("think")).toEqual({ type: "thinking" });
    expect(classifyTool("TodoWrite")).toEqual({ type: "plan" });
    expect(classifyTool("SwitchMode")).toEqual({ type: "hide" });
    expect(classifyTool("Task", null, { subagent_type: "explore" })).toEqual({
      type: "tool",
      kind: "subagent",
    });
  });

  it("reads thinking text and todo plans from tool payloads", () => {
    expect(thinkingText({ title: "hmm" })).toBe("hmm");
    expect(planFromToolInput({ todos: [{ content: "Inspect", status: "pending" }] })).toEqual({
      entries: [{ content: "Inspect", priority: "medium", status: "pending" }],
    });
  });
});
