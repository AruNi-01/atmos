import { describe, expect, test } from "bun:test";
import { stripTerminalAnsi } from "./ansi";

describe("stripTerminalAnsi", () => {
  test("removes CSI colors and OSC titles", () => {
    const raw = "\u001b[32mhello\u001b[0m\u001b]0;title\u0007 world";
    expect(stripTerminalAnsi(raw)).toBe("hello world");
  });
});
