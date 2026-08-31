import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { countFileDiffStats, countPatchStats } from "@/features/agent/lib/tool-results/diff-stats";
import { collectTurnFileChanges, selectRangesForTurnFile } from "@/features/agent/lib/tool-results/turn-file-changes";

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

describe("collectTurnFileChanges", () => {
  it("collects unique files from edits, deletes, and moves, merging repeat edits", () => {
    const patch = "--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n";
    const first = countFileDiffStats("a\nb\n", "a\nc\nd\n", "src/a.ts");
    const second = countPatchStats(patch);
    const parts = [
      tool({
        tool_call_id: "e1",
        kind: "edit",
        name: "Edit",
        content: [{
          type: "diff",
          path: "src/a.ts",
          old_content: "a\nb\n",
          new_content: "a\nc\nd\n",
        }],
      }),
      tool({
        tool_call_id: "e2",
        kind: "edit",
        name: "Edit",
        output: patch,
      }),
      tool({
        tool_call_id: "e3",
        kind: "edit",
        name: "Edit",
        content: [{
          type: "diff",
          path: "src/a.ts",
          old_content: "a\nc\nd\n",
          new_content: "a\nc\nd\ne\n",
        }],
      }),
      tool({
        tool_call_id: "d1",
        kind: "delete",
        name: "Delete",
        input: { path: "src/gone.ts" },
      }),
      tool({
        tool_call_id: "m1",
        kind: "move",
        name: "Move",
        input: { from: "src/old.ts", to: "src/new.ts" },
      }),
      tool({ tool_call_id: "r1", kind: "read", name: "Read", input: { path: "README.md" } }),
    ] satisfies AgentPart[];
    const changes = collectTurnFileChanges(parts);

    const extra = countFileDiffStats("a\nc\nd\n", "a\nc\nd\ne\n", "src/a.ts");
    expect(changes.map((item) => item.path)).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/gone.ts",
      "src/new.ts",
    ]);
    expect(changes[0]?.path).toBe("src/a.ts");
    expect(changes[0]?.additions).toBe(first.additions + extra.additions);
    expect(changes[0]?.deletions).toBe(first.deletions + extra.deletions);
    expect(changes[0]?.selectRanges.length).toBeGreaterThan(0);
    expect(collectTurnFileChanges(parts, { includeRanges: false })[0]?.selectRanges).toEqual([]);
    expect(selectRangesForTurnFile(parts, "src/a.ts").length).toBeGreaterThan(0);
    expect(changes[1]).toMatchObject({
      path: "src/b.ts",
      additions: second.additions,
      deletions: second.deletions,
    });
    expect(changes[1]?.selectRanges).toEqual([{ startLine: 1, endLine: 1 }]);
    expect(changes[2]).toEqual({
      path: "src/gone.ts",
      additions: 0,
      deletions: 0,
      selectRanges: [],
    });
    expect(changes[3]).toEqual({
      path: "src/new.ts",
      additions: 0,
      deletions: 0,
      selectRanges: [],
    });
  });

  it("returns nothing when the turn did not change files", () => {
    expect(collectTurnFileChanges([
      { type: "thinking", text: "hmm" },
      tool({ tool_call_id: "r1", kind: "read" }),
    ])).toEqual([]);
  });
});

describe("assistant turn file changes wiring", () => {
  it("renders the settled file list at the bottom of assistant messages", () => {
    const messageView = readFileSync(
      join(import.meta.dir, "../../../components/AgentChatMessageView.tsx"),
      "utf8",
    );
    const card = readFileSync(
      join(import.meta.dir, "../../../components/AssistantTurnFileChanges.tsx"),
      "utf8",
    );
    expect(messageView).toContain("AssistantTurnFileChanges");
    expect(messageView).toContain("visible={!message.streaming}");
    const filesAt = messageView.indexOf("<AssistantTurnFileChanges");
    expect(filesAt).toBeGreaterThan(-1);
    expect(messageView).not.toContain("line-clamp-6");
    expect(card).toContain("AgentToolFileGlyph");
    expect(card).toContain("AgentToolFileChangeStats");
    expect(card).toContain("displayAgentChatFilePath");
    expect(card).toContain("TooltipContent");
    expect(card).toContain("font-mono text-xs");
    expect(card).toContain("openWorkspacePath");
    expect(card).toContain("selectRangesForTurnFile");
    expect(card).toContain("includeRanges: false");
    expect(card).toContain("isDir: false");
    expect(card).toContain("PREVIEW_COUNT = 3");
    expect(card).toContain("max-h-44");
    expect(card).toContain("bg-muted/40");
    expect(card).toContain("w-full");
    expect(card).not.toContain("-mx-");
  });
});
