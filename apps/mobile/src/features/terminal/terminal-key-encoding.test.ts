// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { encodeTerminalKey, NO_TERMINAL_MODIFIERS, type TerminalModifierState } from "./terminal-key-encoding";

const mods = (patch: Partial<TerminalModifierState>): TerminalModifierState => ({
  ...NO_TERMINAL_MODIFIERS,
  ...patch,
});

describe("encodeTerminalKey", () => {
  test("types plain letters, shifted letters, and shifted digits", () => {
    expect(encodeTerminalKey("a", NO_TERMINAL_MODIFIERS)).toEqual({ type: "input", data: "a" });
    expect(encodeTerminalKey("a", mods({ shift: true }))).toEqual({ type: "input", data: "A" });
    expect(encodeTerminalKey("a", NO_TERMINAL_MODIFIERS, true)).toEqual({ type: "input", data: "A" });
    expect(encodeTerminalKey("a", mods({ shift: true }), true)).toEqual({ type: "input", data: "a" });
    expect(encodeTerminalKey("1", mods({ shift: true }))).toEqual({ type: "input", data: "!" });
  });

  test("maps macOS command editing keys and control letters", () => {
    expect(encodeTerminalKey("c", mods({ command: true }))).toEqual({ type: "action", action: "copy" });
    expect(encodeTerminalKey("v", mods({ command: true }))).toEqual({ type: "action", action: "paste" });
    expect(encodeTerminalKey("z", mods({ command: true }))).toEqual({ type: "input", data: "\u001f" });
    expect(encodeTerminalKey("c", mods({ ctrl: true }))).toEqual({ type: "input", data: "\u0003" });
    expect(encodeTerminalKey("z", mods({ ctrl: true }))).toEqual({ type: "input", data: "\u001a" });
    expect(encodeTerminalKey("c", mods({ command: true, shift: true }))).toEqual({
      type: "input",
      data: "\u001b[67;10u",
    });
  });

  test("prefixes option and encodes arrows, enter, and tab with modifiers", () => {
    expect(encodeTerminalKey("a", mods({ option: true }))).toEqual({ type: "input", data: "\u001ba" });
    expect(encodeTerminalKey("up", NO_TERMINAL_MODIFIERS)).toEqual({ type: "input", data: "\u001b[A" });
    expect(encodeTerminalKey("up", mods({ ctrl: true }))).toEqual({ type: "input", data: "\u001b[1;5A" });
    expect(encodeTerminalKey("enter", NO_TERMINAL_MODIFIERS)).toEqual({ type: "input", data: "\r" });
    expect(encodeTerminalKey("enter", mods({ shift: true }))).toEqual({ type: "input", data: "\u001b[13;2u" });
    expect(encodeTerminalKey("tab", mods({ shift: true }))).toEqual({ type: "input", data: "\u001b[Z" });
    expect(encodeTerminalKey("space", mods({ ctrl: true }))).toEqual({ type: "input", data: "\u0000" });
    expect(encodeTerminalKey("backspace", mods({ ctrl: true }))).toEqual({ type: "input", data: "\u0017" });
  });

  test("sends function and navigation keys", () => {
    expect(encodeTerminalKey("f5", NO_TERMINAL_MODIFIERS)).toEqual({ type: "input", data: "\u001b[15~" });
    expect(encodeTerminalKey("home", NO_TERMINAL_MODIFIERS)).toEqual({ type: "input", data: "\u001b[H" });
    expect(encodeTerminalKey("delete", mods({ shift: true }))).toEqual({ type: "input", data: "\u001b[3;2~" });
    expect(encodeTerminalKey("missing", NO_TERMINAL_MODIFIERS)).toBeNull();
  });
});
