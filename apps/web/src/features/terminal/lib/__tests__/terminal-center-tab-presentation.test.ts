// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import type { TerminalPaneProps } from "../../types/index";
import {
  pickRepresentativeTerminalPaneId,
  resolvePaneTitleForCenterTab,
  resolvePaneToolbarTitle,
  resolveTerminalCenterTabPresentation,
} from "../terminal-center-tab-presentation";

const claudeAgent = {
  id: "claude",
  label: "Claude Code",
  command: "claude",
  iconType: "built-in" as const,
};

const codexAgent = {
  id: "codex",
  label: "Codex",
  command: "codex",
  iconType: "built-in" as const,
};

const grokAgent = {
  id: "grok-build",
  label: "Grok Build",
  command: "grok",
  iconType: "built-in" as const,
};

function pane(partial: Partial<TerminalPaneProps> & Pick<TerminalPaneProps, "id" | "label">): TerminalPaneProps {
  return {
    sessionId: partial.sessionId ?? `session-${partial.id}`,
    workspaceId: partial.workspaceId ?? "ws",
    ...partial,
  };
}

describe("pickRepresentativeTerminalPaneId", () => {
  it("returns the only pane when there is one", () => {
    const panes = {
      a: pane({ id: "a", label: "1" }),
    };
    expect(
      pickRepresentativeTerminalPaneId({
        panes,
        layout: "a",
        lastActivePaneId: null,
      }),
    ).toBe("a");
  });

  it("prefers last active over maximized and layout order", () => {
    const panes = {
      a: pane({ id: "a", label: "1" }),
      b: pane({ id: "b", label: "Claude Code", agent: claudeAgent }),
      c: pane({ id: "c", label: "3" }),
    };
    expect(
      pickRepresentativeTerminalPaneId({
        panes,
        layout: {
          direction: "row",
          first: "a",
          second: {
            direction: "column",
            first: "b",
            second: "c",
          },
        },
        lastActivePaneId: "c",
        maximizedPaneId: "b",
      }),
    ).toBe("c");
  });

  it("falls back to maximized then first layout leaf", () => {
    const panes = {
      a: pane({ id: "a", label: "1" }),
      b: pane({ id: "b", label: "2" }),
    };
    expect(
      pickRepresentativeTerminalPaneId({
        panes,
        layout: { direction: "row", first: "a", second: "b" },
        lastActivePaneId: "gone",
        maximizedPaneId: "b",
      }),
    ).toBe("b");
    expect(
      pickRepresentativeTerminalPaneId({
        panes,
        layout: { direction: "row", first: "a", second: "b" },
        lastActivePaneId: null,
        maximizedPaneId: null,
      }),
    ).toBe("a");
  });
});

describe("resolveTerminalCenterTabPresentation", () => {
  it("uses custom tab title and suppresses agent icon", () => {
    const panes = {
      a: pane({
        id: "a",
        label: "Claude Code",
        agent: claudeAgent,
        dynamicTitle: "claude",
      }),
    };
    expect(
      resolveTerminalCenterTabPresentation({
        fallbackTitle: "Term",
        customTitle: "My Tab",
        panes,
        layout: "a",
        configuredAgents: [claudeAgent],
      }),
    ).toEqual({
      displayTitle: "My Tab",
      toolbarAgent: undefined,
      sourcePaneId: null,
      sessionOscTitle: undefined,
    });
  });

  it("mirrors the single pane agent icon + stable session OSC (not live churn)", () => {
    const panes = {
      a: pane({
        id: "a",
        label: "Claude Code",
        agent: claudeAgent,
        dynamicTitle: "claude",
        oscTitle: "debugging auth",
      }),
    };
    const result = resolveTerminalCenterTabPresentation({
      fallbackTitle: "Term",
      panes,
      layout: "a",
      configuredAgents: [claudeAgent],
    });
    expect(result.displayTitle).toBe("debugging auth");
    expect(result.displayTitle).not.toContain("|");
    expect(result.sessionOscTitle).toBe("debugging auth");
    expect(result.toolbarAgent?.id).toBe("claude");
    expect(result.sourcePaneId).toBe("a");
  });

  it("strips Grok realtime OSC prefixes down to the fixed session name", () => {
    const panes = {
      a: pane({
        id: "a",
        label: "Grok Build",
        agent: grokAgent,
        dynamicTitle: "grok",
        // Default Grok title items: action/spinner/activity/session-name/grok
        oscTitle: "Action Required - ⠋ - Responding - Optimize Terminal Tab - grok",
      }),
    };
    const result = resolveTerminalCenterTabPresentation({
      fallbackTitle: "Term",
      panes,
      layout: "a",
      configuredAgents: [grokAgent],
    });
    expect(result.displayTitle).toBe("Optimize Terminal Tab");
    expect(result.displayTitle).not.toContain("|");
    expect(result.sessionOscTitle).toBe("Optimize Terminal Tab");
    expect(result.displayTitle).not.toContain("Responding");
    expect(result.displayTitle).not.toContain("Action Required");
    expect(result.toolbarAgent?.id).toBe("grok-build");
  });

  it("keeps the sticky session topic when live OSC becomes pure realtime", () => {
    const panes = {
      a: pane({
        id: "a",
        label: "Grok Build",
        agent: grokAgent,
        dynamicTitle: "grok",
        // Spinner frame only — no session segment this tick
        oscTitle: "⠋ - Responding - grok",
      }),
    };
    const result = resolveTerminalCenterTabPresentation({
      fallbackTitle: "Term",
      panes,
      layout: "a",
      configuredAgents: [grokAgent],
      previousSessionOscByPaneId: { a: "Optimize Terminal Tab" },
    });
    expect(result.displayTitle).toBe("Optimize Terminal Tab");
    expect(result.displayTitle).not.toContain("|");
    expect(result.sessionOscTitle).toBe("Optimize Terminal Tab");
  });

  it("clears the sticky session topic when OSC is cleared", () => {
    const panes = {
      a: pane({
        id: "a",
        label: "Grok Build",
        agent: grokAgent,
        dynamicTitle: "grok",
        oscTitle: undefined,
      }),
    };
    const result = resolveTerminalCenterTabPresentation({
      fallbackTitle: "Term",
      panes,
      layout: "a",
      configuredAgents: [grokAgent],
      previousSessionOscByPaneId: { a: "Optimize Terminal Tab" },
    });
    expect(result.displayTitle).toBe("Grok Build");
    expect(result.sessionOscTitle).toBeUndefined();
    expect(result.toolbarAgent?.id).toBe("grok-build");
  });

  it("shows the agent name when the pane has no session topic or cwd", () => {
    const panes = {
      a: pane({
        id: "a",
        label: "Claude Code",
        agent: claudeAgent,
        dynamicTitle: "claude",
      }),
    };
    const result = resolveTerminalCenterTabPresentation({
      fallbackTitle: "Term",
      panes,
      layout: "a",
      configuredAgents: [claudeAgent],
    });
    expect(result.displayTitle).toBe("Claude Code");
    expect(result.toolbarAgent?.id).toBe("claude");
  });

  it("does not prefix the agent name onto a session topic", () => {
    const panes = {
      a: pane({
        id: "a",
        label: "Claude Code",
        agent: claudeAgent,
        dynamicTitle: "claude",
        oscTitle: "debugging auth",
      }),
    };
    const result = resolveTerminalCenterTabPresentation({
      fallbackTitle: "Term",
      panes,
      layout: "a",
      configuredAgents: [claudeAgent],
    });
    expect(result.displayTitle).toBe("debugging auth");
    expect(result.displayTitle).not.toContain("Claude Code");
    expect(result.toolbarAgent?.id).toBe("claude");
  });

  it("shows the last cwd instead of the tmux window index", () => {
    const panes = {
      a: pane({
        id: "a",
        label: "1",
        tmuxWindowName: "1",
        dynamicTitle: "OpenSource/atmos",
      }),
    };
    expect(
      resolveTerminalCenterTabPresentation({
        fallbackTitle: "Term",
        panes,
        layout: "a",
      }).displayTitle,
    ).toBe("OpenSource/atmos");
  });

  it("shows live cwd after an agent pane returns to the shell", () => {
    const panes = {
      a: pane({
        id: "a",
        label: "Claude Code",
        agent: claudeAgent,
        dynamicTitle: "OpenSource/atmos",
      }),
    };
    const result = resolveTerminalCenterTabPresentation({
      fallbackTitle: "Term",
      panes,
      layout: "a",
      configuredAgents: [claudeAgent],
    });
    expect(result.displayTitle).toBe("OpenSource/atmos");
    expect(result.toolbarAgent).toBeUndefined();
  });

  it("uses the last-active pane when multiple panes exist", () => {
    const panes = {
      a: pane({ id: "a", label: "1", dynamicTitle: ".../proj" }),
      b: pane({
        id: "b",
        label: "Codex",
        agent: codexAgent,
        dynamicTitle: "codex",
      }),
    };
    const result = resolveTerminalCenterTabPresentation({
      fallbackTitle: "Term",
      panes,
      layout: { direction: "row", first: "a", second: "b" },
      lastActivePaneId: "b",
      configuredAgents: [claudeAgent, codexAgent],
    });
    expect(result.displayTitle).toBe("Codex");
    expect(result.toolbarAgent?.id).toBe("codex");
    expect(result.sourcePaneId).toBe("b");
  });

  it("follows live OSC on the pane toolbar, not the sticky center-tab topic", () => {
    expect(
      resolvePaneToolbarTitle(
        pane({
          id: "a",
          label: "Claude Code",
          agent: claudeAgent,
          dynamicTitle: "claude",
          oscTitle: "debugging auth",
        }),
        { configuredAgents: [claudeAgent] },
      ),
    ).toEqual({
      displayTitle: "debugging auth",
      toolbarAgent: expect.objectContaining({ id: "claude" }),
    });
  });

  it("falls back to the agent name on the toolbar when there is no OSC", () => {
    expect(
      resolvePaneToolbarTitle(
        pane({
          id: "a",
          label: "Claude Code",
          agent: claudeAgent,
          dynamicTitle: "claude",
        }),
        { configuredAgents: [claudeAgent] },
      ),
    ).toEqual({
      displayTitle: "Claude Code",
      toolbarAgent: expect.objectContaining({ id: "claude" }),
    });
  });

  it("composes pane custom labels like the toolbar", () => {
    const panes = {
      a: pane({
        id: "a",
        label: "Claude Code",
        agent: claudeAgent,
        customLabel: "Review",
        keepAgentName: true,
        dynamicTitle: "claude",
      }),
    };
    expect(
      resolvePaneTitleForCenterTab(panes.a, { configuredAgents: [claudeAgent] }),
    ).toEqual({
      displayTitle: "Review · Claude Code",
      toolbarAgent: expect.objectContaining({ id: "claude" }),
      sessionOscTitle: undefined,
    });
    expect(
      resolvePaneTitleForCenterTab(
        pane({
          ...panes.a,
          keepAgentName: false,
        }),
        { configuredAgents: [claudeAgent] },
      ),
    ).toEqual({
      displayTitle: "Review",
      toolbarAgent: expect.objectContaining({ id: "claude" }),
      sessionOscTitle: undefined,
    });
  });

  it("falls back to the tab title when there are no panes", () => {
    expect(
      resolveTerminalCenterTabPresentation({
        fallbackTitle: "Term",
        panes: {},
        layout: null,
      }),
    ).toEqual({
      displayTitle: "Term",
      toolbarAgent: undefined,
      sourcePaneId: null,
      sessionOscTitle: undefined,
    });
  });
});
