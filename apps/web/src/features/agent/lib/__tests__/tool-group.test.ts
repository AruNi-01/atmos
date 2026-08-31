import { describe, expect, it } from "bun:test";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import {
  countToolGroupOverview,
  formatToolGroupOverview,
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
    ...overrides,
  };
}

describe("segmentAssistantParts", () => {
  it("leaves a single tool ungrouped", () => {
    const parts: AgentPart[] = [tool({ tool_call_id: "t1", kind: "read" })];
    expect(segmentAssistantParts(parts)).toEqual([
      { type: "part", part: parts[0], origIndex: 0 },
    ]);
  });

  it("groups consecutive tool calls", () => {
    const parts: AgentPart[] = [
      tool({ tool_call_id: "t1", kind: "read" }),
      tool({ tool_call_id: "t2", kind: "search" }),
      tool({ tool_call_id: "t3", kind: "fetch" }),
    ];
    const segments = segmentAssistantParts(parts);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      type: "tool_group",
      origIndexes: [0, 1, 2],
    });
  });

  it("splits groups when visible text appears between tools", () => {
    const parts: AgentPart[] = [
      tool({ tool_call_id: "t1", kind: "read" }),
      tool({ tool_call_id: "t2", kind: "search" }),
      { type: "text", text: "found it" },
      tool({ tool_call_id: "t3", kind: "edit" }),
      tool({ tool_call_id: "t4", kind: "edit" }),
    ];
    const segments = segmentAssistantParts(parts);
    expect(segments.map((segment) => segment.type)).toEqual([
      "tool_group",
      "part",
      "tool_group",
    ]);
  });

  it("keeps session lifecycle as its own process row next to thought", () => {
    const parts: AgentPart[] = [
      { type: "session_lifecycle", action: "create", status: "completed", duration_ms: 1200 },
      { type: "thinking", text: "hmm" },
      tool({ tool_call_id: "t1", kind: "read" }),
    ];
    const segments = segmentAssistantParts(parts);
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
    const segments = segmentAssistantParts(parts);
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
    const segments = segmentAssistantParts(parts);
    expect(segments.map((segment) =>
      segment.type === "part" ? segment.part.type : segment.type,
    )).toEqual(["session_hint", "thinking", "tool_call"]);
  });

  it("does not split a group on empty thinking or hidden plan parts", () => {
    const parts: AgentPart[] = [
      tool({ tool_call_id: "t1", kind: "read" }),
      { type: "thinking", text: "" },
      { type: "plan", plan: { entries: [] } },
      tool({ tool_call_id: "t2", kind: "fetch" }),
    ];
    const segments = segmentAssistantParts(parts);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.type).toBe("tool_group");
  });

  it("keeps two tool groups after extracting answer text", () => {
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
      segmentAssistantParts(parts),
    );
    expect(processSegments.map((segment) => segment.type)).toEqual([
      "part",
      "tool_group",
      "tool_group",
    ]);
    expect(answerSegments).toHaveLength(2);
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
