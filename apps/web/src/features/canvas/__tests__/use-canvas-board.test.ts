// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import {
  createCanvasSnapshot,
  parseBoardDocument,
  resolveCanvasSessionForLoad,
} from "../hooks/use-canvas-board";

describe("parseBoardDocument", () => {
  it("accepts the expected v1 document wrapper", () => {
    expect(
      parseBoardDocument(
        JSON.stringify({
          schema: "canvas.v1",
          boardSlug: "default",
          tldrawDocument: null,
        }),
      ),
    ).toEqual({
      schema: "canvas.v1",
      boardSlug: "default",
      tldrawDocument: null,
    });
  });

  it("accepts legacy full snapshots by extracting only the document", () => {
    expect(
      parseBoardDocument(
        JSON.stringify({
          schema: "canvas.v1",
          boardSlug: "default",
          tldrawSnapshot: {
            document: { store: {}, schema: {} },
            session: { version: 0 },
          },
        }),
      ),
    ).toEqual({
      schema: "canvas.v1",
      boardSlug: "default",
      tldrawDocument: { store: {}, schema: {} },
    });
  });

  it("rejects invalid JSON instead of silently resetting the board", () => {
    expect(() => parseBoardDocument("{")).toThrow("invalid JSON");
  });

  it("rejects unsupported schemas instead of silently resetting the board", () => {
    expect(() =>
      parseBoardDocument(
        JSON.stringify({
          schema: "canvas.v2",
          boardSlug: "default",
          tldrawDocument: null,
        }),
      ),
    ).toThrow("Unsupported Canvas schema");
  });

  it("rejects unsupported board slugs instead of silently resetting the board", () => {
    expect(() =>
      parseBoardDocument(
        JSON.stringify({
          schema: "canvas.v1",
          boardSlug: "other",
          tldrawDocument: null,
        }),
      ),
    ).toThrow("Unsupported Canvas board slug");
  });

  it("hydrates legacy canvas terminal shapes with a null lastAttachedAt", () => {
    const snapshot = createCanvasSnapshot({
      store: {
        "shape:terminal": {
          id: "shape:terminal",
          typeName: "shape",
          type: "canvas-terminal",
          x: 0,
          y: 0,
          rotation: 0,
          index: "a1",
          parentId: "page:page",
          isLocked: false,
          opacity: 1,
          props: {
            w: 720,
            h: 420,
            contextScope: "workspace",
            workspaceId: "workspace-1",
            projectName: "Project",
            workspaceName: "Workspace",
            localPath: "/tmp",
            terminalName: "Terminal",
            tmuxWindowName: "Terminal",
            isNewTerminal: false,
            isPinned: false,
            pinKey: "",
          },
          meta: {},
        },
      },
      schema: {},
    } as never);

    expect(snapshot?.document.store["shape:terminal"]).toMatchObject({
      props: {
        lastAttachedAt: null,
      },
    });
  });
});

describe("resolveCanvasSessionForLoad", () => {
  it("defaults show-grid on for new sessions", () => {
    expect(resolveCanvasSessionForLoad(null).isGridMode).toBe(true);
    expect(resolveCanvasSessionForLoad({ version: 0 }).isGridMode).toBe(true);
  });

  it("keeps show-grid off when the user saved that preference", () => {
    expect(resolveCanvasSessionForLoad({ version: 0, isGridMode: false }).isGridMode).toBe(
      false,
    );
  });
});
