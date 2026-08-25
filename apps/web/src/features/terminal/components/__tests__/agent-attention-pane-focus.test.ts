import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dir;

function readSibling(name: string): string {
  return readFileSync(join(dir, "..", name), "utf8");
}

describe("agent attention pane focus ack", () => {
  it("keeps the ring on programmatic focus and drops it on pane click", () => {
    const grid = readSibling("TerminalGrid.tsx");
    const focusPaneAt = grid.indexOf("const focusPane = useCallback");
    const focusPaneByOffsetAt = grid.indexOf("const focusPaneByOffset = useCallback");
    const focusByTmuxAt = grid.indexOf("focusPaneByTmuxWindowName:");
    expect(focusPaneAt).toBeGreaterThan(0);
    expect(focusPaneByOffsetAt).toBeGreaterThan(focusPaneAt);
    expect(focusByTmuxAt).toBeGreaterThan(focusPaneByOffsetAt);
    const focusPane = grid.slice(focusPaneAt, focusPaneByOffsetAt);
    expect(focusPane).toContain('ack: PaneFocusAck = "deferred"');
    expect(focusPane).toContain("setActivePaneIdWithAttention(paneId, ack)");
    expect(grid.slice(focusPaneByOffsetAt, focusByTmuxAt)).toContain(
      "focusPane(paneOrder[nextIndex])",
    );
    expect(grid.slice(focusPaneByOffsetAt, focusByTmuxAt)).not.toContain(
      'focusPane(paneOrder[nextIndex], "immediate")',
    );
    expect(grid.slice(focusByTmuxAt, focusByTmuxAt + 400)).toContain("focusPane(paneId)");
  });

  it("treats mouse down as user ack and focus capture as auto-focus", () => {
    const workspace = readSibling("TerminalWorkspacePane.tsx");
    const scoped = readSibling("TerminalScopedPane.tsx");
    for (const src of [workspace, scoped]) {
      expect(src).toContain('onMouseDownCapture={() => setActivePaneId(id, "immediate")}');
      expect(src).toContain('onFocusCapture={() => setActivePaneId(id, "deferred")}');
    }
    expect(workspace).toContain('setActivePaneId(paneId, "deferred")');
  });

  it("defers canvas widget jumps and side-chat restore, and acks pointer down", () => {
    const canvasFocus = readFileSync(
      join(dir, "../../../canvas/lib/canvas-terminal-focus.ts"),
      "utf8",
    );
    const canvasCard = readFileSync(
      join(dir, "../../../canvas/components/CanvasTerminalCard.tsx"),
      "utf8",
    );
    const sideChat = readSibling("TerminalSideChatModal.tsx");
    expect(canvasFocus).toContain('ack: "deferred"');
    expect(canvasCard).toContain(
      "Cover non-click activation paths (e.g. agent-status widget → focusCanvasTerminalShape).",
    );
    expect(canvasCard).toContain('ack: "deferred"');
    expect(canvasCard).toContain(
      "useAgentAttentionStore.getState().notifyPaneFocused(stablePaneId);",
    );
    expect(sideChat).toContain('ack: PaneFocusAck = "deferred"');
    expect(sideChat).toContain('claimSideChatFocus(activeSideChatId, "immediate")');
    expect(sideChat).toContain('ack: "immediate"');
  });
});
