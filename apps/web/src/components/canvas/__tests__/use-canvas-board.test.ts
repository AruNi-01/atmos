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
          tldrawSnapshot: null,
        }),
      ),
    ).toEqual({
      schema: "canvas.v1",
      boardSlug: "default",
      tldrawSnapshot: null,
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
          tldrawSnapshot: null,
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
          tldrawSnapshot: null,
        }),
      ),
    ).toThrow("Unsupported Canvas board slug");
  });
});
