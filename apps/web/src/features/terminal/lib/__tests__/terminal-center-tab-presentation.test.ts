// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import type { TerminalPaneProps } from "../../types/index";
import {
  pickRepresentativeTerminalPaneId,
  resolvePaneTitleForCenterTab,
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
    });
  });

  it("mirrors the single pane title (including OSC) and agent", () => {
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
    expect(result.displayTitle).toBe("Claude Code | debugging auth");
    expect(result.toolbarAgent?.id).toBe("claude");
    expect(result.sourcePaneId).toBe("a");
  });

  it("hides agent name but keeps agent icon and OSC without a pipe", () => {
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
      showAgentName: false,
    });
    expect(result.displayTitle).toBe("debugging auth");
    expect(result.displayTitle).not.toContain("|");
    expect(result.toolbarAgent?.id).toBe("claude");
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
    });
  });
});
