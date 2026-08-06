import { describe, expect, it } from "bun:test";
import {
  DEFAULT_TERMINAL_CURSOR_STYLE,
  parseTerminalCursorStyle,
} from "@/features/settings/store/terminal-appearance-settings-store";

describe("parseTerminalCursorStyle", () => {
  it("accepts xterm cursor styles", () => {
    expect(parseTerminalCursorStyle("block")).toBe("block");
    expect(parseTerminalCursorStyle("underline")).toBe("underline");
    expect(parseTerminalCursorStyle("bar")).toBe("bar");
  });

  it("falls back for invalid values", () => {
    expect(parseTerminalCursorStyle(undefined)).toBe(DEFAULT_TERMINAL_CURSOR_STYLE);
    expect(parseTerminalCursorStyle(null)).toBe(DEFAULT_TERMINAL_CURSOR_STYLE);
    expect(parseTerminalCursorStyle("beam")).toBe(DEFAULT_TERMINAL_CURSOR_STYLE);
    expect(parseTerminalCursorStyle(1)).toBe(DEFAULT_TERMINAL_CURSOR_STYLE);
  });
});
