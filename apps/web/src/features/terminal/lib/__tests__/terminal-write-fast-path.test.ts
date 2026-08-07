// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { shouldAvoidTerminalWriteFastPath } from "../terminal-runtime-utils";

describe("shouldAvoidTerminalWriteFastPath", () => {
  it("allows normal text and small interactive CSI", () => {
    expect(shouldAvoidTerminalWriteFastPath("hello")).toBe(false);
    expect(shouldAvoidTerminalWriteFastPath("\x1b[0m")).toBe(false);
    expect(shouldAvoidTerminalWriteFastPath("\x1b[32mok")).toBe(false);
    // Cursor moves / mouse-mode toggles alone must stay fast-path eligible.
    expect(shouldAvoidTerminalWriteFastPath("\x1b[H")).toBe(false);
    expect(shouldAvoidTerminalWriteFastPath("\x1b[?1000h\x1b[?1003h\x1b[?1006h")).toBe(false);
  });

  it("blocks erase-in-display (Grok focus clear)", () => {
    expect(shouldAvoidTerminalWriteFastPath("\x1b[2J")).toBe(true);
    expect(shouldAvoidTerminalWriteFastPath("\x1b[1J")).toBe(true);
    expect(shouldAvoidTerminalWriteFastPath("\x1b[0J")).toBe(true);
    expect(shouldAvoidTerminalWriteFastPath("\x1b[J")).toBe(true);
    expect(shouldAvoidTerminalWriteFastPath("\x1b[H\x1b[2J")).toBe(true);
    expect(shouldAvoidTerminalWriteFastPath("prefix\x1b[2Jsuffix")).toBe(true);
  });

  it("blocks RIS and alternate-screen switches", () => {
    expect(shouldAvoidTerminalWriteFastPath("\x1bc")).toBe(true);
    expect(shouldAvoidTerminalWriteFastPath("\x1b[?1049h")).toBe(true);
    expect(shouldAvoidTerminalWriteFastPath("\x1b[?1049l")).toBe(true);
    expect(shouldAvoidTerminalWriteFastPath("\x1b[?1047h")).toBe(true);
    expect(shouldAvoidTerminalWriteFastPath("\x1b[?47l")).toBe(true);
  });

  it("scans binary chunks without decoding as UTF-8", () => {
    const clear = new TextEncoder().encode("\x1b[2J");
    expect(shouldAvoidTerminalWriteFastPath(clear)).toBe(true);
    const color = new TextEncoder().encode("\x1b[31mred");
    expect(shouldAvoidTerminalWriteFastPath(color)).toBe(false);
    const alt = new TextEncoder().encode("\x1b[?1049h");
    expect(shouldAvoidTerminalWriteFastPath(alt)).toBe(true);
  });
});
