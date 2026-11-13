import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { makeCenterSpaceKey } from "@/app-shell/center-space/center-space";
import { useTerminalStore } from "../../store/use-terminal-store";
import type { TerminalPaneProps } from "../../types/index";
import {
  readCachedDynamicTitle,
  readCachedOscTitle,
  resetCachedDynamicTitlesForTests,
  writeCachedDynamicTitle,
  writeCachedOscTitle,
} from "../terminal-dynamic-title-cache";
import { applyServerTerminalTitle } from "../terminal-server-title";

const initialState = useTerminalStore.getInitialState();
const owners = [
  { scope: makeCenterSpaceKey("ws-1", "space-b"), workspace: "ws-1", window: "cs__space-b__1" },
  { scope: makeCenterSpaceKey("ws-1", "space-c"), workspace: "ws-1", window: "cs__space-c__1" },
  { scope: "ws-1", workspace: "ws-1", window: "1" },
  { scope: "ws-2", workspace: "ws-2", window: "1" },
];

beforeEach(() => {
  resetCachedDynamicTitlesForTests();
  useTerminalStore.setState(initialState, true);
  const workspacePanes: Record<string, Record<string, TerminalPaneProps>> = {};
  for (const owner of owners) {
    const pane: TerminalPaneProps = {
      id: owner.scope,
      label: "1",
      sessionId: `session-${owner.scope}`,
      workspaceId: owner.workspace,
      tmuxWindowName: owner.window,
      dynamicTitle: "grok",
      oscTitle: `Topic for ${owner.scope}`,
    };
    workspacePanes[owner.scope] = { [pane.id]: pane };
    writeCachedDynamicTitle(owner.workspace, owner.window, pane.dynamicTitle);
    writeCachedOscTitle(owner.workspace, owner.window, pane.oscTitle);
  }
  useTerminalStore.setState({ workspacePanes });
});

afterEach(() => {
  useTerminalStore.setState(initialState, true);
  resetCachedDynamicTitlesForTests();
});

describe("applyServerTerminalTitle space isolation", () => {
  for (const owner of owners) {
    it(`updates only ${owner.workspace}/${owner.window} panes and cache`, () => {
      const previous = useTerminalStore.getState().workspacePanes;
      applyServerTerminalTitle({
        workspace_id: owner.workspace,
        tmux_window_name: owner.window,
        session_id: `session-${owner.scope}`,
        dynamic_title: "new-command",
        session_title: "Updated topic",
      });

      const next = useTerminalStore.getState().workspacePanes;
      for (const candidate of owners) {
        const matches = candidate === owner;
        const dynamicTitle = matches ? "new-command" : "grok";
        const oscTitle = matches ? "Updated topic" : `Topic for ${candidate.scope}`;
        expect(next[candidate.scope]?.[candidate.scope]?.dynamicTitle).toBe(dynamicTitle);
        expect(next[candidate.scope]?.[candidate.scope]?.oscTitle).toBe(oscTitle);
        expect(readCachedDynamicTitle(candidate.workspace, candidate.window)).toBe(dynamicTitle);
        expect(readCachedOscTitle(candidate.workspace, candidate.window)).toBe(oscTitle);
        if (!matches) expect(next[candidate.scope]).toBe(previous[candidate.scope]);
      }
    });
  }

  it("uses the exact owner's topic when replaying a title without a new topic", () => {
    applyServerTerminalTitle({
      workspace_id: "ws-1",
      tmux_window_name: "1",
      session_id: "session-ws-1",
      dynamic_title: "grok",
      session_title: null,
    });

    for (const owner of owners) {
      expect(readCachedDynamicTitle(owner.workspace, owner.window)).toBe("grok");
      expect(readCachedOscTitle(owner.workspace, owner.window)).toBe(`Topic for ${owner.scope}`);
      expect(useTerminalStore.getState().workspacePanes[owner.scope]?.[owner.scope]?.oscTitle).toBe(
        `Topic for ${owner.scope}`,
      );
    }
  });
});
