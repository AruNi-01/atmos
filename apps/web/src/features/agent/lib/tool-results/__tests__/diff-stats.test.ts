import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { defaultToolParams } from "@/features/agent/lib/agent-tool-kind";
import {
  changedLineRangesFromContents,
  changedLineRangesFromPatch,
  countPatchStats,
  mergeDiffLineRanges,
  sumToolGroupDiffStats,
} from "@/features/agent/lib/tool-results/diff-stats";

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

describe("changedLineRanges", () => {
  it("selects added lines in the new file, skipping context", () => {
    expect(changedLineRangesFromContents(
      "a\nb\nc\nd\ne\n",
      "a\nX\nY\nc\nZ\ne\n",
      "a.ts",
    )).toEqual([
      { startLine: 2, endLine: 3 },
      { startLine: 5, endLine: 5 },
    ]);
  });

  it("selects the whole new file when the old side is empty", () => {
    expect(changedLineRangesFromContents("", "one\ntwo\n", "n.ts")).toEqual([
      { startLine: 1, endLine: 2 },
    ]);
  });

  it("parses added lines from a unified patch", () => {
    const patch = [
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,5 +1,6 @@",
      " a",
      "-b",
      "+X",
      "+Y",
      " c",
      "-d",
      "+Z",
      " e",
    ].join("\n");
    expect(changedLineRangesFromPatch(patch)).toEqual([
      { startLine: 2, endLine: 3 },
      { startLine: 5, endLine: 5 },
    ]);
  });

  it("merges overlapping or adjacent ranges", () => {
    expect(mergeDiffLineRanges([
      { startLine: 4, endLine: 5 },
      { startLine: 1, endLine: 2 },
      { startLine: 3, endLine: 3 },
    ])).toEqual([{ startLine: 1, endLine: 5 }]);
  });
});

describe("countPatchStats", () => {
  it("counts added and removed lines and ignores headers", () => {
    const patch = [
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,2 +1,3 @@",
      "-old",
      "-gone",
      "+new",
      "+also",
      "+more",
      " context",
    ].join("\n");
    expect(countPatchStats(patch)).toEqual({ additions: 3, deletions: 2 });
  });
});

describe("sumToolGroupDiffStats", () => {
  it("sums +/− across edit tools and ignores reads", () => {
    const firstPatch = "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,3 @@\n a\n-b\n+c\n+d\n";
    const secondPatch = "--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n";
    const stats = sumToolGroupDiffStats([
      tool({
        tool_call_id: "e1",
        kind: "edit",
        name: "Edit",
        params: { type: "edit", path: "src/a.ts" },
        result: { type: "text", text: firstPatch },
      }),
      tool({
        tool_call_id: "e2",
        kind: "edit",
        name: "Edit",
        params: { type: "edit", path: "src/b.ts" },
        result: { type: "text", text: secondPatch },
      }),
      tool({ tool_call_id: "r1", kind: "read", name: "Read" }),
    ]);
    const first = countPatchStats(firstPatch);
    const second = countPatchStats(secondPatch);
    expect(stats).toEqual({
      additions: first.additions + second.additions,
      deletions: first.deletions + second.deletions,
    });
  });

  it("returns zeros when the group has no edits", () => {
    expect(sumToolGroupDiffStats([
      tool({ tool_call_id: "r1", kind: "read" }),
      tool({ tool_call_id: "s1", kind: "search" }),
    ])).toEqual({ additions: 0, deletions: 0 });
  });
});

describe("tool group diff stats wiring", () => {
  it("renders aggregated edit stats on the collapsed group label", () => {
    const group = readFileSync(
      join(import.meta.dir, "../../../components/AgentToolGroupView.tsx"),
      "utf8",
    );
    expect(group).toContain("sumToolGroupDiffStats");
    expect(group).toContain("AgentToolDiffStats");
  });
});
