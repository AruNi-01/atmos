import { describe, expect, it } from "bun:test";
import {
  HIDDEN_TERMINAL_WRITE_BUFFER_MAX,
  shouldPaintTerminalSurface,
  trimHiddenTerminalWriteBuffer,
} from "../terminal-hidden-write";

describe("hidden terminal write buffer", () => {
  it("paints only the visible tab in the visually active workspace", () => {
    expect(
      shouldPaintTerminalSurface({
        visuallyActiveWorkspace: true,
        keepAlivePanel: false,
      }),
    ).toBe(true);
    expect(
      shouldPaintTerminalSurface({
        visuallyActiveWorkspace: true,
        keepAlivePanel: true,
      }),
    ).toBe(false);
    expect(
      shouldPaintTerminalSurface({
        visuallyActiveWorkspace: false,
        keepAlivePanel: false,
      }),
    ).toBe(false);
  });

  it("drops oldest bytes when the hidden buffer exceeds the cap", () => {
    const chunks = ["aaaa", "bbbb", "cccc", "dddd"];
    const trimmed = trimHiddenTerminalWriteBuffer(chunks, 8);
    expect(trimmed.join("")).toHaveLength(8);
    expect(trimmed.join("")).toBe("ccccdddd");
    expect(
      trimHiddenTerminalWriteBuffer(["hello"], HIDDEN_TERMINAL_WRITE_BUFFER_MAX),
    ).toEqual(["hello"]);
  });
});
