import { describe, expect, it } from "bun:test";
import type { AgentStatusRecord } from "@/features/agent/store/agent-status-store";
import {
  contextOccupancyFingerprint,
  sessionsOccupancyFingerprint,
} from "../agent-status-fingerprint";

function session(
  overrides: Partial<AgentStatusRecord> & Pick<AgentStatusRecord, "session_id" | "state">,
): AgentStatusRecord {
  return {
    tool: "claude-code",
    timestamp: "2026-09-20T00:00:00.000Z",
    context_id: "ws-a",
    pane_id: overrides.session_id,
    ...overrides,
  };
}

describe("agent status occupancy fingerprints", () => {
  it("ignores unrelated session churn for a context occupancy map", () => {
    const first = new Map<string, AgentStatusRecord>([
      ["a", session({ session_id: "a", state: "running", context_id: "ws-a" })],
      ["b", session({ session_id: "b", state: "idle", context_id: "ws-b" })],
    ]);
    const second = new Map(first);
    second.set(
      "c",
      session({ session_id: "c", state: "idle", context_id: "ws-b" }),
    );
    expect(contextOccupancyFingerprint(first, ["ws-a"])).toBe(
      contextOccupancyFingerprint(second, ["ws-a"]),
    );
    expect(sessionsOccupancyFingerprint(first)).not.toBe(
      sessionsOccupancyFingerprint(second),
    );
  });

  it("changes when a watched context starts running", () => {
    const idle = new Map<string, AgentStatusRecord>([
      ["a", session({ session_id: "a", state: "idle", context_id: "ws-a" })],
    ]);
    const running = new Map<string, AgentStatusRecord>([
      ["a", session({ session_id: "a", state: "running", context_id: "ws-a" })],
    ]);
    expect(contextOccupancyFingerprint(idle, ["ws-a"])).not.toBe(
      contextOccupancyFingerprint(running, ["ws-a"]),
    );
  });
});
