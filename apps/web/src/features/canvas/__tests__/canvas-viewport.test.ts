// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  hasTrustedSessionViewport,
  isTrustedPageCamera,
  sanitizeCanvasSessionForPersist,
} from "../lib/canvas-viewport";

describe("isTrustedPageCamera", () => {
  it("rejects missing or corrupt axes", () => {
    expect(isTrustedPageCamera(undefined)).toBe(false);
    expect(isTrustedPageCamera({ x: 0, y: 0, z: 0 })).toBe(false);
    expect(isTrustedPageCamera({ x: Number.NaN, y: 0, z: 1 })).toBe(false);
    expect(isTrustedPageCamera({ x: 0, y: 2e10, z: 1 })).toBe(false);
  });

  it("accepts finite in-range cameras", () => {
    expect(isTrustedPageCamera({ x: 0, y: 0, z: 1 })).toBe(true);
    expect(isTrustedPageCamera({ x: -120, y: 340, z: 0.5 })).toBe(true);
  });
});

describe("hasTrustedSessionViewport", () => {
  it("returns false for empty or missing session", () => {
    expect(hasTrustedSessionViewport(null, "page:page")).toBe(false);
    expect(hasTrustedSessionViewport({ version: 0 }, "page:page")).toBe(false);
  });

  it("returns true when the page has a trusted camera", () => {
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

  it("returns false when only zoom is valid but pan is corrupt", () => {
    expect(
      hasTrustedSessionViewport(
        {
          version: 0,
          pageStates: [{ pageId: "page:page", camera: { x: 9e12, y: 0, z: 1 } }],
        },
        "page:page",
      ),
    ).toBe(false);
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

  it("strips cameras with extreme pan offsets", () => {
    const session = {
      version: 0,
      pageStates: [{ pageId: "page:a", camera: { x: 4e10, y: 0, z: 1 } }],
    };

    expect(sanitizeCanvasSessionForPersist(session).pageStates).toEqual([{ pageId: "page:a" }]);
  });

  it("returns the same reference when nothing changes", () => {
    const session = {
      version: 0,
      pageStates: [{ pageId: "page:a", camera: { x: 0, y: 0, z: 1 } }],
    };
    expect(sanitizeCanvasSessionForPersist(session)).toBe(session);
  });
});
