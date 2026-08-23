import { describe, expect, test } from "bun:test";
import { shortcutToKeys } from "./shortcut-keys";

describe("shortcutToKeys", () => {
  test("splits Mac modifier chords into Atmos keycaps", () => {
    expect(shortcutToKeys("Cmd+V")).toEqual(["⌘", "V"]);
    expect(shortcutToKeys("Cmd+A")).toEqual(["⌘", "A"]);
    expect(shortcutToKeys("Cmd+'")).toEqual(["⌘", "'"]);
    expect(shortcutToKeys("Option+S")).toEqual(["⌥", "S"]);
    expect(shortcutToKeys("Option+Z")).toEqual(["⌥", "Z"]);
    expect(shortcutToKeys("Option+/")).toEqual(["⌥", "/"]);
    expect(shortcutToKeys("Shift+Option+C")).toEqual(["⇧", "⌥", "C"]);
  });

  test("keeps Ctrl as a compact chip on non-Mac chords", () => {
    expect(shortcutToKeys("Ctrl+V")).toEqual(["Ctrl", "V"]);
    expect(shortcutToKeys("Ctrl+Shift+G")).toEqual(["Ctrl", "⇧", "G"]);
    expect(shortcutToKeys("Alt+R")).toEqual(["⌥", "R"]);
  });

  test("maps named keys and ignores empty input", () => {
    expect(shortcutToKeys("Delete")).toEqual(["⌫"]);
    expect(shortcutToKeys("Enter")).toEqual(["↵"]);
    expect(shortcutToKeys("  ")).toEqual([]);
  });
});
