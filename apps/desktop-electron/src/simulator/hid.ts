/** Minimal HID keyboard usages for CLI `type`. */
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

export function hidUsageForChar(ch: string): { usage: number; shift: boolean } | null {
  if (ch === " ") return { usage: 0x2c, shift: false };
  if (ch === "\n" || ch === "\r") return { usage: 0x28, shift: false };
  if (ch === ".") return { usage: 0x37, shift: false };
  if (ch === ",") return { usage: 0x36, shift: false };
  const lower = ch.toLowerCase();
  const letter = LETTERS.indexOf(lower);
  if (letter >= 0) return { usage: 0x04 + letter, shift: ch !== lower };
  if (ch >= "1" && ch <= "9") return { usage: 0x1e + (Number(ch) - 1), shift: false };
  if (ch === "0") return { usage: 0x27, shift: false };
  return null;
}
