import { afterEach, describe, expect, it } from "bun:test";
import type { TerminalPaneProps } from "@/features/terminal/types/index";
import {
  resetCachedDynamicTitlesForTests,
  writeCachedOscTitle,
} from "@/features/terminal/lib/terminal-dynamic-title-cache";
import {
  collectAgentStatusSessionTitles,
  findTerminalPaneByStableAgentPaneId,
  paneTitleIndicatesAgentExited,
  terminalSessionIsCurrentAgent,
  uniquePaneTitleForAgentStatus,
} from "../agent-status-pane-title";

const claudeAgent = {
  id: "claude",
  label: "Claude Code",
  command: "claude",
  iconType: "built-in" as const,
};

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

describe("paneTitleIndicatesAgentExited", () => {
  it("is false while the live title still brands the agent", () => {
    expect(
      paneTitleIndicatesAgentExited(
        pane({
          id: "a",
          label: "Claude Code",
          agent: claudeAgent,
          dynamicTitle: "claude",
          oscTitle: "debugging auth",
        }),
      ),
    ).toBe(false);
  });

  it("is true when the live title has returned to a cwd", () => {
    expect(
      paneTitleIndicatesAgentExited(
        pane({
          id: "a",
          label: "Claude Code",
          agent: claudeAgent,
          dynamicTitle: "/Users/me/own_space/OpenSource/atmos",
        }),
      ),
    ).toBe(true);
  });

  it("keeps a typed grok binary that has no stored pane agent", () => {
    expect(
      paneTitleIndicatesAgentExited(
        pane({
          id: "a",
          label: "1",
          tmuxWindowName: "1",
          dynamicTitle: "grok-1.0.46",
          oscTitle: "Launch Subagent to Explore Project",
        }),
      ),
    ).toBe(false);
    expect(
      paneTitleIndicatesAgentExited(
        pane({
          id: "a",
          label: "1",
          dynamicTitle: "grok",
        }),
      ),
    ).toBe(false);
  });

  it("still treats a cwd title as exited when the pane agent was never stored", () => {
    expect(
      paneTitleIndicatesAgentExited(
        pane({
          id: "a",
          label: "1",
          dynamicTitle: ".../atmos/koffing",
        }),
      ),
    ).toBe(true);
  });
});

describe("terminalSessionIsCurrentAgent", () => {
  it("hides a pane whose title has fallen back to a path", () => {
    expect(
      terminalSessionIsCurrentAgent("ws-1:1", {
        workspacePanes: {
          "ws-1": {
            "pane-a": pane({
              id: "pane-a",
              label: "Claude Code",
              tmuxWindowName: "1",
              agent: claudeAgent,
              dynamicTitle: "/Users/me/own_space/OpenSource/atmos",
            }),
          },
        },
      }),
    ).toBe(false);
  });

  it("keeps a pane that still brands the agent", () => {
    expect(
      terminalSessionIsCurrentAgent("ws-1:1", {
        workspacePanes: {
          "ws-1": {
            "pane-a": pane({
              id: "pane-a",
              label: "Claude Code",
              tmuxWindowName: "1",
              agent: claudeAgent,
              dynamicTitle: "claude",
              oscTitle: "debugging auth",
            }),
          },
        },
      }),
    ).toBe(true);
  });

  it("drops a closed window once that host's terminals are loaded", () => {
    expect(
      terminalSessionIsCurrentAgent("ws-1:1", {
        workspacePanes: {
          "ws-1": {
            "pane-b": pane({
              id: "pane-b",
              label: "2",
              tmuxWindowName: "2",
            }),
          },
        },
      }),
    ).toBe(false);
  });

  it("keeps a catalog row until that host's terminals are loaded", () => {
    expect(
      terminalSessionIsCurrentAgent("ws-1:1", { workspacePanes: {} }),
    ).toBe(true);
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
