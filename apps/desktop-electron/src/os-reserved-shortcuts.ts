/**
 * Atmos product shortcuts that collide with OS-reserved hotkeys.
 *
 * macOS Screenshot.app owns ⌘⇧3/4/5 (and ⌘⇧6 on Touch Bar Macs) at the
 * system hotkey layer — the renderer never sees them unless the shell
 * claims the chord while Atmos is the active app.
 */

export type OsReservedShortcutChord = {
  /** Electron accelerator used by globalShortcut. */
  accelerator: string;
  /** sendInputEvent keyCode (same as the digit character). */
  keyCode: string;
  digit: number;
  modifiers: Array<"cmd" | "shift">;
};

const MACOS_SCREENSHOT_DIGITS = [3, 4, 5, 6] as const;

export function osReservedShortcutChords(
  platform: NodeJS.Platform = process.platform,
): OsReservedShortcutChord[] {
  if (platform !== "darwin") return [];
  return MACOS_SCREENSHOT_DIGITS.map((digit) => ({
    accelerator: `Command+Shift+${digit}`,
    keyCode: String(digit),
    digit,
    modifiers: ["cmd", "shift"],
  }));
}

export function isOsReservedHostDigit(
  digit: number,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return osReservedShortcutChords(platform).some((chord) => chord.digit === digit);
}

export function keyboardInputEventsForChord(chord: OsReservedShortcutChord): Array<{
  type: "keyDown" | "keyUp";
  keyCode: string;
  modifiers: Array<"cmd" | "shift">;
}> {
  const payload = { keyCode: chord.keyCode, modifiers: chord.modifiers };
  return [
    { type: "keyDown", ...payload },
    { type: "keyUp", ...payload },
  ];
}

export function chordForDigit(
  digit: number,
  platform: NodeJS.Platform = process.platform,
): OsReservedShortcutChord | null {
  return osReservedShortcutChords(platform).find((chord) => chord.digit === digit) ?? null;
}
