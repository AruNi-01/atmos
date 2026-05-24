// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { CanvasAgentError } from "../lib/canvas-agent-errors";
import { sanitizeTldrawColor } from "../lib/canvas-agent-tldraw-style";

describe("canvas-agent-tldraw-style", () => {
  it("maps light-orange to orange", () => {
    const { value, normalized } = sanitizeTldrawColor("light-orange");
    expect(value).toBe("orange");
    expect(normalized).toBe(true);
  });

  it("rejects unknown colors", () => {
    expect(() => sanitizeTldrawColor("neon-pink")).toThrow(CanvasAgentError);
  });
});
