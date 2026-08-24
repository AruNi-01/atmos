import { describe, expect, test } from "bun:test";
import { getTerminalDisplayMeta } from "@atmos/shared/terminal";
import {
  buildResourceMonitorSessionTitleMap,
  resolveLivePaneDisplayTitle,
  resolveResourceMonitorSessionTitle,
  type ResourceMonitorPaneTitleSource,
} from "@/features/resource-monitor/lib/resource-monitor-session-titles";

const claudeAgent = {
  id: "claude",
  label: "Claude Code",
  command: "claude",
};

function pane(
  partial: ResourceMonitorPaneTitleSource & { sessionId: string },
): ResourceMonitorPaneTitleSource {
  return partial;
}

describe("resolveLivePaneDisplayTitle", () => {
  test("prefers customLabel over dynamic, OSC, and tmux-index labels", () => {
    expect(
      resolveLivePaneDisplayTitle({
        sessionId: "s",
        label: "1",
        customLabel: "Review box",
        dynamicTitle: "npm run dev",
        oscTitle: "building",
        agent: claudeAgent,
      }),
    ).toBe("Review box");
  });

  test("ignores whitespace-only customLabel and uses canonical meta", () => {
    expect(
      resolveLivePaneDisplayTitle({
        sessionId: "s",
        label: "1",
        customLabel: "   ",
        dynamicTitle: "npm run dev",
      }),
    ).toBe("npm run dev");
  });

  test("does not treat a tmux-index label as a live title", () => {
    expect(
      resolveLivePaneDisplayTitle({
        sessionId: "s",
        label: "1",
      }),
    ).toBeUndefined();
  });
});

describe("buildResourceMonitorSessionTitleMap", () => {
  test("server name 1 + live dynamic npm run dev uses the dynamic title", () => {
    const titles = buildResourceMonitorSessionTitleMap({
      "ws-a": {
        pane1: pane({
          sessionId: "sess-dev",
          label: "1",
          dynamicTitle: "npm run dev",
        }),
      },
    });
    expect(titles.get("sess-dev")).toBe("npm run dev");
    expect(
      resolveResourceMonitorSessionTitle("sess-dev", "1", titles, "Unnamed session"),
    ).toBe("npm run dev");
  });

  test("agent + OSC uses the canonical getTerminalDisplayMeta combination", () => {
    const source = pane({
      sessionId: "sess-agent",
      label: "Claude Code",
      agent: claudeAgent,
      oscTitle: "Review the PR",
    });
    const expected = getTerminalDisplayMeta({
      baseTitle: source.label,
      dynamicTitle: source.dynamicTitle,
      agent: source.agent,
      oscTitle: source.oscTitle,
    }).displayTitle;

    const titles = buildResourceMonitorSessionTitleMap({
      "ws-a": { pane1: source },
    });
    expect(expected.length).toBeGreaterThan(0);
    expect(expected).toContain("Claude Code");
    expect(expected).toContain("Review the PR");
    expect(titles.get("sess-agent")).toBe(expected);
    expect(
      resolveResourceMonitorSessionTitle("sess-agent", "1", titles, "Unnamed session"),
    ).toBe(expected);
  });

  test("customLabel wins over live dynamic and OSC", () => {
    const titles = buildResourceMonitorSessionTitleMap({
      "ws-a": {
        pane1: pane({
          sessionId: "sess-custom",
          label: "1",
          customLabel: "API logs",
          dynamicTitle: "npm run dev",
          oscTitle: "compiling",
        }),
      },
    });
    expect(titles.get("sess-custom")).toBe("API logs");
    expect(
      resolveResourceMonitorSessionTitle("sess-custom", "pty", titles, "Unnamed session"),
    ).toBe("API logs");
  });

  test("no live title and server name 1 falls back to unnamed", () => {
    const titles = buildResourceMonitorSessionTitleMap({
      "ws-a": {
        pane1: pane({ sessionId: "sess-bare", label: "1" }),
      },
    });
    expect(titles.has("sess-bare")).toBe(false);
    expect(
      resolveResourceMonitorSessionTitle("sess-bare", "1", titles, "Unnamed session"),
    ).toBe("Unnamed session");
    expect(
      resolveResourceMonitorSessionTitle("sess-missing", "1", titles, "Unnamed session"),
    ).toBe("Unnamed session");
  });

  test("keeps an ordinary server name when there is no live title", () => {
    const titles = buildResourceMonitorSessionTitleMap({});
    expect(
      resolveResourceMonitorSessionTitle("sess-named", "dev-session", titles, "Unnamed session"),
    ).toBe("dev-session");
    expect(
      resolveResourceMonitorSessionTitle("sess-named", "  Main  ", titles, "Unnamed session"),
    ).toBe("Main");
  });

  test("duplicate sessionIds across scopes use last-write-wins (sessionId should be unique)", () => {
    const titles = buildResourceMonitorSessionTitleMap({
      "ws-first": {
        paneA: pane({
          sessionId: "shared",
          label: "1",
          dynamicTitle: "first command",
        }),
      },
      "ws-second": {
        paneB: pane({
          sessionId: "shared",
          label: "1",
          dynamicTitle: "second command",
        }),
      },
    });
    expect(titles.get("shared")).toBe("second command");
  });

  test("skips panes without a sessionId", () => {
    const titles = buildResourceMonitorSessionTitleMap({
      "ws-a": {
        orphan: { label: "1", dynamicTitle: "htop" },
        named: pane({ sessionId: "kept", label: "1", dynamicTitle: "vim" }),
      },
    });
    expect(titles.size).toBe(1);
    expect(titles.get("kept")).toBe("vim");
  });
});
