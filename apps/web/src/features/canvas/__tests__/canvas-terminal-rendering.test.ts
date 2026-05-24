// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import {
  getRestoredRenderedShapeIds,
  promoteRenderedShapeId,
  trimRenderedShapeIds,
} from "../lib/canvas-terminal-rendering";
import { createCanvasTerminalShapeProps, type CanvasTerminalShape } from "../lib/canvas-terminal-shape";

function createShape(
  id: string,
  lastAttachedAt: number | null,
): CanvasTerminalShape {
  return {
    id,
    typeName: "shape",
    type: "canvas-terminal",
    x: 0,
    y: 0,
    rotation: 0,
    index: "a1",
    parentId: "page:page",
    isLocked: false,
    opacity: 1,
    props: createCanvasTerminalShapeProps({
      contextScope: "workspace",
      workspaceId: "workspace-1",
      projectName: "Project",
      workspaceName: "Workspace",
      localPath: "/tmp",
      terminalName: id,
      tmuxWindowName: id,
      isNewTerminal: false,
      lastAttachedAt,
    }),
    meta: {},
  };
}

describe("canvas terminal rendering helpers", () => {
  it("restores the most recently attached terminals first", () => {
    const shapes = [
      createShape("shape:oldest", 10),
      createShape("shape:newest", 30),
      createShape("shape:middle", 20),
      createShape("shape:invalid", Number.NaN),
      createShape("shape:never", null),
    ];

    expect(getRestoredRenderedShapeIds(shapes, 2)).toEqual(["shape:newest", "shape:middle"]);
  });

  it("evicts the oldest rendered terminal when promoting a new one past the cap", () => {
    const shapes = [
      createShape("shape:a", 100),
      createShape("shape:b", 200),
      createShape("shape:c", null),
    ];

    expect(promoteRenderedShapeId(shapes, ["shape:b", "shape:a"], "shape:c", 300, 2)).toEqual([
      "shape:c",
      "shape:b",
    ]);
  });

  it("trims rendered terminals by oldest attach time", () => {
    const shapes = [
      createShape("shape:a", 100),
      createShape("shape:b", 200),
      createShape("shape:c", 300),
    ];

    expect(trimRenderedShapeIds(shapes, ["shape:a", "shape:b", "shape:c"], 2)).toEqual([
      "shape:c",
      "shape:b",
    ]);
  });
});

describe("createCanvasTerminalShapeProps", () => {
  it("defaults lastAttachedAt to null for existing callers", () => {
    expect(
      createCanvasTerminalShapeProps({
        contextScope: "workspace",
        workspaceId: "workspace-1",
        projectName: "Project",
        workspaceName: "Workspace",
        localPath: "/tmp",
        terminalName: "Terminal",
        tmuxWindowName: "Terminal",
        isNewTerminal: false,
      }).lastAttachedAt,
    ).toBeNull();
  });
});
