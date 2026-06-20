import { terminalShortcuts, type TerminalShortcut, wrapBracketedPaste } from "@atmos/shared/terminal";

export { terminalShortcuts, type TerminalShortcut, wrapBracketedPaste };

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
