import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CENTER_SPACE_ID,
  makeCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import { FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/lib/terminal-layout-document";
import {
  findLiveResourceSessionLocation,
  findLiveResourceSessionLocationForMonitor,
  findResourceMonitorSessionLocation,
  parseTerminalWorkspaceScopeKey,
  type LiveResourceSessionPanes,
} from "@/features/resource-monitor/lib/resource-monitor-session-locator";

const HOST = "ws-host";
const EXTRA = "space-abc";
const CUSTOM_TAB = "terminal-tab:custom-1";

function pane(partial: {
  sessionId?: string | null;
  workspaceId?: string | null;
  tmuxWindowName?: string | null;
}) {
  return partial;
}

describe("parseTerminalWorkspaceScopeKey", () => {
  test("parses default fixed host", () => {
    expect(parseTerminalWorkspaceScopeKey(HOST)).toEqual({
      hostId: HOST,
      spaceId: DEFAULT_CENTER_SPACE_ID,
      paintContextId: HOST,
      terminalTabId: FIXED_TERMINAL_TAB_VALUE,
    });
  });

  test("parses default custom host::tab", () => {
    expect(parseTerminalWorkspaceScopeKey(`${HOST}::${CUSTOM_TAB}`)).toEqual({
      hostId: HOST,
      spaceId: DEFAULT_CENTER_SPACE_ID,
      paintContextId: HOST,
      terminalTabId: CUSTOM_TAB,
    });
  });

  test("parses extra fixed host::space::spaceId", () => {
    const paint = makeCenterSpaceKey(HOST, EXTRA);
    expect(parseTerminalWorkspaceScopeKey(paint)).toEqual({
      hostId: HOST,
      spaceId: EXTRA,
      paintContextId: paint,
      terminalTabId: FIXED_TERMINAL_TAB_VALUE,
    });
  });

  test("parses extra custom host::space::spaceId::tab", () => {
    const paint = makeCenterSpaceKey(HOST, EXTRA);
    expect(parseTerminalWorkspaceScopeKey(`${paint}::${CUSTOM_TAB}`)).toEqual({
      hostId: HOST,
      spaceId: EXTRA,
      paintContextId: paint,
      terminalTabId: CUSTOM_TAB,
    });
  });
});

describe("findLiveResourceSessionLocation", () => {
  test("resolves a default fixed-tab pane", () => {
    const panes: LiveResourceSessionPanes = {
      [HOST]: {
        "pane-1": pane({
          sessionId: "sess-default",
          workspaceId: HOST,
          tmuxWindowName: "1",
        }),
      },
    };
    expect(findResourceMonitorSessionLocation(panes, HOST, "sess-default")).toEqual({
      hostId: HOST,
      spaceId: DEFAULT_CENTER_SPACE_ID,
      paintContextId: HOST,
      terminalTabId: FIXED_TERMINAL_TAB_VALUE,
      paneId: "pane-1",
      sessionId: "sess-default",
      tmuxWindowName: "1",
    });
  });

  test("resolves a default custom tab from host::tab", () => {
    const panes: LiveResourceSessionPanes = {
      [`${HOST}::${CUSTOM_TAB}`]: {
        "pane-custom": pane({
          sessionId: "sess-custom",
          workspaceId: HOST,
          tmuxWindowName: "Claude Code",
        }),
      },
    };
    expect(findLiveResourceSessionLocation(panes, HOST, "sess-custom")).toEqual({
      hostId: HOST,
      spaceId: DEFAULT_CENTER_SPACE_ID,
      paintContextId: HOST,
      terminalTabId: CUSTOM_TAB,
      paneId: "pane-custom",
      sessionId: "sess-custom",
      tmuxWindowName: "Claude Code",
    });
  });

  test("resolves an extra-space fixed tab and keeps scope as tab truth", () => {
    const paint = makeCenterSpaceKey(HOST, EXTRA);
    const panes: LiveResourceSessionPanes = {
      [paint]: {
        "pane-extra": pane({
          sessionId: "sess-extra",
          workspaceId: HOST,
          tmuxWindowName: `cs__${EXTRA}__1`,
        }),
      },
    };
    expect(findLiveResourceSessionLocation(panes, HOST, "sess-extra")).toEqual({
      hostId: HOST,
      spaceId: EXTRA,
      paintContextId: paint,
      terminalTabId: FIXED_TERMINAL_TAB_VALUE,
      paneId: "pane-extra",
      sessionId: "sess-extra",
      tmuxWindowName: `cs__${EXTRA}__1`,
    });
  });

  test("resolves an extra-space custom tab even when tmux space differs", () => {
    const paint = makeCenterSpaceKey(HOST, EXTRA);
    const panes: LiveResourceSessionPanes = {
      [`${paint}::${CUSTOM_TAB}`]: {
        "pane-extra-tab": pane({
          sessionId: "sess-extra-tab",
          workspaceId: HOST,
          tmuxWindowName: "cs__other-space__1",
        }),
      },
    };
    const hit = findLiveResourceSessionLocation(panes, HOST, "sess-extra-tab");
    expect(hit?.spaceId).toBe(EXTRA);
    expect(hit?.terminalTabId).toBe(CUSTOM_TAB);
    expect(hit?.paintContextId).toBe(paint);
    expect(hit?.tmuxWindowName).toBe("cs__other-space__1");
  });

  test("omits tmuxWindowName for a simple PTY pane", () => {
    const panes: LiveResourceSessionPanes = {
      [HOST]: {
        "pane-simple": pane({
          sessionId: "sess-simple",
          workspaceId: HOST,
        }),
      },
    };
    expect(findLiveResourceSessionLocation(panes, HOST, "sess-simple")).toEqual({
      hostId: HOST,
      spaceId: DEFAULT_CENTER_SPACE_ID,
      paintContextId: HOST,
      terminalTabId: FIXED_TERMINAL_TAB_VALUE,
      paneId: "pane-simple",
      sessionId: "sess-simple",
    });
  });

  test("aliases the Resource Monitor wrapper to the same locator", () => {
    const panes: LiveResourceSessionPanes = {
      [HOST]: {
        "pane-1": pane({
          sessionId: "sess-default",
          workspaceId: HOST,
          tmuxWindowName: "1",
        }),
      },
    };
    expect(findLiveResourceSessionLocationForMonitor(panes, HOST, "sess-default")).toEqual(
      findResourceMonitorSessionLocation(panes, HOST, "sess-default"),
    );
    expect(findResourceMonitorSessionLocation(panes, HOST, "missing")).toBeNull();
  });

  test("does not guess when sessionId is missing or null", () => {
    const panes: LiveResourceSessionPanes = {
      [HOST]: {
        "pane-1": pane({
          sessionId: "sess-live",
          workspaceId: HOST,
          tmuxWindowName: "1",
        }),
      },
    };
    expect(findLiveResourceSessionLocation(panes, HOST, null)).toBeNull();
    expect(findLiveResourceSessionLocation(panes, HOST, "   ")).toBeNull();
    expect(findLiveResourceSessionLocation(panes, HOST, "sess-missing")).toBeNull();
    expect(findLiveResourceSessionLocation(panes, HOST, "sess-live")?.sessionId).toBe("sess-live");
  });

  test("skips panes whose workspaceId host does not match", () => {
    const panes: LiveResourceSessionPanes = {
      [HOST]: {
        "pane-wrong": pane({
          sessionId: "sess-shared",
          workspaceId: "other-host",
          tmuxWindowName: "1",
        }),
      },
    };
    expect(findLiveResourceSessionLocation(panes, HOST, "sess-shared")).toBeNull();
  });

  test("does not return a pane stored under a different host scope", () => {
    const panes: LiveResourceSessionPanes = {
      "other-host": {
        "pane-1": pane({
          sessionId: "sess-other",
          workspaceId: "other-host",
          tmuxWindowName: "1",
        }),
      },
    };
    expect(findLiveResourceSessionLocation(panes, HOST, "sess-other")).toBeNull();
  });

  test("duplicate sessionIds use last-write-wins in enumeration order", () => {
    const extraPaint = makeCenterSpaceKey(HOST, EXTRA);
    const panes: LiveResourceSessionPanes = {
      [HOST]: {
        "pane-first": pane({
          sessionId: "shared",
          workspaceId: HOST,
          tmuxWindowName: "1",
        }),
      },
      [extraPaint]: {
        "pane-second": pane({
          sessionId: "shared",
          workspaceId: HOST,
          tmuxWindowName: `cs__${EXTRA}__2`,
        }),
      },
    };
    expect(findLiveResourceSessionLocation(panes, HOST, "shared")).toEqual({
      hostId: HOST,
      spaceId: EXTRA,
      paintContextId: extraPaint,
      terminalTabId: FIXED_TERMINAL_TAB_VALUE,
      paneId: "pane-second",
      sessionId: "shared",
      tmuxWindowName: `cs__${EXTRA}__2`,
    });
  });

  test("skips a pane with a null sessionId instead of guessing neighbors", () => {
    const panes: LiveResourceSessionPanes = {
      [HOST]: {
        orphan: pane({
          sessionId: null,
          workspaceId: HOST,
          tmuxWindowName: "1",
        }),
        neighbor: pane({
          sessionId: "sess-neighbor",
          workspaceId: HOST,
          tmuxWindowName: "2",
        }),
      },
    };
    expect(findLiveResourceSessionLocation(panes, HOST, null)).toBeNull();
    expect(findLiveResourceSessionLocation(panes, HOST, "sess-neighbor")?.paneId).toBe(
      "neighbor",
    );
  });
});
