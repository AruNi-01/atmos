import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chordForDigit,
  HOST_DIGIT_SHORTCUT_EVENT,
  isOsReservedHostDigit,
  osReservedShortcutChords,
  parseElectronInputDigitShortcut,
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

  it("notifies the renderer over IPC instead of synthesizing the key", () => {
    const chord = chordForDigit(4, "darwin");
    expect(chord?.accelerator).toBe("Command+Shift+4");
    expect(HOST_DIGIT_SHORTCUT_EVENT).toBe("host-shortcut");
    const guard = readFileSync(join(here, "host-shortcuts.ts"), "utf8");
    expect(guard).toContain("atmos:desktop-event:${HOST_DIGIT_SHORTCUT_EVENT}");
    expect(guard).not.toContain(".sendInputEvent(");
    expect(guard).toContain("before-input-event");
    expect(guard).toContain('getType() !== "webview"');
  });

  it("parses cmd/ctrl digit chords from Electron before-input-event", () => {
    expect(
      parseElectronInputDigitShortcut({
        type: "keyDown",
        code: "Digit4",
        key: "4",
        meta: true,
        shift: true,
      }),
    ).toEqual({ digit: 4, shift: true });
    expect(
      parseElectronInputDigitShortcut({
        type: "keyDown",
        code: "Digit1",
        key: "1",
        meta: true,
        shift: false,
      }),
    ).toEqual({ digit: 1, shift: false });
    expect(
      parseElectronInputDigitShortcut({
        type: "keyUp",
        code: "Digit4",
        meta: true,
        shift: true,
      }),
    ).toBeNull();
    expect(
      parseElectronInputDigitShortcut({
        type: "keyDown",
        code: "Digit4",
        meta: true,
        alt: true,
        shift: true,
      }),
    ).toBeNull();
    expect(
      parseElectronInputDigitShortcut({
        type: "keyDown",
        code: "Digit4",
        meta: true,
        shift: true,
        isAutoRepeat: true,
      }),
    ).toBeNull();
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
    expect(src).toContain("kCGEventKeyUp");
    expect(src).toContain("kCGKeyboardEventAutorepeat");
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
