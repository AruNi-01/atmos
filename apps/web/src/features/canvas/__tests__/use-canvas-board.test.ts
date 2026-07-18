// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import {
  ATMOS_CANVAS_FILE_SCHEMA,
  createCanvasSnapshot,
  parseAtmosCanvasFile,
  parseBoardDocument,
  resolveCanvasSessionForLoad,
} from "../hooks/use-canvas-board";

describe("parseAtmosCanvasFile", () => {
  it("accepts atmos-canvas-file.1 envelope", () => {
    expect(
      parseAtmosCanvasFile({
        schema: ATMOS_CANVAS_FILE_SCHEMA,
        title: "Ops Desk",
        tldrawDocument: null,
      }),
    ).toEqual({
      schema: ATMOS_CANVAS_FILE_SCHEMA,
      title: "Ops Desk",
      tldrawDocument: null,
      session: null,
    });
  });

  it("rejects unsupported schemas", () => {
    expect(() =>
      parseAtmosCanvasFile({
        schema: "canvas.v1",
        title: "x",
        tldrawDocument: null,
      }),
    ).toThrow("Unsupported Canvas schema");
  });

  it("parseBoardDocument accepts JSON string of the new envelope", () => {
    expect(
      parseBoardDocument(
        JSON.stringify({
          schema: ATMOS_CANVAS_FILE_SCHEMA,
          title: "A",
          tldrawDocument: null,
        }),
      ),
    ).toEqual({
      schema: ATMOS_CANVAS_FILE_SCHEMA,
      title: "A",
      tldrawDocument: null,
      session: null,
    });
  });

  it("rejects invalid JSON instead of silently resetting the board", () => {
    expect(() => parseBoardDocument("{")).toThrow("invalid JSON");
  });

  it("hydrates canvas terminal shapes with createCanvasSnapshot", () => {
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
            w: 100,
            h: 100,
            workspaceId: "ws",
            tmuxWindowName: "1",
            contextScope: "workspace",
            projectName: "p",
            workspaceName: "w",
            localPath: "/tmp",
            terminalName: "t",
            isNewTerminal: false,
            isPinned: true,
            pinKey: "k",
            sourceTerminalTabId: "terminal",
          },
          meta: {},
        },
      },
      schema: { schemaVersion: 0, sequences: {} },
    } as never);
    expect(snapshot?.document).toBeTruthy();
  });

  it("resolveCanvasSessionForLoad defaults isGridMode true", () => {
    expect(resolveCanvasSessionForLoad(null).isGridMode).toBe(true);
  });
});
