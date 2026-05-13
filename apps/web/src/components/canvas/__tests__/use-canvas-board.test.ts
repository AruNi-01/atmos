// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { parseBoardDocument } from "../use-canvas-board";

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
});
