import { describe, expect, test } from "bun:test";
import type { AgentActivity } from "@atmos/api-types/ws/dto/events";
import { mergeActivityHydration } from "../agent-activity-merge";

function activity(
  sessionId: string,
  lastEventAt: string,
  extra?: Partial<AgentActivity>,
): AgentActivity {
  return {
    session_id: sessionId,
    tool: "claude-code",
    last_state: "running",
    todos: [],
    children: [],
    turns: [],
    turns_omitted: 0,
    started_at: lastEventAt,
    last_event_at: lastEventAt,
    ...extra,
  };
}

describe("mergeActivityHydration", () => {
  test("keeps live turns that arrived while the REST snapshot was in flight", () => {
    const snapshot = new Map([
      ["old", activity("old", "2026-09-21T00:00:00.000Z")],
    ]);
    const live = new Map([
      ["old", activity("old", "2026-09-21T00:00:00.000Z")],
      ["new", activity("new", "2026-09-21T00:00:05.000Z")],
    ]);

    const merged = mergeActivityHydration(snapshot, live, new Set());
    expect([...merged.keys()].sort()).toEqual(["new", "old"]);
  });

  test("does not resurrect sessions cleared while hydration was in flight", () => {
    const snapshot = new Map([
      ["gone", activity("gone", "2026-09-21T00:00:00.000Z")],
      ["keep", activity("keep", "2026-09-21T00:00:00.000Z")],
    ]);
    const live = new Map([["keep", activity("keep", "2026-09-21T00:00:01.000Z")]]);

    const merged = mergeActivityHydration(snapshot, live, new Set(["gone"]));
    expect(merged.has("gone")).toBe(false);
    expect(merged.get("keep")?.last_event_at).toBe("2026-09-21T00:00:01.000Z");
  });

  test("prefers the live record when it is newer than the snapshot", () => {
    const snapshot = new Map([
      ["s", activity("s", "2026-09-21T00:00:00.000Z", { last_file: "snap.ts" })],
    ]);
    const live = new Map([
      ["s", activity("s", "2026-09-21T00:00:02.000Z", { last_file: "live.ts" })],
    ]);

    const merged = mergeActivityHydration(snapshot, live, new Set());
    expect(merged.get("s")?.last_file).toBe("live.ts");
  });
});
