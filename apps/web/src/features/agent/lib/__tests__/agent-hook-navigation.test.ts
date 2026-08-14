// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import type { AgentHookSession } from "@/features/agent/store/agent-hooks-store";
import type { Project } from "@/shared/types/domain";

import {
  buildAgentHookSessionPath,
  canNavigateToAgentHookSession,
  isAgentHookSideChatSession,
  resolveAgentHookNavigationTarget,
} from "../agent-hook-navigation";

function session(
  overrides: Partial<AgentHookSession> = {},
): AgentHookSession {
  return {
    session_id: "sess-1",
    tool: "claude-code",
    state: "running",
    timestamp: "2026-08-14T00:00:00.000Z",
    context_id: "ws-1",
    pane_id: "ws-1:1",
    ...overrides,
  };
}

const projects = [
  {
    id: "proj-1",
    name: "Atmos",
    workspaces: [{ id: "ws-1" }],
  },
] as unknown as Project[];

describe("isAgentHookSideChatSession", () => {
  it("treats a side_chat_id as a side chat", () => {
    expect(isAgentHookSideChatSession({ side_chat_id: "side-1" })).toBe(true);
  });

  it("treats terminal_kind side_chat as a side chat", () => {
    expect(isAgentHookSideChatSession({ terminal_kind: "side_chat" })).toBe(true);
  });

  it("does not treat a main pane as a side chat", () => {
    expect(isAgentHookSideChatSession({ pane_id: "ws-1:1" })).toBe(false);
  });
});

describe("resolveAgentHookNavigationTarget", () => {
  it("uses the source pane for a side chat instead of the side tmux window", () => {
    expect(
      resolveAgentHookNavigationTarget(
        session({
          pane_id: "ws-1:side-abcd1234",
          side_chat_id: "side-abcd",
          source_pane_id: "ws-1:3",
          terminal_kind: "side_chat",
        }),
      ),
    ).toEqual({
      contextId: "ws-1",
      isSideChat: true,
      sideChatId: "side-abcd",
      tmuxWindowName: "3",
    });
  });

  it("falls back to terminal_kind when side_chat_id is missing", () => {
    expect(
      resolveAgentHookNavigationTarget(
        session({
          pane_id: "ws-1:side-abcd1234",
          source_pane_id: "ws-1:1",
          terminal_kind: "side_chat",
        }),
      ),
    ).toMatchObject({
      isSideChat: true,
      tmuxWindowName: "1",
    });
  });

  it("keeps the main pane window for a normal session", () => {
    expect(resolveAgentHookNavigationTarget(session())).toEqual({
      contextId: "ws-1",
      isSideChat: false,
      sideChatId: null,
      tmuxWindowName: "1",
    });
  });
});

describe("buildAgentHookSessionPath", () => {
  it("includes sideChat and the source terminal window", () => {
    const path = buildAgentHookSessionPath(
      session({
        pane_id: "ws-1:side-abcd1234",
        side_chat_id: "side-abcd",
        source_pane_id: "ws-1:2",
        terminal_kind: "side_chat",
      }),
      projects,
      { terminalTabId: "term-tab-1" },
    );
    expect(path).toBe(
      "/workspace?id=ws-1&tab=term-tab-1&terminalTmux=2&sideChat=side-abcd",
    );
  });

  it("can navigate a main pane without a sideChat param", () => {
    expect(buildAgentHookSessionPath(session(), projects, null)).toBe(
      "/workspace?id=ws-1&terminalTmux=1",
    );
  });
});

describe("canNavigateToAgentHookSession", () => {
  it("allows a side chat that only has a sideChat id and context", () => {
    expect(
      canNavigateToAgentHookSession(
        session({
          pane_id: null,
          source_pane_id: null,
          side_chat_id: "side-abcd",
        }),
      ),
    ).toBe(true);
  });

  it("rejects a session with no context", () => {
    expect(
      canNavigateToAgentHookSession(session({ context_id: null, pane_id: null })),
    ).toBe(false);
  });
});
