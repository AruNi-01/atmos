import { describe, expect, it } from "bun:test";
import type { AgentToolKind } from "@atmos/api-types/ws/dto/agent-chat";
import { defaultToolParams, type AgentToolCallPart } from "./tool-kind";
import { formatAgentToolActivityLine, toolKindHeadlineLabel } from "./tool-activity-line";

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

function line(kind: AgentToolKind, part: AgentToolCallPart): string {
  return formatAgentToolActivityLine(part, toolKindHeadlineLabel(kind));
}

describe("formatAgentToolActivityLine", () => {
  it("keeps a descriptive execute title", () => {
    expect(
      line(
        "execute",
        tool({
          tool_call_id: "t1",
          kind: "execute",
          title: "Running Last-good catalog test by filter",
          params: { type: "execute", command: "bun test catalog", background: false },
        }),
      ),
    ).toBe("Running Last-good catalog test by filter");
  });

  it("appends the file name for reads and edits", () => {
    expect(
      line(
        "read",
        tool({
          tool_call_id: "t2",
          kind: "read",
          params: { type: "read", path: "apps/web/src/math.ts" },
        }),
      ),
    ).toBe("Read math.ts");
  });

  it("replaces a path-only title with the kind verb and file name", () => {
    expect(
      line(
        "read",
        tool({
          tool_call_id: "t2b",
          kind: "read",
          title: "src/theme.ts",
          params: { type: "read", path: "src/theme.ts" },
        }),
      ),
    ).toBe("Read theme.ts");
  });

  it("keeps a descriptive title and still names the file", () => {
    expect(
      line(
        "read",
        tool({
          tool_call_id: "t2c",
          kind: "read",
          title: "Read notes",
          params: { type: "read", path: "a.ts" },
        }),
      ),
    ).toBe("Read notes a.ts");
  });

  it("uses the kind verb when the title is blank", () => {
    expect(
      line(
        "read",
        tool({
          tool_call_id: "t2d",
          kind: "read",
          title: "  ",
          params: { type: "read", path: "a.ts" },
        }),
      ),
    ).toBe("Read a.ts");
  });

  it("includes diff stats for edits", () => {
    expect(
      line(
        "edit",
        tool({
          tool_call_id: "t3",
          kind: "edit",
          params: { type: "edit", path: "README.md" },
          result: { type: "diff_stats", path: "README.md", additions: 5, deletions: 1 },
        }),
      ),
    ).toBe("Edit README.md +5 -1");
  });

  it("leaves a search title alone when it already is the query", () => {
    expect(
      line(
        "search",
        tool({
          tool_call_id: "t4b",
          kind: "search",
          title: "ready",
          params: { type: "search", query: "ready" },
        }),
      ),
    ).toBe("ready");
  });

  it("appends search query and execute command when the title is generic", () => {
    expect(
      line(
        "search",
        tool({
          tool_call_id: "t4",
          kind: "search",
          params: { type: "search", query: "RangeSlider" },
        }),
      ),
    ).toBe("Search RangeSlider");
    expect(
      line(
        "execute",
        tool({
          tool_call_id: "t5",
          kind: "execute",
          title: "Execute",
          params: { type: "execute", command: "npm test", background: false },
        }),
      ),
    ).toBe("Execute npm test");
  });
});
