// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_CENTER_SPACE_ID,
  makeCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import { FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/store/use-terminal-store";
import {
  buildCanvasTerminalSourcePath,
  canvasTerminalMatchesAgentTarget,
  resolveCanvasTerminalSourceTarget,
} from "../lib/canvas-terminal-source";

const EXTRA_SPACE_ID = "space-abc";
const EXTRA_PAINT = makeCenterSpaceKey("ws-1", EXTRA_SPACE_ID);
const EXTRA_TMUX = `cs__${EXTRA_SPACE_ID}__1`;

describe("resolveCanvasTerminalSourceTarget", () => {
  it("keeps default-space pins on the host id", () => {
    expect(
      resolveCanvasTerminalSourceTarget({
        workspaceId: "ws-1",
        tmuxWindowName: "1",
        contextScope: "workspace",
        sourceTerminalTabId: "terminal",
      }),
    ).toEqual({
      hostId: "ws-1",
      spaceId: DEFAULT_CENTER_SPACE_ID,
      paintContextId: "ws-1",
      contextScope: "workspace",
      tmuxWindowName: "1",
      sourceTerminalTabId: "terminal",
    });
  });

  it("recovers extra-space paint keys without putting them in the URL id", () => {
    const target = resolveCanvasTerminalSourceTarget({
      workspaceId: EXTRA_PAINT,
      tmuxWindowName: EXTRA_TMUX,
      contextScope: "workspace",
      sourceTerminalTabId: "terminal-tab:2",
    });
    expect(target.hostId).toBe("ws-1");
    expect(target.spaceId).toBe(EXTRA_SPACE_ID);
    expect(target.paintContextId).toBe(EXTRA_PAINT);
    expect(target.sourceTerminalTabId).toBe("terminal-tab:2");
  });

  it("recovers extra space from a namespaced tmux window when workspaceId is the host", () => {
    const target = resolveCanvasTerminalSourceTarget({
      workspaceId: "ws-1",
      tmuxWindowName: EXTRA_TMUX,
      contextScope: "workspace",
      sourceTerminalTabId: "",
    });
    expect(target.hostId).toBe("ws-1");
    expect(target.spaceId).toBe(EXTRA_SPACE_ID);
    expect(target.paintContextId).toBe(EXTRA_PAINT);
    expect(target.sourceTerminalTabId).toBe(FIXED_TERMINAL_TAB_VALUE);
  });
});

describe("buildCanvasTerminalSourcePath", () => {
  it("uses the host workspace id, never a paint key", () => {
    const target = resolveCanvasTerminalSourceTarget({
      workspaceId: EXTRA_PAINT,
      tmuxWindowName: EXTRA_TMUX,
      contextScope: "workspace",
      sourceTerminalTabId: "terminal-tab:2",
    });
    const expected = new URLSearchParams({
      id: "ws-1",
      tab: "terminal-tab:2",
      terminalTmux: EXTRA_TMUX,
    });
    expect(buildCanvasTerminalSourcePath(target)).toBe(
      `/workspace?${expected.toString()}`,
    );
    expect(buildCanvasTerminalSourcePath(target)).not.toContain("::space::");
  });

  it("keeps project routes on the host project id", () => {
    const target = resolveCanvasTerminalSourceTarget({
      workspaceId: makeCenterSpaceKey("proj-1", EXTRA_SPACE_ID),
      tmuxWindowName: EXTRA_TMUX,
      contextScope: "project",
      sourceTerminalTabId: "terminal",
    });
    const expected = new URLSearchParams({
      id: "proj-1",
      tab: "terminal",
      terminalTmux: EXTRA_TMUX,
    });
    expect(buildCanvasTerminalSourcePath(target)).toBe(
      `/project?${expected.toString()}`,
    );
  });
});

describe("canvasTerminalMatchesAgentTarget", () => {
  it("matches extra-space pins by host id, not paint key", () => {
    expect(
      canvasTerminalMatchesAgentTarget(
        { workspaceId: EXTRA_PAINT, tmuxWindowName: EXTRA_TMUX },
        { contextId: "ws-1", tmuxWindowName: EXTRA_TMUX },
      ),
    ).toBe(true);
    expect(
      canvasTerminalMatchesAgentTarget(
        { workspaceId: EXTRA_PAINT, tmuxWindowName: EXTRA_TMUX },
        { contextId: EXTRA_PAINT, tmuxWindowName: EXTRA_TMUX },
      ),
    ).toBe(false);
  });
});

describe("canvas source jump wiring", () => {
  it("reveals source through the space-aware navigator, not a raw router.push", () => {
    const card = readFileSync(
      join(import.meta.dir, "../components/CanvasTerminalCard.tsx"),
      "utf8",
    );
    expect(card).toContain("navigateToCanvasTerminalSource(shape.props, router)");
    expect(card).not.toContain('params.set("id", shape.props.workspaceId)');
    expect(card).toContain("workspaceId={sourceTarget.hostId}");
    expect(card).toContain("openContextId={sourceTarget.paintContextId}");
    expect(card).toContain("stableAgentPaneId");

    const src = readFileSync(
      join(import.meta.dir, "../lib/canvas-terminal-source.ts"),
      "utf8",
    );
    const locateAt = src.indexOf("navigateToLocatedPane(");
    const switchAt = src.indexOf("switchCenterSpace(target.hostId, target.spaceId");
    const pushAt = src.lastIndexOf("commitLocatedPaneNavigation(router, path)");
    expect(locateAt).toBeGreaterThan(0);
    expect(switchAt).toBeGreaterThan(0);
    expect(pushAt).toBeGreaterThan(0);
    expect(pushAt).toBeLessThan(switchAt);
    expect(src).toContain("preserveDeepLink: true");
    expect(src).toContain("target.paintContextId");
  });

  it("kills tmux and looks up panes with host vs paint split", () => {
    const stage = readFileSync(
      join(import.meta.dir, "../../../app-shell/CenterStage.tsx"),
      "utf8",
    );
    expect(stage).toContain("resolveCanvasTerminalSourceTarget");
    expect(stage).toContain("killTmuxWindow(target.hostId, target.tmuxWindowName)");
    expect(stage).toContain("getPanes(target.paintContextId, terminalTabId)");
  });

  it("prunes and creates canvas terminals against the live paint context", () => {
    const view = readFileSync(
      join(import.meta.dir, "../components/CanvasView.tsx"),
      "utf8",
    );
    expect(view).toContain("workspaceTerminalTabs[paintContextId]");
    expect(view).toContain(
      "resolveCanvasTerminalSourceTarget(shape.props).paintContextId === paintContextId",
    );
    expect(view).toContain("resolveCenterOpenContextId");

    const add = readFileSync(
      join(import.meta.dir, "../hooks/use-add-canvas-terminal.ts"),
      "utf8",
    );
    expect(add).toContain("resolveCenterOpenContextId(hostId, hostContextId, paintContextId)");
  });
});
