import { terminalShortcuts, type TerminalShortcut, wrapBracketedPaste } from "@atmos/shared/terminal";

export { terminalShortcuts, type TerminalShortcut, wrapBracketedPaste };

/** Visible order in the shortcut bar. Arrows and macOS editing combos lead. */
export const terminalBarShortcutIds = [
  "up",
  "down",
  "left",
  "right",
  "command-c",
  "command-v",
  "command-z",
  "esc",
  "at",
  "slash",
  "tab",
  "shift-tab",
  "enter",
  "shift-enter",
] as const;

export type TerminalBarShortcutId = (typeof terminalBarShortcutIds)[number];

export function getTerminalShortcutInput(shortcut: TerminalShortcut): string | null {
  if (shortcut.kind === "sequence") return shortcut.sequence;
  if (shortcut.kind === "text") return `${shortcut.insertText}${shortcut.submit ? "\r" : ""}`;
  return null;
}

export async function getTerminalPasteInput(getClipboardText: () => Promise<string>) {
  const text = await getClipboardText();
  if (!text) return null;
  return wrapBracketedPaste(text);
}
