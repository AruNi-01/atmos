import { describe, expect, it } from "bun:test";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import {
  findRecentPlanFilePath,
  parsePlanOverviewFromMarkdown,
} from "@/features/agent/lib/plan-overview";

describe("parsePlanOverviewFromMarkdown", () => {
  it("extracts title, summary, and checklist steps", () => {
    const overview = parsePlanOverviewFromMarkdown(`# Optimize APP-068

Ship a seven-week plan across six dimensions.

## Steps
- [ ] Performance
- [ ] Architecture
- [x] Tests
`);
    expect(overview?.title).toBe("Optimize APP-068");
    expect(overview?.summary).toContain("seven-week");
    expect(overview?.steps.map((step) => step.title)).toEqual([
      "Performance",
      "Architecture",
      "Tests",
    ]);
  });

  it("omits steps when markdown has no list", () => {
    const overview = parsePlanOverviewFromMarkdown(`# Plan

Just a prose overview without todos.
`);
    expect(overview?.title).toBe("Plan");
    expect(overview?.steps).toEqual([]);
    expect(overview?.summary).toContain("prose overview");
  });
});

describe("findRecentPlanFilePath", () => {
  it("finds the latest plan.md write outside the workspace", () => {
    const path =
      "/Users/me/.grok/sessions/%2FUsers%2Fme%2Fproj/01abc/plan.md";
    const messages = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool_call",
            tool_call_id: "w1",
            name: "Write",
            kind: "edit",
            status: "completed",
            params: { type: "edit", path },
            result: { type: "diff_stats", path, additions: 10, deletions: 0 },
          },
        ],
      },
    ] as AgentMessage[];
    expect(findRecentPlanFilePath(messages)).toBe(path);
  });
});
