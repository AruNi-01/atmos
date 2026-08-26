import { describe, expect, it } from "bun:test";
import type { TerminalPaneProps } from "@/features/terminal/types/index";
import {
  findTerminalPaneByStableAgentPaneId,
  paneTitleIndicatesAgentExited,
  uniquePaneTitleForAgentStatus,
} from "../agent-hook-pane-title";

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
