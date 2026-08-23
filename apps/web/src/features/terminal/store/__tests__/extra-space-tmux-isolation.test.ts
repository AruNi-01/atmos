import { beforeEach, describe, expect, it } from "bun:test";
import {
  DEFAULT_CENTER_SPACE_ID,
  makeCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import {
  CODE_REVIEW_WINDOW_NAME,
  PROJECT_WIKI_WINDOW_NAME,
  createLayoutFromTmuxWindows,
  createTerminalPane,
  extraCenterSpaceTmuxWindowPrefix,
  isExtraCenterSpaceTmuxWindowName,
  namespacedTmuxWindowName,
  spaceIdFromTmuxWindowName,
  stableAgentPaneId,
} from "../terminal-store-helpers";
import {
  getTerminalWorkspaceScopeKey,
  useTerminalStore,
} from "../use-terminal-store";

const initialState = useTerminalStore.getInitialState();

describe("extra-space tmux window isolation", () => {
  const extra = makeCenterSpaceKey("ws-1", "space-abc");

  it("keeps host windows unprefixed and namespaces extra-space windows", () => {
    expect(namespacedTmuxWindowName("ws-1", "1")).toBe("1");
    expect(extraCenterSpaceTmuxWindowPrefix(extra)).toBe("cs__space-abc__");
    expect(namespacedTmuxWindowName(extra, "1")).toBe("cs__space-abc__1");
    expect(namespacedTmuxWindowName(extra, "Claude Code")).toBe(
      "cs__space-abc__Claude Code",
    );
    expect(namespacedTmuxWindowName(extra, "run-main")).toBe("cs__space-abc__run-main");
    expect(namespacedTmuxWindowName(extra, "run-3")).toBe("cs__space-abc__run-3");
    expect(namespacedTmuxWindowName("ws-1", "run-main")).toBe("run-main");
    expect(namespacedTmuxWindowName(extra, "cs__space-abc__1")).toBe(
      "cs__space-abc__1",
    );
    expect(namespacedTmuxWindowName(extra, PROJECT_WIKI_WINDOW_NAME)).toBe(
      PROJECT_WIKI_WINDOW_NAME,
    );
    expect(namespacedTmuxWindowName(extra, CODE_REVIEW_WINDOW_NAME)).toBe(
      CODE_REVIEW_WINDOW_NAME,
    );
  });

  it("marks extra-space window names without matching host numeric names", () => {
    expect(isExtraCenterSpaceTmuxWindowName("1")).toBe(false);
    expect(isExtraCenterSpaceTmuxWindowName("Claude Code")).toBe(false);
    expect(isExtraCenterSpaceTmuxWindowName("cs__space-abc__1")).toBe(true);
  });

  it("parses the owning space id from a tmux window name", () => {
    expect(spaceIdFromTmuxWindowName("1")).toBe(DEFAULT_CENTER_SPACE_ID);
    expect(spaceIdFromTmuxWindowName("Claude Code")).toBe(DEFAULT_CENTER_SPACE_ID);
    expect(spaceIdFromTmuxWindowName("cs__space-abc__1")).toBe("space-abc");
    expect(spaceIdFromTmuxWindowName("cs__space-abc__Claude Code")).toBe("space-abc");
    expect(spaceIdFromTmuxWindowName("cs__")).toBe(DEFAULT_CENTER_SPACE_ID);
    expect(stableAgentPaneId(extra, "cs__space-abc__1")).toBe("ws-1:cs__space-abc__1");
    expect(stableAgentPaneId("ws-1", "1")).toBe("ws-1:1");
  });

  it("stores host workspace id with a namespaced tmux window on extra-space panes", () => {
    const pane = createTerminalPane(extra, "1", {
      tmuxWindowName: "1",
      isNewPane: true,
    });
    expect(pane.label).toBe("1");
    expect(pane.workspaceId).toBe("ws-1");
    expect(pane.tmuxWindowName).toBe("cs__space-abc__1");
    expect(createTerminalPane("ws-1", "1", { isNewPane: true }).tmuxWindowName).toBe(
      "1",
    );
  });

  it("does not fold extra-space windows into the default space tmux layout", () => {
    const layout = createLayoutFromTmuxWindows("ws-1", [
      { index: 0, name: "1" },
      { index: 1, name: "cs__space-abc__1" },
    ]);
    expect(layout).not.toBeNull();
    const names = Object.values(layout!.panes).map((pane) => pane.tmuxWindowName);
    expect(names).toEqual(["1"]);
    expect(
      createLayoutFromTmuxWindows("ws-1", [{ index: 0, name: "cs__space-abc__1" }]),
    ).toBeNull();
  });
});

describe("createTerminalTab extra-space panes", () => {
  beforeEach(() => {
    useTerminalStore.setState(initialState, true);
  });

  it("does not reuse the host Term tmux window when creating a tab in another space", () => {
    const extra = makeCenterSpaceKey("ws-1", "space-abc");
    useTerminalStore.setState({
      loadedWorkspaces: new Set([
        getTerminalWorkspaceScopeKey("ws-1", false),
        getTerminalWorkspaceScopeKey(extra, false),
      ]),
      workspaceContexts: {
        "ws-1": false,
        [extra]: false,
      },
      workspaceTerminalTabs: {
        "ws-1": [{ id: "terminal", title: "Term", closable: true }],
      },
      saveToBackend: () => {},
    });

    const extraTab = useTerminalStore.getState().createTerminalTab(extra);
    const extraPane = Object.values(
      useTerminalStore.getState().getPanes(extra, extraTab.id),
    )[0];

    expect(extraPane?.label).toBe("1");
    expect(extraPane?.tmuxWindowName).toBe("cs__space-abc__1");
    expect(extraPane?.workspaceId).toBe("ws-1");
    expect(useTerminalStore.getState().workspaceTerminalTabs[extra]?.map((tab) => tab.id)).toEqual([
      extraTab.id,
    ]);
    expect(useTerminalStore.getState().workspaceTerminalTabs["ws-1"]?.map((tab) => tab.id)).toEqual([
      "terminal",
    ]);
  });
});
