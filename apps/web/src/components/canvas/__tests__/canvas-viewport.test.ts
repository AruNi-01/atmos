// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  hasTrustedSessionViewport,
  sanitizeCanvasSessionForPersist,
} from "../canvas-viewport";

describe("hasTrustedSessionViewport", () => {
  it("returns false for empty or missing session", () => {
    expect(hasTrustedSessionViewport(null, "page:page")).toBe(false);
    expect(hasTrustedSessionViewport({ version: 0 }, "page:page")).toBe(false);
  });

  it("returns true when the page has a finite camera zoom", () => {
    expect(
      hasTrustedSessionViewport(
        {
          version: 0,
          pageStates: [{ pageId: "page:page", camera: { x: 0, y: 0, z: 1 } }],
        },
        "page:page",
      ),
    ).toBe(true);
  });
});

describe("sanitizeCanvasSessionForPersist", () => {
  it("strips page cameras with invalid zoom before persisting", () => {
    const session = {
      version: 0,
      pageStates: [
        { pageId: "page:a", camera: { x: 0, y: 0, z: 0 } },
        { pageId: "page:b", camera: { x: 1, y: 2, z: 0.5 } },
      ],
    };

    const sanitized = sanitizeCanvasSessionForPersist(session);
    expect(sanitized.pageStates).toEqual([
      { pageId: "page:a" },
      { pageId: "page:b", camera: { x: 1, y: 2, z: 0.5 } },
    ]);
  });

  it("returns the same reference when nothing changes", () => {
    const session = {
      version: 0,
      pageStates: [{ pageId: "page:a", camera: { x: 0, y: 0, z: 1 } }],
    };
    expect(sanitizeCanvasSessionForPersist(session)).toBe(session);
  });
});
