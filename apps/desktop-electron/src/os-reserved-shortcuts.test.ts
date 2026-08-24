import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chordForDigit,
  isOsReservedHostDigit,
  keyboardInputEventsForChord,
  osReservedShortcutChords,
} from "./os-reserved-shortcuts.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("os-reserved shortcuts", () => {
  it("claims macOS screenshot chords 3-6 and nothing on other platforms", () => {
    expect(osReservedShortcutChords("darwin").map((c) => c.digit)).toEqual([
      3, 4, 5, 6,
    ]);
    expect(osReservedShortcutChords("win32")).toEqual([]);
    expect(osReservedShortcutChords("linux")).toEqual([]);
    expect(isOsReservedHostDigit(3, "darwin")).toBe(true);
    expect(isOsReservedHostDigit(1, "darwin")).toBe(false);
    expect(isOsReservedHostDigit(3, "win32")).toBe(false);
  });

  it("replays cmd+shift+digit as keyDown then keyUp", () => {
    const chord = chordForDigit(4, "darwin");
    expect(chord?.accelerator).toBe("Command+Shift+4");
    expect(keyboardInputEventsForChord(chord!)).toEqual([
      { type: "keyDown", keyCode: "4", modifiers: ["cmd", "shift"] },
      { type: "keyUp", keyCode: "4", modifiers: ["cmd", "shift"] },
    ]);
  });

  it("native tap swallows the same ANSI keycodes as the JS catalog", () => {
    const src = readFileSync(
      join(here, "../native/host-shortcuts/host_shortcuts.c"),
      "utf8",
    );
    expect(src).toContain("VK_ANSI_3 = 0x14");
    expect(src).toContain("VK_ANSI_4 = 0x15");
    expect(src).toContain("VK_ANSI_5 = 0x17");
    expect(src).toContain("VK_ANSI_6 = 0x16");
    expect(src).toContain("kCGEventTapOptionDefault");
    expect(src).toContain("return NULL");
  });

  it("main process installs the guard at boot", () => {
    const main = readFileSync(join(here, "main.ts"), "utf8");
    expect(main).toContain("installAppShortcutGuard");
    const guard = readFileSync(join(here, "host-shortcuts.ts"), "utf8");
    expect(guard).toContain("did-resign-active");
    expect(guard).toContain("globalShortcut");
    expect(guard).toContain("libatmos_host_shortcuts.dylib");
  });
});
