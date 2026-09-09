import { describe, expect, it } from "bun:test";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { defaultToolParams } from "@/features/agent/lib/agent-tool-kind";
import {
  countToolGroupOverview,
  formatToolGroupOverview,
  isDetailExpandedTool,
  segmentAssistantParts,
  sentenceCaseOverview,
  splitSegmentedAssistantParts,
} from "@/features/agent/lib/tool-group";

function tool(
  overrides: Partial<AgentToolCallPart> & Pick<AgentToolCallPart, "tool_call_id" | "kind">,
): AgentToolCallPart {
  return {
    type: "tool_call",
    name: overrides.name ?? overrides.kind,
    status: "completed",
    params: defaultToolParams(overrides.kind),
    ...overrides,
  };
}

describe("segmentAssistantParts", () => {
  it("leaves a single tool ungrouped", () => {
    const parts: AgentPart[] = [tool({ tool_call_id: "t1", kind: "read" })];
    expect(segmentAssistantParts(parts, "standard")).toEqual([
      { type: "part", part: parts[0], origIndex: 0 },
    ]);
  });

  it("leaves consecutive tools as individual rows", () => {
    const parts: AgentPart[] = [
      tool({ tool_call_id: "t1", kind: "read" }),
      tool({ tool_call_id: "t2", kind: "search" }),
      tool({ tool_call_id: "t3", kind: "fetch" }),
    ];
    const segments = segmentAssistantParts(parts, "standard");
    expect(segments.map((segment) => segment.type)).toEqual(["part", "part", "part"]);
  });

  it("keeps thinking, tools, and text as separate rows", () => {
    const parts: AgentPart[] = [
      tool({ tool_call_id: "t1", kind: "read" }),
      tool({ tool_call_id: "t2", kind: "search" }),
      { type: "text", text: "found it" },
      tool({ tool_call_id: "t3", kind: "edit" }),
      tool({ tool_call_id: "t4", kind: "edit" }),
    ];
    const segments = segmentAssistantParts(parts, "standard");
    expect(segments.map((segment) =>
      segment.type === "part" ? segment.part.type : segment.type,
    )).toEqual(["tool_call", "tool_call", "text", "tool_call", "tool_call"]);
  });

  it("keeps session lifecycle as its own process row next to thought", () => {
    const parts: AgentPart[] = [
      { type: "session_lifecycle", action: "create", status: "completed", duration_ms: 1200 },
      { type: "thinking", text: "hmm" },
      tool({ tool_call_id: "t1", kind: "read" }),
    ];
    const segments = segmentAssistantParts(parts, "standard");
    expect(segments.map((segment) =>
      segment.type === "part" ? segment.part.type : segment.type,
    )).toEqual(["session_lifecycle", "thinking", "tool_call"]);
  });

  it("keeps session config change as its own process row", () => {
    const parts: AgentPart[] = [
      { type: "session_config_change", model: { to: "grok-4" }, mode: { to: "plan" } },
      { type: "thinking", text: "hmm" },
      tool({ tool_call_id: "t1", kind: "read" }),
    ];
    const segments = segmentAssistantParts(parts, "standard");
    expect(segments.map((segment) =>
      segment.type === "part" ? segment.part.type : segment.type,
    )).toEqual(["session_config_change", "thinking", "tool_call"]);
  });

  it("keeps session hints as their own process row", () => {
    const parts: AgentPart[] = [
      { type: "session_hint", tone: "warning", kind: "model_switch_failed" },
      { type: "thinking", text: "hmm" },
      tool({ tool_call_id: "t1", kind: "read" }),
    ];
    const segments = segmentAssistantParts(parts, "standard");
    expect(segments.map((segment) =>
      segment.type === "part" ? segment.part.type : segment.type,
    )).toEqual(["session_hint", "thinking", "tool_call"]);
  });

  it("skips empty thinking and hidden plan parts without grouping neighbors", () => {
    const parts: AgentPart[] = [
      tool({ tool_call_id: "t1", kind: "read" }),
      { type: "thinking", text: "" },
      { type: "plan", plan: { entries: [] } },
      tool({ tool_call_id: "t2", kind: "fetch" }),
    ];
    const segments = segmentAssistantParts(parts, "standard");
    expect(segments.map((segment) =>
      segment.type === "part" ? segment.part.type : segment.type,
    )).toEqual(["tool_call", "tool_call"]);
  });

  it("keeps every process row after extracting answer text", () => {
    const parts: AgentPart[] = [
      { type: "thinking", text: "hmm" },
      tool({ tool_call_id: "t1", kind: "read" }),
      tool({ tool_call_id: "t2", kind: "search" }),
      { type: "text", text: "mid commentary" },
      tool({ tool_call_id: "t3", kind: "edit" }),
      tool({ tool_call_id: "t4", kind: "execute" }),
      { type: "text", text: "final" },
    ];
    const { processSegments, answerSegments } = splitSegmentedAssistantParts(
      segmentAssistantParts(parts, "standard"),
    );
    expect(processSegments.map((segment) =>
      segment.type === "part" ? segment.part.type : segment.type,
    )).toEqual([
      "thinking",
      "tool_call",
      "tool_call",
      "text",
      "tool_call",
      "tool_call",
    ]);
    expect(answerSegments).toHaveLength(1);
    expect(answerSegments[0]).toMatchObject({
      type: "part",
      part: { type: "text", text: "final" },
    });
  });

  it("compact groups every non-text process part, including singles", () => {
    const parts: AgentPart[] = [
      { type: "thinking", text: "hmm" },
      tool({ tool_call_id: "t1", kind: "read" }),
      { type: "text", text: "found it" },
      tool({ tool_call_id: "t2", kind: "edit" }),
    ];
    const segments = segmentAssistantParts(parts, "compact");
    expect(segmentAssistantParts(parts)).toEqual(segments);
    expect(segments.map((segment) => segment.type)).toEqual([
      "tool_group",
      "part",
      "tool_group",
    ]);
    expect(segments[0]).toMatchObject({
      type: "tool_group",
      origIndexes: [0, 1],
    });
    expect(segments[2]).toMatchObject({
      type: "tool_group",
      origIndexes: [3],
    });
  });

  it("compact keeps create and resume session chrome out of thinking groups", () => {
    for (const action of ["create", "resume"] as const) {
      const parts: AgentPart[] = [
        { type: "session_lifecycle", action, status: "completed", duration_ms: 3000 },
        { type: "thinking", text: "hmm" },
        tool({ tool_call_id: "t1", kind: "read" }),
      ];
      const segments = segmentAssistantParts(parts, "compact");
      expect(segments.map((segment) =>
        segment.type === "part" ? segment.part.type : segment.type,
      )).toEqual(["session_lifecycle", "tool_group"]);
      expect(segments[1]).toMatchObject({
        type: "tool_group",
        origIndexes: [1, 2],
      });
    }
  });

  it("detailed keeps every tool on its own row", () => {
    const parts: AgentPart[] = [
      { type: "thinking", text: "hmm" },
      tool({ tool_call_id: "t1", kind: "read" }),
      tool({ tool_call_id: "t2", kind: "read" }),
      tool({ tool_call_id: "t3", kind: "search" }),
      tool({ tool_call_id: "t4", kind: "edit" }),
      tool({ tool_call_id: "t5", kind: "execute" }),
      tool({ tool_call_id: "t6", kind: "fetch" }),
    ];
    expect(segmentAssistantParts(parts, "detailed").map((segment) =>
      segment.type === "part" ? segment.part.type : segment.type,
    )).toEqual([
      "thinking",
      "tool_call",
      "tool_call",
      "tool_call",
      "tool_call",
      "tool_call",
      "tool_call",
    ]);
  });
});

describe("isDetailExpandedTool", () => {
  it("treats write and command tools as the detailed auto-expand set", () => {
    expect(isDetailExpandedTool(tool({ tool_call_id: "e", kind: "edit" }))).toBe(true);
    expect(isDetailExpandedTool(tool({ tool_call_id: "d", kind: "delete" }))).toBe(true);
    expect(isDetailExpandedTool(tool({ tool_call_id: "c", kind: "execute" }))).toBe(true);
    expect(isDetailExpandedTool(tool({ tool_call_id: "r", kind: "read" }))).toBe(false);
    expect(isDetailExpandedTool(tool({ tool_call_id: "s", kind: "search" }))).toBe(false);
    expect(isDetailExpandedTool({ type: "thinking", text: "hmm" })).toBe(false);
  });
});

describe("countToolGroupOverview", () => {
  it("counts and sorts writes first, commands next, reads last", () => {
    const counts = countToolGroupOverview([
      tool({ tool_call_id: "r1", kind: "read" }),
      tool({ tool_call_id: "r2", kind: "read" }),
      tool({ tool_call_id: "s1", kind: "search" }),
      tool({ tool_call_id: "f1", kind: "fetch" }),
      tool({ tool_call_id: "f2", kind: "fetch" }),
      tool({ tool_call_id: "c1", kind: "execute" }),
      tool({ tool_call_id: "w1", kind: "edit" }),
      tool({ tool_call_id: "w2", kind: "delete" }),
      tool({ tool_call_id: "o1", kind: "other" }),
    ]);
    expect(counts).toEqual([
      { kind: "write", count: 2 },
      { kind: "command", count: 1 },
      { kind: "other", count: 1 },
      { kind: "fetch", count: 2 },
      { kind: "search", count: 1 },
      { kind: "read", count: 2 },
    ]);
  });

  it("formats overview segments in the sorted order", () => {
    const counts = countToolGroupOverview([
      tool({ tool_call_id: "r1", kind: "read" }),
      tool({ tool_call_id: "c1", kind: "execute" }),
      tool({ tool_call_id: "w1", kind: "edit" }),
    ]);
    const text = formatToolGroupOverview(
      counts,
      (kind, count) => `${count} ${kind}`,
      ", ",
    );
    expect(text).toBe("1 write, 1 command, 1 read");
    expect(sentenceCaseOverview("ran 1 command, 2 reads", "en")).toBe(
      "Ran 1 command, 2 reads",
    );
    expect(sentenceCaseOverview("运行了 1 条命令", "zh")).toBe("运行了 1 条命令");
  });
});
