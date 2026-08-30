import { describe, expect, test } from "bun:test";
import {
  collectIdleSessionIdsForPane,
  collectSessionIdsForPane,
  findSessionForPaneId,
  resolveAgentStateForChatId,
  resolveAgentStateForPaneId,
  type IdleDismissableSession,
} from "./agent-status-idle";

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

describe("collectSessionIdsForPane", () => {
  test("removes running and uuid-keyed sessions when a pane is destroyed", () => {
    const sessions = new Map<string, IdleDismissableSession>([
      ["ws-1:main", { session_id: "ws-1:main", state: "running", pane_id: "ws-1:main" }],
      [
        "agent-uuid",
        idleSession({
          session_id: "agent-uuid",
          pane_id: "ws-1:main",
        }),
      ],
      [
        "side-chat-1",
        {
          session_id: "side-chat-1",
          state: "running",
          pane_id: "side-chat-1",
          source_pane_id: "ws-1:main",
        },
      ],
      ["ws-1:other", { session_id: "ws-1:other", state: "running", pane_id: "ws-1:other" }],
    ]);

    expect(collectSessionIdsForPane(sessions, "ws-1:main").sort()).toEqual([
      "agent-uuid",
      "side-chat-1",
      "ws-1:main",
    ]);
    expect(
      collectSessionIdsForPane(sessions, "ws-1:main", { includeSource: false }).sort(),
    ).toEqual(["agent-uuid", "ws-1:main"]);
  });
});

describe("findSessionForPaneId", () => {
  test("finds a uuid-keyed session by pane_id", () => {
    const sessions = new Map([
      [
        "agent-uuid",
        {
          session_id: "agent-uuid",
          state: "running",
          pane_id: "ws-1:main",
        },
      ],
    ]);
    expect(findSessionForPaneId(sessions, "ws-1:main")?.session_id).toBe("agent-uuid");
  });
});

describe("resolveAgentStateForPaneId", () => {
  test("resolves running state by map key / session_id", () => {
    const sessions = new Map([
      [
        "ws-1:main",
        { session_id: "ws-1:main", state: "running", pane_id: "ws-1:main" },
      ],
    ]);
    expect(resolveAgentStateForPaneId(sessions, "ws-1:main")).toBe("running");
  });

  test("resolves permission by pane_id when map key is agent uuid", () => {
    const sessions = new Map([
      [
        "agent-uuid",
        {
          session_id: "agent-uuid",
          state: "permission_request",
          pane_id: "ws-1:main",
        },
      ],
    ]);
    expect(resolveAgentStateForPaneId(sessions, "ws-1:main")).toBe(
      "permission_request",
    );
  });

  test("does not attribute side-chat running state to the source pane", () => {
    const sessions = new Map([
      [
        "side-chat-1",
        {
          session_id: "side-chat-1",
          state: "running",
          pane_id: "side-chat-1",
          source_pane_id: "ws-1:main",
        },
      ],
    ]);
    expect(resolveAgentStateForPaneId(sessions, "ws-1:main")).toBe("idle");
  });
});

describe("resolveAgentStateForChatId", () => {
  test("matches chat: session ids and surface_id", () => {
    const sessions = new Map([
      [
        "chat:chat-1",
        {
          session_id: "chat:chat-1",
          state: "running",
          surface: "chat" as const,
          surface_id: "chat-1",
        },
      ],
    ]);
    expect(resolveAgentStateForChatId(sessions, "chat-1")).toBe("running");
    expect(resolveAgentStateForChatId(sessions, "other")).toBe("idle");
  });
});
