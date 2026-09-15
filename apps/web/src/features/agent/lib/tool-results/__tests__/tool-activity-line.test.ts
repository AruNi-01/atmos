import { describe, expect, it } from "bun:test";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { defaultToolParams } from "@/features/agent/lib/agent-tool-kind";
import { formatAgentToolActivityLine } from "@/features/agent/lib/tool-results/tool-activity-line";

function tool(
  overrides: Partial<AgentToolCallPart> & Pick<AgentToolCallPart, "tool_call_id" | "kind">,
): AgentToolCallPart {
  return {
    type: "tool_call",
    name: overrides.name ?? overrides.kind,
    status: "running",
    params: defaultToolParams(overrides.kind),
    ...overrides,
  };
}

describe("formatAgentToolActivityLine", () => {
  it("keeps a descriptive execute title", () => {
    expect(formatAgentToolActivityLine(tool({
      tool_call_id: "t1",
      kind: "execute",
      title: "Running Last-good catalog test by filter",
      params: { type: "execute", command: "bun test catalog", background: false },
    }), "Execute")).toBe("Running Last-good catalog test by filter");
  });

  it("appends the file name for reads and edits", () => {
    expect(formatAgentToolActivityLine(tool({
      tool_call_id: "t2",
      kind: "read",
      params: { type: "read", path: "apps/web/src/math.ts" },
    }), "Read")).toBe("Read math.ts");
  });

  it("includes diff stats for edits", () => {
    expect(formatAgentToolActivityLine(tool({
      tool_call_id: "t3",
      kind: "edit",
      params: { type: "edit", path: "README.md" },
      result: { type: "diff_stats", path: "README.md", additions: 5, deletions: 1 },
    }), "Edit")).toBe("Edit README.md +5 -1");
  });

  it("appends search query and execute command when the title is generic", () => {
    expect(formatAgentToolActivityLine(tool({
      tool_call_id: "t4",
      kind: "search",
      params: { type: "search", query: "RangeSlider" },
    }), "Search")).toBe("Search RangeSlider");
    expect(formatAgentToolActivityLine(tool({
      tool_call_id: "t5",
      kind: "execute",
      title: "Execute",
      params: { type: "execute", command: "npm test", background: false },
    }), "Execute")).toBe("Execute npm test");
  });
});
