import { afterEach, describe, expect, it } from "bun:test";
import type { TerminalPaneProps } from "@/features/terminal/types/index";
import {
  resetCachedDynamicTitlesForTests,
  writeCachedOscTitle,
} from "@/features/terminal/lib/terminal-dynamic-title-cache";
import {
  collectAgentStatusSessionTitles,
  findTerminalPaneByStableAgentPaneId,
  uniquePaneTitleForAgentStatus,
} from "../agent-status-pane-title";

function pane(
  partial: Partial<TerminalPaneProps> & Pick<TerminalPaneProps, "id" | "label">,
): TerminalPaneProps {
  return {
    sessionId: partial.sessionId ?? `session-${partial.id}`,
    workspaceId: partial.workspaceId ?? "ws-1",
    ...partial,
  };
}

describe("uniquePaneTitleForAgentStatus", () => {
  it("strips a leading agent brand and pipe OSC topic", () => {
    expect(uniquePaneTitleForAgentStatus("Claude Code | debugging auth", "Claude Code")).toBe(
      "debugging auth",
    );
  });

  it("strips a trailing agent brand after a custom label", () => {
    expect(uniquePaneTitleForAgentStatus("Review · Claude Code", "Claude Code")).toBe("Review");
  });

  it("returns null when the title is only the agent brand", () => {
    expect(uniquePaneTitleForAgentStatus("Claude Code", "Claude Code")).toBeNull();
  });
});

describe("findTerminalPaneByStableAgentPaneId", () => {
  it("matches a pane by host id and tmux window across tab scopes", () => {
    const found = findTerminalPaneByStableAgentPaneId(
      {
        workspacePanes: {
          "ws-1::terminal-tab:extra": {
            "pane-a": pane({
              id: "pane-a",
              label: "1",
              tmuxWindowName: "3",
            }),
          },
        },
      },
      "ws-1:3",
    );
    expect(found?.id).toBe("pane-a");
  });
});

describe("collectAgentStatusSessionTitles", () => {
  afterEach(() => {
    resetCachedDynamicTitlesForTests();
  });

  it("uses the Agent Chat tab title for chat occupancy rows", () => {
    const titles = collectAgentStatusSessionTitles(
      [
        {
          session_id: "chat:abc",
          tool: "claude-code",
          state: "idle",
          timestamp: "t",
          surface: "chat",
          surface_id: "abc",
        },
      ],
      {
        contestedOwners: {},
        panes: { workspacePanes: {} },
        chatTabs: [{ chatId: "abc", title: " Fix footer  " }],
        agentLabel: (tool) => (tool === "claude-code" ? "Claude Code" : tool),
      },
    );
    expect(titles["chat:abc"]).toBe("Fix footer");
  });

  it("does not publish the generic Terminal placeholder", () => {
    const titles = collectAgentStatusSessionTitles(
      [
        {
          session_id: "ws-1:1",
          tool: "grok",
          surface: "terminal",
          pane_id: "ws-1:1",
        },
      ],
      {
        contestedOwners: {},
        panes: {
          workspacePanes: {
            "ws-1": {
              "pane-a": pane({
                id: "pane-a",
                label: "1",
                tmuxWindowName: "1",
                workspaceId: "ws-1",
              }),
            },
          },
        },
        chatTabs: [],
        agentLabel: () => "Grok Build",
      },
    );
    expect(titles["ws-1:1"]).toBeUndefined();
  });

  it("uses the cached session topic when the live pane has not been hydrated", () => {
    writeCachedOscTitle("ws-1", "1", "Start subagent to explore the project");
    const titles = collectAgentStatusSessionTitles(
      [
        {
          session_id: "ws-1:1",
          tool: "grok",
          surface: "terminal",
          pane_id: "ws-1:1",
        },
      ],
      {
        contestedOwners: {},
        panes: {
          workspacePanes: {
            "ws-1": {
              "pane-a": pane({
                id: "pane-a",
                label: "1",
                tmuxWindowName: "1",
                workspaceId: "ws-1",
              }),
            },
          },
        },
        chatTabs: [],
        agentLabel: () => "Grok Build",
      },
    );
    expect(titles["ws-1:1"]).toBe("Start subagent to explore the project");
  });

  it("reads the cached topic even when that workspace has no live pane", () => {
    writeCachedOscTitle("ws-1", "1", "Launch subagent to explore project structure");
    const titles = collectAgentStatusSessionTitles(
      [
        {
          session_id: "ws-1:1",
          tool: "grok",
          surface: "terminal",
          pane_id: "ws-1:1",
        },
      ],
      {
        contestedOwners: {},
        panes: { workspacePanes: {} },
        chatTabs: [],
        agentLabel: () => "Grok Build",
      },
    );
    expect(titles["ws-1:1"]).toBe("Launch subagent to explore project structure");
  });

  it("keeps a live pane topic ahead of a different cached topic", () => {
    writeCachedOscTitle("ws-1", "1", "cached topic");
    const titles = collectAgentStatusSessionTitles(
      [
        {
          session_id: "ws-1:1",
          tool: "grok",
          surface: "terminal",
          pane_id: "ws-1:1",
        },
      ],
      {
        contestedOwners: {},
        panes: {
          workspacePanes: {
            "ws-1": {
              "pane-a": pane({
                id: "pane-a",
                label: "1",
                tmuxWindowName: "1",
                workspaceId: "ws-1",
                oscTitle: "live topic",
                dynamicTitle: "grok",
              }),
            },
          },
        },
        chatTabs: [],
        agentLabel: () => "Grok Build",
      },
    );
    expect(titles["ws-1:1"]).toBe("live topic");
  });
});
