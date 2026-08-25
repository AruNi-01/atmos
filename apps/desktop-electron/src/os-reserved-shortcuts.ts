/**
 * Atmos product shortcuts that collide with OS-reserved hotkeys.
 *
 * macOS Screenshot.app owns ⌘⇧3/4/5 (and ⌘⇧6 on Touch Bar Macs) at the
 * system hotkey layer — the renderer never sees them unless the shell
 * claims the chord while Atmos is the active app.
 *
 * After claiming, the shell notifies the renderer over IPC (`host-shortcut`)
 * instead of synthesizing a key event. Replaying ⌘⇧3/4 via sendInputEvent can
 * re-trigger Screenshot.app.
 */

export const HOST_DIGIT_SHORTCUT_EVENT = "host-shortcut";

export type OsReservedShortcutChord = {
  /** Electron accelerator used by globalShortcut. */
  accelerator: string;
  digit: number;
  modifiers: Array<"cmd" | "shift">;
};

export type HostDigitShortcutPayload = {
  digit: number;
  shift: boolean;
};

const MACOS_SCREENSHOT_DIGITS = [3, 4, 5, 6] as const;

export function osReservedShortcutChords(
  platform: NodeJS.Platform = process.platform,
): OsReservedShortcutChord[] {
  if (platform !== "darwin") return [];
  return MACOS_SCREENSHOT_DIGITS.map((digit) => ({
    accelerator: `Command+Shift+${digit}`,
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

export function chordForDigit(
  digit: number,
  platform: NodeJS.Platform = process.platform,
): OsReservedShortcutChord | null {
  return osReservedShortcutChords(platform).find((chord) => chord.digit === digit) ?? null;
}

export function digitFromCodeOrKey(input: {
  code?: string;
  key?: string;
}): number | null {
  const fromCode = input.code?.match(/^(?:Digit|Numpad)([0-9])$/);
  if (fromCode) return Number(fromCode[1]);
  const fromKey = input.key?.match(/^([0-9])$/);
  if (fromKey) return Number(fromKey[1]);
  return null;
}

export function parseElectronInputDigitShortcut(input: {
  type?: string;
  key?: string;
  code?: string;
  meta?: boolean;
  control?: boolean;
  alt?: boolean;
  shift?: boolean;
  isAutoRepeat?: boolean;
}): HostDigitShortcutPayload | null {
  if (input.type !== "keyDown") return null;
  if (input.isAutoRepeat) return null;
  if (input.alt) return null;
  if (!(input.meta || input.control)) return null;
  const digit = digitFromCodeOrKey(input);
  if (digit == null) return null;
  return { digit, shift: Boolean(input.shift) };
}
