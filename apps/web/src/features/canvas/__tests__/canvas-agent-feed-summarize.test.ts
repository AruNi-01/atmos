// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { summarizeConsecutiveEntries } from "../lib/canvas-agent-feed-summarize";
import type { CanvasAgentFeedEntry } from "../lib/canvas-agent-feed";

function entry(
  partial: Partial<CanvasAgentFeedEntry> & Pick<CanvasAgentFeedEntry, "requestId" | "label">,
): CanvasAgentFeedEntry {
  return {
    command: "create-arrow",
    kind: "create",
    status: "done",
    startedAt: 1,
    completedAt: 2,
    ...partial,
  };
}

describe("summarizeConsecutiveEntries", () => {
  it("merges consecutive identical labels", () => {
    const rows = summarizeConsecutiveEntries([
      entry({ requestId: "a", label: "Creating arrow" }),
      entry({ requestId: "b", label: "Creating arrow" }),
      entry({ requestId: "c", label: "Creating shape" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.count).toBe(2);
    expect(rows[0]?.label).toBe("Creating arrow");
    expect(rows[1]?.label).toBe("Creating shape");
  });

  it("does not merge screenshot rows so each keeps its thumb", () => {
    const rows = summarizeConsecutiveEntries([
      entry({
        requestId: "s1",
        label: "Capturing screenshot",
        command: "screenshot",
        kind: "read",
        screenshot: { dataUrl: "data:image/jpeg;base64,a", width: 10, height: 10 },
      }),
      entry({
        requestId: "s2",
        label: "Capturing screenshot",
        command: "screenshot",
        kind: "read",
        screenshot: { dataUrl: "data:image/jpeg;base64,b", width: 10, height: 10 },
      }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.screenshot?.dataUrl).toContain("base64,a");
    expect(rows[1]?.screenshot?.dataUrl).toContain("base64,b");
  });
});
