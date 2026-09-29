// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  shouldCollapseAssistantProcess,
  splitAssistantProcessParts,
  splitAssistantSegments,
  segmentAssistantParts,
  toolGroupOverview,
} from "./assistant-process";

function tool(id: string, kind: "read" | "edit"): AgentPart {
  return {
    type: "tool_call",
    tool_call_id: id,
    name: kind === "read" ? "Read" : "Edit",
    kind,
    status: "completed",
    params: kind === "read" ? { type: "read", path: "a.ts" } : { type: "edit", path: "a.ts" },
  };
}

describe("assistant process fold", () => {
  test("thinking before the reply stays in the process with the tools", () => {
    const parts: AgentPart[] = [
      tool("t1", "edit"),
      { type: "thinking", text: "wrap up" },
      { type: "text", text: "done" },
    ];
    const { processParts, tailParts } = splitAssistantProcessParts(parts);
    expect(processParts.map((item) => item.part.type)).toEqual(["tool_call", "thinking"]);
    expect(tailParts.map((item) => item.part)).toEqual([{ type: "text", text: "done" }]);
  });

  test("mid-turn text stays folded and only the last reply is outside", () => {
    const parts: AgentPart[] = [
      { type: "text", text: "looking" },
      tool("t1", "read"),
      { type: "text", text: "final" },
    ];
    const { processParts, tailParts } = splitAssistantProcessParts(parts);
    expect(processParts.map((item) => item.part.type === "text" ? "looking" : item.part.type)).toEqual([
      "looking",
      "tool_call",
    ]);
    expect(tailParts.map((item) => item.part)).toEqual([{ type: "text", text: "final" }]);
  });

  test("a settled turn with tools can collapse, a running tool cannot", () => {
    const parts: AgentPart[] = [tool("t1", "read"), { type: "text", text: "ok" }];
    expect(shouldCollapseAssistantProcess({ streaming: false, completed_at: "2026-09-25T00:00:00Z" }, parts)).toBe(true);
    expect(shouldCollapseAssistantProcess({ streaming: true, completed_at: null }, parts)).toBe(false);
    const runningTool = tool("t1", "read");
    const running: AgentPart[] = runningTool.type === "tool_call"
      ? [{ ...runningTool, status: "running" }, { type: "text", text: "ok" }]
      : [];
    expect(shouldCollapseAssistantProcess({ streaming: false, completed_at: "2026-09-25T00:00:00Z" }, running)).toBe(false);
  });

  test("compact groups name reads and writes the way web does", () => {
    const parts: AgentPart[] = [
      tool("a", "edit"),
      tool("b", "read"),
      tool("c", "read"),
      { type: "thinking", text: "hmm" },
      { type: "text", text: "done" },
    ];
    const segments = segmentAssistantParts(parts);
    expect(segments[0]).toMatchObject({ type: "tool_group" });
    if (segments[0]?.type === "tool_group") {
      expect(toolGroupOverview(segments[0].parts)).toBe("1 write, 2 reads");
    }
    const { process, tail } = splitAssistantSegments(segments);
    expect(process).toHaveLength(1);
    expect(tail.map((item) => item.type === "part" && item.part.type === "text" ? item.part.text : item.type)).toEqual(["done"]);
  });

  test("the last reply stays visible when the turn ends on a tool", () => {
    const parts: AgentPart[] = [
      { type: "text", text: "the numbers" },
      tool("t1", "read"),
    ];
    const { process, tail } = splitAssistantSegments(segmentAssistantParts(parts));
    expect(process.map((item) => item.type)).toEqual(["part"]);
    expect(tail.map((item) => item.type === "part" && item.part.type === "text" ? item.part.text : item.type)).toEqual(["the numbers"]);
  });
});
