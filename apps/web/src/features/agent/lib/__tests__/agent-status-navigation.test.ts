// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AgentStatusRecord } from "@/features/agent/store/agent-status-store";
import type { Project } from "@/shared/types/domain";

import { DEFAULT_CENTER_SPACE_ID } from "@/app-shell/center-space/center-space";
import {
  buildAgentStatusSessionPath,
  canNavigateToAgentStatusSession,
  isAgentStatusSideChatSession,
  resolveAgentStatusNavigationTarget,
} from "../agent-status-navigation";

function session(
  overrides: Partial<AgentStatusRecord> = {},
): AgentStatusRecord {
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

describe("isAgentStatusSideChatSession", () => {
  it("treats a side_chat_id as a side chat", () => {
    expect(isAgentStatusSideChatSession({ side_chat_id: "side-1" })).toBe(true);
  });

  it("treats terminal_kind side_chat as a side chat", () => {
    expect(isAgentStatusSideChatSession({ terminal_kind: "side_chat" })).toBe(true);
  });

  it("does not treat a main pane as a side chat", () => {
    expect(isAgentStatusSideChatSession({ pane_id: "ws-1:1" })).toBe(false);
  });
});

describe("resolveAgentStatusNavigationTarget", () => {
  it("uses the source pane for a side chat instead of the side tmux window", () => {
    expect(
      resolveAgentStatusNavigationTarget(
        session({
          pane_id: "ws-1:side-abcd1234",
          side_chat_id: "side-abcd",
          source_pane_id: "ws-1:3",
          terminal_kind: "side_chat",
        }),
      ),
    ).toEqual({
      contextId: "ws-1",
      spaceId: DEFAULT_CENTER_SPACE_ID,
      surface: "terminal",
      chatId: null,
      isSideChat: true,
      sideChatId: "side-abcd",
      tmuxWindowName: "3",
    });
  });

  it("falls back to terminal_kind when side_chat_id is missing", () => {
    expect(
      resolveAgentStatusNavigationTarget(
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
    expect(resolveAgentStatusNavigationTarget(session())).toEqual({
      contextId: "ws-1",
      spaceId: DEFAULT_CENTER_SPACE_ID,
      surface: "terminal",
      chatId: null,
      isSideChat: false,
      sideChatId: null,
      tmuxWindowName: "1",
    });
  });

  it("resolves the extra center space from a namespaced tmux window", () => {
    expect(
      resolveAgentStatusNavigationTarget(
        session({ pane_id: "ws-1:cs__space-abc__Claude Code" }),
      ),
    ).toEqual({
      contextId: "ws-1",
      spaceId: "space-abc",
      surface: "terminal",
      chatId: null,
      isSideChat: false,
      sideChatId: null,
      tmuxWindowName: "cs__space-abc__Claude Code",
    });
  });

  it("routes a chat status session to its center tab and space", () => {
    expect(
      resolveAgentStatusNavigationTarget(
        session({
          session_id: "chat:chat-1",
          pane_id: null,
          surface: "chat",
          surface_id: "chat-1",
          space_id: "space-abc",
        }),
      ),
    ).toEqual({
      contextId: "ws-1",
      spaceId: "space-abc",
      surface: "chat",
      chatId: "chat-1",
      isSideChat: false,
      sideChatId: null,
      tmuxWindowName: null,
    });
  });

  it("derives chat id from the chat: session prefix when surface_id is missing", () => {
    expect(
      resolveAgentStatusNavigationTarget(
        session({
          session_id: "chat:chat-9",
          pane_id: null,
          surface: "chat",
        }),
      ),
    ).toMatchObject({
      surface: "chat",
      chatId: "chat-9",
      spaceId: DEFAULT_CENTER_SPACE_ID,
    });
  });
});

describe("buildAgentStatusSessionPath", () => {
  it("includes sideChat and the source terminal window", () => {
    const path = buildAgentStatusSessionPath(
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
    expect(buildAgentStatusSessionPath(session(), projects, null)).toBe(
      "/workspace?id=ws-1&terminalTmux=1",
    );
  });

  it("keeps the host workspace id when jumping to an extra space pane", () => {
    expect(
      buildAgentStatusSessionPath(
        session({ pane_id: "ws-1:cs__space-abc__1" }),
        projects,
        null,
      ),
    ).toBe("/workspace?id=ws-1&terminalTmux=cs__space-abc__1");
  });

  it("deep-links a chat session to the owning host and center tab", () => {
    expect(
      buildAgentStatusSessionPath(
        session({
          session_id: "chat:chat-1",
          pane_id: null,
          surface: "chat",
          surface_id: "chat-1",
          space_id: "space-abc",
        }),
        projects,
        null,
      ),
    ).toBe("/workspace?id=ws-1&tab=agent-chat%3Achat-1");
  });
});

describe("canNavigateToAgentStatusSession", () => {
  it("allows a side chat that only has a sideChat id and context", () => {
    expect(
      canNavigateToAgentStatusSession(
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
      canNavigateToAgentStatusSession(session({ context_id: null, pane_id: null })),
    ).toBe(false);
  });

  it("allows a chat session that has a context and chat id", () => {
    expect(
      canNavigateToAgentStatusSession(
        session({
          pane_id: null,
          surface: "chat",
          surface_id: "chat-1",
        }),
      ),
    ).toBe(true);
  });
});

describe("navigateToAgentStatusSession space handoff", () => {
  it("commits dest deep link before switching the owning space", () => {
    const src = readFileSync(join(import.meta.dir, "../agent-status-navigation.ts"), "utf8");
    expect(src).toContain("navigateToLocatedPane(");
    expect(src).toContain("commitLocatedPaneNavigation(router, path)");
    expect(src).toContain("makeCenterSpaceKey(contextId, target.spaceId)");
    expect(src).toContain("preserveDeepLink: true");
    expect(src).toContain("prepareChatCenterTab(");
    expect(src).toContain("activateCenterChromeTab(paintContextId, tabValue");
    expect(src).toContain('target.surface === "chat"');
    const commitAt = src.indexOf("commitLocatedPaneNavigation(router, path)");
    const switchAt = src.indexOf("switchCenterSpace(contextId, target.spaceId");
    expect(commitAt).toBeGreaterThan(0);
    expect(switchAt).toBeGreaterThan(commitAt);
  });
});
