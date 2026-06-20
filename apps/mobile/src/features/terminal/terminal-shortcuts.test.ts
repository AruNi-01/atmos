// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { getTerminalPasteInput, getTerminalShortcutInput, terminalShortcuts } from "./terminal-shortcuts";

describe("terminal shortcuts", () => {
  test("exposes the fixed modifier and navigation sequences required for mobile terminals", () => {
    const byId = new Map(terminalShortcuts.map((shortcut) => [shortcut.id, shortcut]));

    expect(getTerminalShortcutInput(byId.get("esc")!)).toBe("\u001b");
    expect(getTerminalShortcutInput(byId.get("tab")!)).toBe("\t");
    expect(getTerminalShortcutInput(byId.get("up")!)).toBe("\u001b[A");
    expect(getTerminalShortcutInput(byId.get("down")!)).toBe("\u001b[B");
    expect(getTerminalShortcutInput(byId.get("left")!)).toBe("\u001b[D");
    expect(getTerminalShortcutInput(byId.get("right")!)).toBe("\u001b[C");
    expect(getTerminalShortcutInput(byId.get("ctrl-c")!)).toBe("\u0003");
    expect(getTerminalShortcutInput(byId.get("ctrl-d")!)).toBe("\u0004");
    expect(getTerminalShortcutInput(byId.get("ctrl-l")!)).toBe("\u000c");
    expect(getTerminalShortcutInput(byId.get("ctrl-a")!)).toBe("\u0001");
    expect(getTerminalShortcutInput(byId.get("ctrl-e")!)).toBe("\u0005");
  });

  test("submits fixed agent interaction commands with carriage return", () => {
    const byId = new Map(terminalShortcuts.map((shortcut) => [shortcut.id, shortcut]));

    expect(getTerminalShortcutInput(byId.get("agent-continue")!)).toBe("continue\r");
    expect(getTerminalShortcutInput(byId.get("agent-yes")!)).toBe("yes\r");
    expect(getTerminalShortcutInput(byId.get("agent-no")!)).toBe("no\r");
  });

  test("keeps workspace and terminal operations as native actions, not terminal input", () => {
    const byId = new Map(terminalShortcuts.map((shortcut) => [shortcut.id, shortcut]));

    expect(getTerminalShortcutInput(byId.get("new-terminal")!)).toBeNull();
    expect(getTerminalShortcutInput(byId.get("paste")!)).toBeNull();
    expect(getTerminalShortcutInput(byId.get("switch-terminal")!)).toBeNull();
    expect(getTerminalShortcutInput(byId.get("workspace-list")!)).toBeNull();
  });

  test("wraps clipboard text for bracketed paste", async () => {
    await expect(getTerminalPasteInput(async () => "first\nsecond")).resolves.toBe("\x1b[200~first\rsecond\x1b[201~");
  });

  test("ignores empty clipboard text", async () => {
    await expect(getTerminalPasteInput(async () => "")).resolves.toBeNull();
  });
});
