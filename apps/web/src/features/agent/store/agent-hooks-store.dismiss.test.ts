import { describe, expect, test } from "bun:test";
import {
  collectIdleSessionIdsForPane,
  type IdleDismissableSession,
} from "./agent-hooks-idle";

function idleSession(
  overrides: Partial<IdleDismissableSession> & Pick<IdleDismissableSession, "session_id">,
): IdleDismissableSession {
  return {
    state: "idle",
    pane_id: "ws-1:main",
    ...overrides,
  };
}

describe("collectIdleSessionIdsForPane", () => {
  test("returns only idle sessions matching the focused pane", () => {
    const sessions = new Map<string, IdleDismissableSession>([
      ["ws-1:main", idleSession({ session_id: "ws-1:main", pane_id: "ws-1:main" })],
      [
        "agent-uuid",
        idleSession({
          session_id: "agent-uuid",
          pane_id: "ws-1:main",
        }),
      ],
      ["ws-1:other", idleSession({ session_id: "ws-1:other", pane_id: "ws-1:other" })],
      [
        "ws-1:running",
        {
          session_id: "ws-1:running",
          state: "running",
          pane_id: "ws-1:running",
        },
      ],
    ]);

    expect(collectIdleSessionIdsForPane(sessions, "ws-1:main").sort()).toEqual([
      "agent-uuid",
      "ws-1:main",
    ]);
  });

  test("returns empty for blank pane id", () => {
    const sessions = new Map([
      ["ws-1:main", idleSession({ session_id: "ws-1:main" })],
    ]);
    expect(collectIdleSessionIdsForPane(sessions, "  ")).toEqual([]);
  });
});
