// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { getIndexAbove, getIndexBetween } from "@tldraw/utils";

import {
  createCanvasTerminalShapeProps,
  pinCanvasTerminalShapeInSnapshot,
  repairInvalidShapeIndicesInDocument,
} from "../lib/canvas-terminal-shape";
import { createCanvasSnapshot, createDefaultCanvasSession } from "../hooks/use-canvas-board";

function assertValidIndexKey(index: string) {
  const above = getIndexAbove(index as never);
  getIndexBetween(index as never, above);
}

function makeSnapshotWithShapes(count: number) {
  const store: Record<string, unknown> = {
    "page:page": {
      id: "page:page",
      typeName: "page",
      name: "Page 1",
      index: "a1",
      meta: {},
    },
  };

  let below: string | null = null;
  for (let i = 0; i < count; i += 1) {
    const id = `shape:geo-${i}`;
    const index = getIndexAbove(below as never);
    below = index;
    store[id] = {
      id,
      typeName: "shape",
      type: "geo",
      x: i * 10,
      y: i * 10,
      rotation: 0,
      index,
      parentId: "page:page",
      isLocked: false,
      opacity: 1,
      props: { geo: "rectangle", w: 100, h: 80 },
      meta: {},
    };
  }

  return createCanvasSnapshot({ store, schema: {} } as never, createDefaultCanvasSession())!;
}

describe("canvas terminal pin index", () => {
  it("assigns a valid tldraw index when pinning after many shapes", () => {
    const snapshot = makeSnapshotWithShapes(39);
    const result = pinCanvasTerminalShapeInSnapshot(
      snapshot,
      createCanvasTerminalShapeProps({
        contextScope: "workspace",
        workspaceId: "ws-1",
        projectName: "P",
        workspaceName: "W",
        localPath: "/tmp",
        terminalName: "term",
        tmuxWindowName: "term",
        sourceTerminalTabId: "terminal",
        isNewTerminal: true,
        isPinned: true,
        pinKey: "workspace:ws-1:term",
        w: 720,
        h: 420,
      }),
    );

    expect(result.inserted).toBe(true);
    const shape = result.snapshot?.document.store[result.shapeId] as { index?: string };
    expect(shape?.index).toBeDefined();
    expect(() => assertValidIndexKey(shape!.index!)).not.toThrow();
  });

  it("repairs legacy a40-style indices on load", () => {
    const snapshot = makeSnapshotWithShapes(2);
    const store = snapshot.document.store as Record<string, unknown>;
    store["shape:terminal"] = {
      id: "shape:terminal",
      typeName: "shape",
      type: "canvas-terminal",
      x: 0,
      y: 0,
      rotation: 0,
      index: "a40",
      parentId: "page:page",
      isLocked: false,
      opacity: 1,
      props: createCanvasTerminalShapeProps({
        contextScope: "workspace",
        workspaceId: "ws-1",
        projectName: "P",
        workspaceName: "W",
        localPath: "/tmp",
        terminalName: "term",
        tmuxWindowName: "term",
        sourceTerminalTabId: "terminal",
        isNewTerminal: false,
        isPinned: true,
        pinKey: "k",
        w: 720,
        h: 420,
      }),
      meta: {},
    };

    const repaired = repairInvalidShapeIndicesInDocument(snapshot.document);
    const terminal = repaired.store["shape:terminal"] as { index?: string };
    expect(() => assertValidIndexKey(terminal.index!)).not.toThrow();
    expect(terminal.index).not.toBe("a40");
  });
});
