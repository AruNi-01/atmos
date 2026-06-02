// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import type { TLShapeId } from "tldraw";
import type { Project } from "@/shared/types/domain";
import type { CreatedTerminalTabWithPane, RelatedCanvasTerminalEditor } from "../lib/create-related-canvas-terminal";
import {
  createRelatedCanvasTerminalShape,
  resolveRelatedCanvasTerminalFrameName,
} from "../lib/create-related-canvas-terminal";
import {
  createCanvasTerminalShapeProps,
  type CanvasTerminalShape,
} from "../lib/canvas-terminal-shape";

type Bounds = {
  x: number;
  y: number;
  w: number;
  h: number;
  maxX: number;
  maxY: number;
};

function bounds(x: number, y: number, w: number, h: number): Bounds {
  return { x, y, w, h, maxX: x + w, maxY: y + h };
}

function createTerminalShape(
  id: TLShapeId,
  parentId: string,
  overrides: Partial<CanvasTerminalShape["props"]> = {},
  recordOverrides: Partial<Pick<CanvasTerminalShape, "x" | "y" | "index">> = {},
): CanvasTerminalShape {
  return {
    id,
    typeName: "shape",
    type: "canvas-terminal",
    x: 100,
    y: 120,
    rotation: 0,
    index: "a1",
    parentId,
    isLocked: false,
    opacity: 1,
    props: createCanvasTerminalShapeProps({
      contextScope: "workspace",
      workspaceId: "workspace-1",
      projectName: "Project Alpha",
      workspaceName: "Workspace Alpha",
      localPath: "/tmp/workspace",
      terminalName: "1",
      tmuxWindowName: "1",
      sourceTerminalTabId: "terminal",
      isNewTerminal: false,
      ...overrides,
    }),
    meta: {},
    ...recordOverrides,
  };
}

function createdTerminal(): CreatedTerminalTabWithPane {
  return {
    tab: {
      id: "terminal-tab:new",
      title: "Term - 1",
      closable: true,
    },
    paneId: "pane-new",
    pane: {
      id: "pane-new",
      label: "2",
      sessionId: "session-new",
      workspaceId: "workspace-1",
      tmuxWindowName: "2",
      isNewPane: true,
    },
  };
}

class FakeRelatedCanvasEditor implements RelatedCanvasTerminalEditor {
  shapes = new Map<string, Record<string, unknown>>();
  shapeBounds = new Map<string, Bounds>();
  reparentCalls: Array<{ ids: string[]; parentId: string }> = [];

  constructor(records: Array<Record<string, unknown> & { id: string; parentId?: string }>) {
    for (const record of records) {
      this.shapes.set(record.id, record);
      const props = record.props as { w?: number; h?: number } | undefined;
      const x = typeof record.x === "number" ? record.x : 0;
      const y = typeof record.y === "number" ? record.y : 0;
      this.shapeBounds.set(record.id, bounds(x, y, props?.w ?? 640, props?.h ?? 440));
    }
  }

  createShape = (shape: Record<string, unknown> & { id: string; type: string; props?: Record<string, unknown> }) => {
    const record = {
      typeName: "shape",
      rotation: 0,
      index: "a1",
      parentId: "page:page",
      isLocked: false,
      opacity: 1,
      meta: {},
      ...shape,
    };
    this.shapes.set(shape.id, record);
    const props = shape.props as { w?: number; h?: number } | undefined;
    const x = typeof shape.x === "number" ? shape.x : 0;
    const y = typeof shape.y === "number" ? shape.y : 0;
    this.shapeBounds.set(shape.id, bounds(x, y, props?.w ?? 640, props?.h ?? 440));
    return this as never;
  };

  getShape = (id: TLShapeId) => {
    return this.shapes.get(id) as never;
  };

  getCurrentPageShapes = () => {
    return Array.from(this.shapes.values()) as never;
  };

  getShapePageBounds = (id: TLShapeId) => {
    return this.shapeBounds.get(id) as never;
  };

  reparentShapes = (ids: TLShapeId[], parentId: TLShapeId) => {
    this.reparentCalls.push({ ids: ids.map(String), parentId: String(parentId) });
    for (const id of ids) {
      const shape = this.shapes.get(id);
      if (shape) {
        shape.parentId = parentId;
      }
    }
    return this as never;
  };

  updateShape = (shape: { id: TLShapeId; type?: string; x?: number; y?: number; props?: Record<string, unknown> }) => {
    const current = this.shapes.get(shape.id);
    if (current) {
      if (typeof shape.x === "number") {
        current.x = shape.x;
      }
      if (typeof shape.y === "number") {
        current.y = shape.y;
      }
      current.props = { ...(current.props as object), ...shape.props };
      const currentBounds = this.shapeBounds.get(shape.id);
      if (currentBounds) {
        const props = current.props as { w?: number; h?: number };
        const x = typeof current.x === "number" ? current.x : currentBounds.x;
        const y = typeof current.y === "number" ? current.y : currentBounds.y;
        this.shapeBounds.set(shape.id, bounds(x, y, props.w ?? currentBounds.w, props.h ?? currentBounds.h));
      }
    }
    return this as never;
  };
}

describe("createRelatedCanvasTerminalShape", () => {
  it("adds a new canvas terminal to the current frame", () => {
    const frame = {
      id: "shape:frame",
      typeName: "shape",
      type: "frame",
      x: 80,
      y: 80,
      parentId: "page:page",
      props: { w: 900, h: 520, name: "Existing frame" },
    };
    const current = createTerminalShape("shape:current" as TLShapeId, "shape:frame");
    const editor = new FakeRelatedCanvasEditor([frame, current]);

    const result = createRelatedCanvasTerminalShape({
      editor,
      shape: current,
      created: createdTerminal(),
      frameName: "Ignored",
      createId: () => "shape:new-terminal" as TLShapeId,
    });

    expect(result?.newShapeId).toBe("shape:new-terminal");
    expect(editor.shapes.get("shape:new-terminal")?.parentId).toBe("shape:frame");
    expect(editor.reparentCalls).toEqual([
      { ids: ["shape:new-terminal"], parentId: "shape:frame" },
    ]);
    expect((editor.shapes.get("shape:new-terminal")?.props as CanvasTerminalShape["props"]).sourceTerminalTabId).toBe("terminal-tab:new");
  });

  it("creates a frame around both terminals when the current terminal is unframed", () => {
    const current = createTerminalShape("shape:current" as TLShapeId, "page:page");
    const editor = new FakeRelatedCanvasEditor([current]);
    const ids = ["shape:new-terminal", "shape:new-frame"];

    const result = createRelatedCanvasTerminalShape({
      editor,
      shape: current,
      created: createdTerminal(),
      frameName: "Workspace Display",
      createId: () => ids.shift() as TLShapeId,
    });

    expect(result?.newShapeId).toBe("shape:new-terminal");
    expect(editor.shapes.get("shape:current")?.parentId).toBe("shape:new-frame");
    expect(editor.shapes.get("shape:new-terminal")?.parentId).toBe("shape:new-frame");
    expect((editor.shapes.get("shape:new-frame")?.props as { name?: string }).name).toBe("Workspace Display");
    expect(editor.reparentCalls).toEqual([
      { ids: ["shape:current", "shape:new-terminal"], parentId: "shape:new-frame" },
    ]);
  });

  it("places the related terminal on the left when the right slot is occupied", () => {
    const frame = {
      id: "shape:frame",
      typeName: "shape",
      type: "frame",
      x: -700,
      y: 80,
      parentId: "page:page",
      props: { w: 2400, h: 620, name: "Existing frame" },
    };
    const current = createTerminalShape("shape:current" as TLShapeId, "shape:frame");
    const right = createTerminalShape(
      "shape:right" as TLShapeId,
      "shape:frame",
      { tmuxWindowName: "right", terminalName: "right" },
      { x: 852, y: 120, index: "a2" },
    );
    const editor = new FakeRelatedCanvasEditor([frame, current, right]);

    createRelatedCanvasTerminalShape({
      editor,
      shape: current,
      created: createdTerminal(),
      frameName: "Ignored",
      createId: () => "shape:new-terminal" as TLShapeId,
    });

    expect(editor.shapes.get("shape:new-terminal")?.x).toBe(-652);
    expect(editor.shapes.get("shape:new-terminal")?.y).toBe(120);
    expect(editor.shapes.get("shape:right")?.x).toBe(852);
  });

  it("pushes right-side terminals when every adjacent slot is occupied", () => {
    const frame = {
      id: "shape:frame",
      typeName: "shape",
      type: "frame",
      x: -700,
      y: -360,
      parentId: "page:page",
      props: { w: 2600, h: 1400, name: "Existing frame" },
    };
    const current = createTerminalShape("shape:current" as TLShapeId, "shape:frame");
    const right = createTerminalShape("shape:right" as TLShapeId, "shape:frame", {}, { x: 852, y: 120, index: "a2" });
    const farRight = createTerminalShape("shape:far-right" as TLShapeId, "shape:frame", {}, { x: 1604, y: 120, index: "a3" });
    const left = createTerminalShape("shape:left" as TLShapeId, "shape:frame", {}, { x: -652, y: 120, index: "a4" });
    const below = createTerminalShape("shape:below" as TLShapeId, "shape:frame", {}, { x: 100, y: 572, index: "a5" });
    const above = createTerminalShape("shape:above" as TLShapeId, "shape:frame", {}, { x: 100, y: -332, index: "a6" });
    const editor = new FakeRelatedCanvasEditor([frame, current, right, farRight, left, below, above]);

    createRelatedCanvasTerminalShape({
      editor,
      shape: current,
      created: createdTerminal(),
      frameName: "Ignored",
      createId: () => "shape:new-terminal" as TLShapeId,
    });

    expect(editor.shapes.get("shape:new-terminal")?.x).toBe(852);
    expect(editor.shapes.get("shape:new-terminal")?.y).toBe(120);
    expect(editor.shapes.get("shape:right")?.x).toBe(1604);
    expect(editor.shapes.get("shape:far-right")?.x).toBe(2356);
    expect(editor.shapes.get("shape:left")?.x).toBe(-652);
    expect((editor.shapes.get("shape:frame")?.props as { w?: number }).w).toBe(3800);
  });
});

describe("resolveRelatedCanvasTerminalFrameName", () => {
  const project: Project = {
    id: "project-1",
    name: "Project One",
    isOpen: true,
    mainFilePath: "/tmp/project",
    sidebarOrder: 0,
    borderColor: null,
    logoPath: null,
    workspaces: [
      {
        id: "workspace-1",
        name: "workspace-branch",
        displayName: "Workspace Display",
        branch: "workspace-branch",
        baseBranch: "main",
        isActive: true,
        status: "clean",
        projectId: "project-1",
        isPinned: false,
        isArchived: false,
        createdAt: "2026-06-02T00:00:00Z",
        workflowStatus: "todo",
        priority: "no_priority",
        labels: [],
        localPath: "/tmp/workspace",
        createSource: "manual",
      },
    ],
  };

  it("prefers workspace display name over workspace name", () => {
    const shape = createTerminalShape("shape:workspace" as TLShapeId, "page:page");

    expect(resolveRelatedCanvasTerminalFrameName([project], shape)).toBe("Workspace Display");
  });

  it("uses project name for project-level terminal frames", () => {
    const shape = createTerminalShape("shape:project" as TLShapeId, "page:page", {
      contextScope: "project",
      workspaceId: "project-1",
      projectName: "Project fallback",
      workspaceName: "Main",
    });

    expect(resolveRelatedCanvasTerminalFrameName([project], shape)).toBe("Project One");
  });
});
