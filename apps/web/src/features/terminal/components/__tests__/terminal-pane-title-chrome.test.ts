// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dir;

function readSibling(name: string): string {
  return readFileSync(join(dir, "..", name), "utf8");
}

describe("terminal pane title chrome", () => {
  it("paints the custom toolbar title instead of hiding the old split-lib class", () => {
    const css = readSibling("terminal-grid.css");
    const workspace = readSibling("TerminalWorkspacePane.tsx");
    const scoped = readSibling("TerminalScopedPane.tsx");

    expect(workspace).toContain('className="terminal-pane-title gap-1.5"');
    expect(scoped).toContain('className="terminal-pane-title gap-1.5"');
    expect(css).toContain(".terminal-pane-title");
    expect(css).not.toMatch(
      /\.terminal-split-theme\s+\.terminal-pane-title\s*\{[^}]*display:\s*none/,
    );
  });

  it("docks split panes by dragging the title handle onto an edge", () => {
    const split = readSibling("TerminalSplitView.tsx");
    const css = readSibling("terminal-grid.css");
    const workspace = readSibling("TerminalWorkspacePane.tsx");
    const scoped = readSibling("TerminalScopedPane.tsx");
    expect(split).toContain("DndContext");
    expect(split).toContain("collectTerminalLayoutGeometry");
    expect(split).toContain("key={leaf.id}");
    expect(split).toContain("dockLeafInLayoutTree");
    expect(split).toContain("dockLeafAtRoot");
    expect(split).toContain("useDraggable");
    expect(split).toContain("useDroppable");
    expect(split).toContain("terminal-dock-preview");
    expect(split).toContain("capturePanePreview");
    expect(split).toContain("toolbarHtml");
    expect(split).toContain("dangerouslySetInnerHTML");
    expect(split).toContain("scaleTerminalDragPreview");
    expect(split).toContain("dragPreviewGrabOffset");
    expect(split).toContain("createPortal");
    expect(split).toContain("document.body");
    expect(split).toContain("terminalLayoutTopologyEqual");
    expect(split).toContain("is-spawned");
    expect(split).toContain("captureTerminalSnapshot");
    expect(split).toContain("capturePane");
    expect(split).not.toContain("collapseFirst");
    expect(css).toContain(".terminal-pane-drag-ghost-header");
    expect(css).toContain(".terminal-pane-drag-ghost.is-spawned");
    expect(css).toContain(".terminal-pane-drag-ghost-shot");
    expect(workspace).toContain("TerminalPaneDragHandle");
    expect(scoped).toContain("TerminalPaneDragHandle");
  });

  it("follows center-stage rounded-xl at bottom card corners so the attention pulse is not clipped", () => {
    const css = readSibling("terminal-grid.css");
    const split = readSibling("TerminalSplitView.tsx");
    expect(css).toContain("[data-edge-bottom][data-edge-left] .terminal-pane.agent-attention-ring::after");
    expect(css).toContain("[data-edge-bottom][data-edge-right] .terminal-pane.agent-attention-ring::after");
    expect(css).toContain("border-bottom-left-radius: var(--radius-xl)");
    expect(css).toContain("border-bottom-right-radius: var(--radius-xl)");
    expect(split).toContain("unitSquareEdgeFlags");
    expect(split).toContain("data-edge-bottom");
    expect(split).toContain("data-edge-left");
    expect(split).toContain("data-edge-right");
  });

  it("rounds dock-preview corners that sit on the mosaic outer edges", () => {
    const css = readSibling("terminal-grid.css");
    const split = readSibling("TerminalSplitView.tsx");
    expect(css).toContain('.terminal-dock-preview[data-edge-top][data-edge-left][data-edge="top"]::after');
    expect(css).toContain('.terminal-dock-preview[data-edge-top][data-edge-left][data-edge="left"]::after');
    expect(css).toContain('.terminal-dock-preview[data-edge-bottom][data-edge-left][data-edge="bottom"]::after');
    expect(css).toContain('.terminal-dock-preview[data-edge-bottom][data-edge-right][data-edge="bottom"]::after');
    expect(css).toContain("border-top-left-radius: var(--radius-xl)");
    expect(split).toContain("data-edge-top");
    expect(split).toContain("edges={edges}");
  });
});

