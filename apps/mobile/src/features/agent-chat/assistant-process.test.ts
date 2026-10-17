// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  countToolGroupOverview,
  formatToolGroupOverview,
  hasCollapsibleAssistantProcess,
  segmentAssistantParts,
  sentenceCaseOverview,
  splitAssistantProcessParts,
  splitSegmentedAssistantParts,
  toolCallPartsFromGroup,
} from "@atmos/agent-transcript";
import { toolGroupCountLabel, toolGroupLabels } from "./copy";

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

function assistant(parts: AgentPart[], extra: Partial<AgentMessage> = {}): AgentMessage {
  return { id: "m1", role: "assistant", parts, ...extra };
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
    expect(
      processParts.map((item) => (item.part.type === "text" ? "looking" : item.part.type)),
    ).toEqual(["looking", "tool_call"]);
    expect(tailParts.map((item) => item.part)).toEqual([{ type: "text", text: "final" }]);
  });

  test("a settled turn with tools can collapse, a running tool cannot", () => {
    const parts: AgentPart[] = [tool("t1", "read"), { type: "text", text: "ok" }];
    expect(
      hasCollapsibleAssistantProcess(
        assistant(parts, { streaming: false, completed_at: "2026-09-25T00:00:00Z" }),
      ),
    ).toBe(true);
    expect(
      hasCollapsibleAssistantProcess(assistant(parts, { streaming: true, completed_at: null })),
    ).toBe(false);
    const runningTool = tool("t1", "read");
    const running: AgentPart[] =
      runningTool.type === "tool_call"
        ? [
            { ...runningTool, status: "running" },
            { type: "text", text: "ok" },
          ]
        : [];
    expect(
      hasCollapsibleAssistantProcess(
        assistant(running, { streaming: false, completed_at: "2026-09-25T00:00:00Z" }),
      ),
    ).toBe(false);
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
      const overview = sentenceCaseOverview(
        formatToolGroupOverview(
          countToolGroupOverview(toolCallPartsFromGroup(segments[0].parts)),
          toolGroupCountLabel,
          toolGroupLabels.join,
        ),
        toolGroupLabels.locale,
      );
      expect(overview).toBe("1 write, 2 reads");
    }
    const { processSegments, tailSegments } = splitSegmentedAssistantParts(segments);
    expect(processSegments).toHaveLength(1);
    expect(
      tailSegments.map((item) =>
        item.type === "part" && item.part.type === "text" ? item.part.text : item.type,
      ),
    ).toEqual(["done"]);
  });

  test("the last reply stays visible when the turn ends on a tool", () => {
    const parts: AgentPart[] = [{ type: "text", text: "the numbers" }, tool("t1", "read")];
    const { processSegments, tailSegments } = splitSegmentedAssistantParts(
      segmentAssistantParts(parts),
    );
    expect(processSegments.map((item) => item.type)).toEqual(["part"]);
    expect(
      tailSegments.map((item) =>
        item.type === "part" && item.part.type === "text" ? item.part.text : item.type,
      ),
    ).toEqual(["the numbers"]);
  });
});
